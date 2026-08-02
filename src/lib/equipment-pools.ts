import type {
  ArmorPiece,
  Charm,
  EquipmentPools,
  ExcludedItems,
  FixedParts,
  SetBonus,
  SkillMap,
  Weapon,
  WeaponElementFilter,
  WeaponSearchMode,
} from "@/types/build";
import { ARMOR_PARTS } from "@/types/build";
import { slotValue } from "./slot-utils";

/**
 * World 防具相關度上下文（PLAN Phase 3 改動點 3 的已知失敗模式修法）。
 * 相關度裁切原本只看件上技能，會剪掉「自身不帶目標技能、但 set bonus 才是價值」的件
 * （如 Fatalis 之於挑戰者 Lv7）。給定此 ctx 時：
 *  - demandedUnlockers：必要技能等級超過原生上限時，可解放該 secret 的件須保留。
 *  - requiredSetBonusSkills：被直接要求、但只由 set bonus 提供的技能（虛擬技能評分）。
 * Rise 不給此 ctx（防具無 setBonusId），行為與改造前逐位元一致。
 */
export type WorldArmorRelevance = {
  setBonusById: Record<string, SetBonus>;
  demandedUnlockers: ReadonlySet<string>;
  requiredSetBonusSkills: ReadonlySet<string>;
  /**
   * Wilds group 技能表（可選）。給定時，件的 groupId 貢獻的技能名亦納入相關度判定。
   * World 不給（undefined）→ group 相關度 inert，World 逐位元不變。
   */
  groupById?: Record<string, { ranks: Array<{ skillName: string }> }>;
};

/**
 * 該件經 set/group 提供的技能名（任一 rank）。
 * setBonusId + **extraSetBonusIds（Wilds Gogmazios 借用，mechanics #10 義務 b）** + groupId。
 * World 件無 extraSetBonusIds（[]）、rel 無 groupById → 僅 setBonusId，逐位元一致。
 */
function pieceSetBonusSkillNames(
  piece: ArmorPiece,
  setBonusById: Record<string, SetBonus>,
  groupById?: Record<string, { ranks: Array<{ skillName: string }> }>
): string[] {
  const names: string[] = [];
  const sb = piece.setBonusId ? setBonusById[piece.setBonusId] : undefined;
  if (sb) for (const r of sb.ranks) names.push(r.skillName);
  for (const e of piece.extraSetBonusIds ?? []) {
    const es = setBonusById[e];
    if (es) for (const r of es.ranks) names.push(r.skillName);
  }
  if (groupById && piece.groupId) {
    const g = groupById[piece.groupId];
    if (g) for (const r of g.ranks) names.push(r.skillName);
  }
  return names;
}

/** 該件的 set bonus 是否貢獻「需解放的 secret」或「被要求的 set bonus 技能」。 */
function pieceContributesSetBonus(
  piece: ArmorPiece,
  rel: WorldArmorRelevance
): boolean {
  const names = pieceSetBonusSkillNames(piece, rel.setBonusById, rel.groupById);
  return names.some(
    (n) => rel.demandedUnlockers.has(n) || rel.requiredSetBonusSkills.has(n)
  );
}

/** World set bonus 保留/評分加權（demanded unlock 給大權重確保進候選）。 */
function worldSetBonusBoost(
  piece: ArmorPiece,
  rel: WorldArmorRelevance
): number {
  const names = pieceSetBonusSkillNames(piece, rel.setBonusById, rel.groupById);
  let boost = 0;
  for (const n of names) {
    if (rel.demandedUnlockers.has(n)) boost += 100; // 解放件保留權重（必進候選）
    if (rel.requiredSetBonusSkills.has(n)) boost += 60; // 直接要求的 set bonus 技能
  }
  return boost;
}

/** 裝備是否帶有任一排除技能（排除技能為硬條件，直接踢出候選池）。 */
function hasExcludedSkill(
  skills: SkillMap | undefined,
  excludedSkills: Set<string>
): boolean {
  if (!skills || excludedSkills.size === 0) return false;
  for (const name of Object.keys(skills)) {
    if (excludedSkills.has(name)) return true;
  }
  return false;
}

/**
 * 依部位分組所有防具，並套用排除清單。
 * maxRarity 給定時，濾除 rarity 超過上限的防具（依 preset 階段限制取得門檻）；
 * craftable 給定時，濾除進度尚未解放的防具（解放條件精確篩選，見 unlocks.ts）；
 * excludedSkills 給定時，濾除帶有排除技能的防具；
 * 固定部位在 applyFixedParts 直接以 id 帶入，不受以上影響。
 */
export function buildEquipmentPools(
  armors: ArmorPiece[],
  excluded?: ExcludedItems,
  maxRarity?: number,
  craftable?: (id: string) => boolean,
  excludedSkills: Set<string> = new Set()
): EquipmentPools {
  const excludeSet = new Set(excluded?.armorIds ?? []);
  const pools = {
    head: [],
    chest: [],
    arms: [],
    waist: [],
    legs: [],
  } as EquipmentPools;
  for (const a of armors) {
    if (excludeSet.has(a.id)) continue;
    if (maxRarity != null && (a.rarity ?? 0) > maxRarity) continue;
    if (craftable && !craftable(a.id)) continue;
    if (hasExcludedSkill(a.skills, excludedSkills)) continue;
    if (pools[a.part]) pools[a.part].push(a);
  }
  return pools;
}

/** 從既有候選池再套用一次排除（用於結果卡片「排除此裝備」後重搜）。 */
export function applyExcludedItems(
  pools: EquipmentPools,
  excluded: ExcludedItems
): EquipmentPools {
  const excludeSet = new Set(excluded.armorIds);
  const out = {} as EquipmentPools;
  for (const part of ARMOR_PARTS) {
    out[part] = pools[part].filter((a) => !excludeSet.has(a.id));
  }
  return out;
}

/**
 * 套用固定部位：被固定的部位候選池收斂為單一指定裝備。
 * 找不到指定 id 時保留原池（避免搜尋直接無解，UI 另行提示）。
 */
export function applyFixedParts(
  pools: EquipmentPools,
  fixed: FixedParts,
  armorById: Record<string, ArmorPiece>
): EquipmentPools {
  const out = {} as EquipmentPools;
  for (const part of ARMOR_PARTS) {
    const fixedId = fixed[part];
    if (fixedId && armorById[fixedId]) {
      out[part] = [armorById[fixedId]];
    } else {
      out[part] = pools[part];
    }
  }
  return out;
}

/**
 * 單件裝備的啟發式分數（必要技能覆蓋 + 洞位彈性），
 * 用於 fast/greedy 模式候選篩選。只是粗略排序，不代表最終配裝優劣。
 */
export function scoreArmorPieceForRequired(
  piece: ArmorPiece,
  required: SkillMap
): number {
  let score = 0;
  for (const [skill, lvl] of Object.entries(piece.skills)) {
    if (required[skill]) score += lvl * 12;
  }
  // 洞位彈性：能容納珠子越多越好
  score += slotValue(piece.slots) * 1.5;
  return score;
}

/**
 * 針對 greedy 模式的排序鍵：優先「能補多少必要技能缺口」。
 */
export function requiredCoverageScore(
  piece: ArmorPiece,
  required: SkillMap
): number {
  let cover = 0;
  for (const [skill, lvl] of Object.entries(piece.skills)) {
    if (required[skill]) cover += lvl;
  }
  return cover;
}

/**
 * 依模式對候選池做裁切。
 * - exact：每部位保留啟發式分數前 12 名（見下方 limit）
 * - fast：每部位保留啟發式分數前 9 名
 * - greedy：每部位保留「必要覆蓋 + 分數」前 7 名（更小）
 */
export function prunePools(
  pools: EquipmentPools,
  requiredSkills: SkillMap,
  mode: "fast" | "exact" | "greedy",
  fixed: FixedParts,
  /** 參與搜尋的武器候選數。>1 時縮小每部位件數，讓總組合數（W × N^5）維持在可負荷範圍。 */
  weaponCount: number = 1,
  /** 護石候選數。多顆時解算次數 ×C，再縮小每部位件數以維持總量。 */
  charmCount: number = 1,
  /** World 防具相關度上下文（Rise 不給，行為與改造前逐位元一致）。 */
  worldRel?: WorldArmorRelevance
): EquipmentPools {
  // 每部位保留件數 limit：搜尋解算次數約為 weaponCount × limit^5 × charmCount，
  // 全防具庫每部位 300+ 件無法暴力枚舉，故各模式依相關度只留前 limit 名。
  //
  // 基準 limit（單一武器 vs 多武器候選 weaponCount>1，後者要再乘 W 故收緊）：
  //   模式      單武器  多武器
  //   greedy      7       6     （最激進，只顧補必要技能缺口）
  //   fast        9       7     （預設，速度與品質平衡）
  //   exact      12       9     （最寬，枚舉最多候選）
  let limit =
    weaponCount > 1
      ? mode === "greedy"
        ? 6
        : mode === "fast"
          ? 7
          : 9
      : mode === "greedy"
        ? 7
        : mode === "fast"
          ? 9
          : 12;

  // 護石維度安全網：護石已在 searchBuilds 先做支配剪枝，但非支配護石仍可能有十餘顆，
  // 每多一顆解算次數就 ×charmCount。目標把總解算量（≈ weaponCount × limit^5 × charmCount）
  // 壓在約 5~8 萬以內（單武器/多武器皆然），故護石數越多每部位再各減 1 件：
  //   charmCount >= 2 → -1
  //   charmCount >= 4 → 再 -1
  //   charmCount >= 8 → 再 -1
  // 最低保底 4 件（低於此結果品質過差）。支配剪枝通常把數十顆壓到十餘顆，
  // 落在 >=8 這檔（limit 收到 4），仍能穩定 <5s 完成。
  if (charmCount >= 2) limit -= 1;
  if (charmCount >= 4) limit -= 1;
  if (charmCount >= 8) limit -= 1;
  limit = Math.max(4, limit);

  // 相關技能集合（必要),用於預先濾除完全無關的裝備。
  const relevant = new Set(Object.keys(requiredSkills));

  const scoreOf = (piece: ArmorPiece) =>
    scoreArmorPieceForRequired(piece, requiredSkills) +
    (mode === "greedy"
      ? requiredCoverageScore(piece, requiredSkills) * 20
      : 0) +
    // World：set bonus 保留/評分加權（Rise worldRel 為 undefined → +0，逐位元一致）。
    (worldRel ? worldSetBonusBoost(piece, worldRel) : 0);

  const out = {} as EquipmentPools;
  for (const part of ARMOR_PARTS) {
    // 已固定的部位只有一件，不需裁切
    if (fixed[part]) {
      out[part] = pools[part];
      continue;
    }
    // 預先濾除：既無相關技能、洞位又少（<4)的裝備直接淘汰。
    // World：另保留「set bonus 貢獻需解放 secret / 被要求 set bonus 技能」的件
    // （Rise worldRel 為 undefined，此條恆 false，濾除與改造前逐位元一致）。
    const useful = pools[part].filter((p) => {
      const hasRel = Object.keys(p.skills).some((s) => relevant.has(s));
      const slotV = (p.slots ?? []).reduce((a, b) => a + b, 0);
      const sbRel = worldRel ? pieceContributesSetBonus(p, worldRel) : false;
      return hasRel || slotV >= 4 || sbRel;
    });
    const pool = useful.length ? useful : pools[part];
    out[part] = pool
      .map((piece) => ({ piece, score: scoreOf(piece) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.piece);
  }
  return out;
}

/** 五屬性集合（屬性流武器評分用）。 */
const FIVE_ELEMENTS = new Set(["fire", "water", "thunder", "ice", "dragon"]);

/**
 * 單把武器的啟發式分數（search 模式候選排序用）。
 * 攻擊/會心/洞位/自帶必要技能覆蓋綜合。
 * preferElement=true（屬性流 preset）時：以屬性值為主要排序依據（屬攻優先），
 * 並將無屬性/狀態異常武器大幅降權（屬性流用不到）。
 */
export function scoreWeaponForRequired(
  weapon: Weapon,
  required: SkillMap,
  preferElement = false
): number {
  let score = weapon.attack / 10 + weapon.affinity / 5;
  score += slotValue(weapon.slots) * 3;
  if (weapon.rampageSlot) score += weapon.rampageSlot;
  for (const [skill, lvl] of Object.entries(weapon.skills ?? {})) {
    if (required[skill]) score += lvl * 12;
  }
  if (preferElement) {
    const el = weapon.element;
    if (el && FIVE_ELEMENTS.has(el.type)) score += el.value * 2;
    else score -= 200; // 屬性流不推薦無屬性/狀態異常武器
  }
  return score;
}

/**
 * 建立武器候選池。
 * - fixed：只回傳指定武器（fixedWeaponId 優先，其次 fixedParts.weapon）；不受排除技能限制（使用者明示選擇）
 * - search：同 weaponType 的武器，套用排除清單與排除技能，依分數取前 N（控制組合數）
 * 回傳空陣列時由呼叫端後援（例如舊版手動洞數）。
 */
export function buildWeaponPool(opts: {
  weapons: Weapon[];
  weaponById: Record<string, Weapon>;
  weaponType: string;
  weaponSearchMode: WeaponSearchMode;
  fixedWeaponId?: string;
  fixedPartsWeapon?: string;
  excludedWeaponIds: string[];
  requiredSkills: SkillMap;
  /** 排除技能（硬條件）。 */
  excludedSkills?: Set<string>;
  mode: "fast" | "exact" | "greedy";
  /** 屬性篩選（僅五屬性）：search 模式只保留該屬性武器。未指定＝不限。 */
  elementFilter?: WeaponElementFilter;
  /** 屬性流 preset：候選排序以屬性值優先。 */
  preferElement?: boolean;
  /** 裝備 rarity 上限（依 preset 階段限制取得門檻）。固定武器不受限。 */
  maxRarity?: number;
  /** 進度解放篩選（見 unlocks.ts）。固定武器不受限。 */
  craftable?: (id: string) => boolean;
}): Weapon[] {
  const {
    weapons,
    weaponById,
    weaponType,
    weaponSearchMode,
    fixedWeaponId,
    fixedPartsWeapon,
    excludedWeaponIds,
    requiredSkills,
    excludedSkills = new Set(),
    mode,
    elementFilter,
    preferElement,
    maxRarity,
    craftable,
  } = opts;

  if (weaponSearchMode === "fixed") {
    const id = fixedWeaponId ?? fixedPartsWeapon;
    const w = id ? weaponById[id] : undefined;
    return w ? [w] : [];
  }

  const excluded = new Set(excludedWeaponIds);
  const candidates = weapons.filter(
    (w) =>
      w.weaponType === weaponType &&
      !excluded.has(w.id) &&
      (!elementFilter || w.element?.type === elementFilter) &&
      (maxRarity == null || (w.rarity ?? 0) <= maxRarity) &&
      (!craftable || craftable(w.id)) &&
      !hasExcludedSkill(w.skills, excludedSkills)
  );
  const cap = mode === "greedy" ? 2 : mode === "fast" ? 3 : 4;
  return candidates
    .map((w) => ({
      w,
      score: scoreWeaponForRequired(w, requiredSkills, preferElement),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map((x) => x.w);
}

/**
 * World 護石候選池（charmMode = craftable-list）。由 charms.json 建，走與防具相同的
 * 相關度裁切：以必要技能覆蓋計分，取前 limit（建議 12）。無覆蓋者對搜尋無益
 * （World 護石無孔）→ 淘汰。支援固定（只用該護石）/排除（濾掉指定 id）。
 * Rise 護石走使用者護石庫路徑，不呼叫此函式。
 */
export function buildCharmPool(opts: {
  charms: Charm[];
  requiredSkills: SkillMap;
  excludedSkills: Set<string>;
  excludedCharmIds: string[];
  fixedCharmId?: string;
  limit: number;
}): Charm[] {
  const {
    charms,
    requiredSkills,
    excludedSkills,
    excludedCharmIds,
    fixedCharmId,
    limit,
  } = opts;

  // 固定護石：只回傳指定護石（找不到則空，由呼叫端後援 NO_CHARM）。
  if (fixedCharmId) {
    const f = charms.find((c) => c.id === fixedCharmId);
    return f ? [f] : [];
  }

  const excl = new Set(excludedCharmIds);
  const usable = charms.filter(
    (c) =>
      !(c.id && excl.has(c.id)) &&
      !Object.keys(c.skills).some((s) => excludedSkills.has(s))
  );

  const scored = usable
    .map((c) => ({ c, score: charmRequiredScore(c, requiredSkills) }))
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.c);
}

/** 護石對必要技能的覆蓋分（相關度裁切用）。 */
function charmRequiredScore(charm: Charm, required: SkillMap): number {
  let s = 0;
  for (const [skill, lvl] of Object.entries(charm.skills)) {
    if (required[skill]) s += lvl;
  }
  return s;
}
