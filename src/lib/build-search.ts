import type {
  ArmorPiece,
  BuildResult,
  BuildSearchRequest,
  Charm,
  Decoration,
  GroupSkill,
  SetBonus,
  Skill,
  SkillMap,
  Weapon,
} from "@/types/build";
import { ARMOR_PARTS, ARMOR_PART_LABELS } from "@/types/build";
import {
  decorationsBySkill as defaultDecosBySkill,
  skillMax as defaultSkillMax,
} from "./data";
import type { GameData } from "./game-data";
import type { GameProfile } from "./game-profile";
import { isCraftable, type UnlockEntry } from "./unlocks";
import {
  applyFixedParts,
  buildCharmPool,
  buildEquipmentPools,
  buildWeaponPool,
  prunePools,
  type WorldArmorRelevance,
} from "./equipment-pools";
import { collectSlots, formatSlots } from "./slot-utils";
import {
  calculateSkills,
  clampSkillsToMax,
  computeGroupSkills,
  computeSetBonusSkills,
  mergeSkills,
  resolveDynamicSkillMax,
} from "./skill-calculator";
import { mergeMaxSkills, resolveAutoSkills } from "./preset-resolver";
import { formatWeaponStats } from "./weapon-utils";
import { solveDecorations, solveDecorationsWilds } from "./decoration-solver";
import { computeEfr, EFR_RELEVANT_SKILLS } from "./efr";

/**
 * World 專屬搜尋擴充（PLAN Phase 3）。存在時啟用 set bonus / 動態上限 / 護石候選池 /
 * 停用護石支配剪枝等 World 行為；`deps.world` 為 undefined 時（Rise）所有 World 分支
 * 短路，searchBuilds 走與改造前逐位元一致的路徑（由回歸基準保證）。
 */
export type WorldSearchExt = {
  profile: GameProfile;
  /** setBonusId → SetBonus，供 computeSetBonusSkills 統計件數觸發。 */
  setBonusById: Record<string, SetBonus>;
  /** 有 secret 的技能名（動態上限只需覆寫這些，實測 12 個）。 */
  secretSkillNames: readonly string[];
  /** 技能名 → Skill（原生上限/secretUnlockedBy/unlocksAllSecrets，供防具相關度判定）。 */
  skillByName: Record<string, Skill>;
  /** 護石候選（charmMode = craftable-list，取代 Rise 的使用者護石庫）。 */
  charmPool: Charm[];
  /**
   * 武器覺醒賦予的「虛擬 set bonus +1 件」（setBonusId → 額外件數）。固定武器模式下由
   * worker 依 worldWeaponAugment 注入；undefined＝無（一般 World 搜尋，行為不變）。
   */
  virtualSetBonus?: Record<string, number>;
};

/**
 * Wilds 專屬搜尋擴充（PLAN-wilds Phase 3）。存在時啟用珠雙池約束 / set+group 雙軌 /
 * 護石混合池 / efr-wilds；`deps.wilds` 為 undefined 時（Rise/World）所有 wilds 分支短路。
 * 結構比照 WorldSearchExt，另加 group 表與 skillKind（珠池分割用）。
 */
export type WildsSearchExt = {
  profile: GameProfile;
  /** setBonusId → SetBonus（含 Gogmazios 借用；件數統計吃 setBonusId ∪ extraSetBonusIds）。 */
  setBonusById: Record<string, SetBonus>;
  /** groupId → GroupSkill（3 件門檻，與 set 獨立雙軌）。 */
  groupById: Record<string, GroupSkill>;
  /** 有 secret 的技能名（Wilds 目前無 secret → 空；resolveSkillMax 回原生上限）。 */
  secretSkillNames: readonly string[];
  skillByName: Record<string, Skill>;
  /** 技能名 → 池別（weapon 技能進武器珠池，其餘進防具珠池）。 */
  skillKind: Record<string, "weapon" | "armor" | "group" | "set" | undefined>;
  /** 可生產護石候選（craftable-list 183，攤平逐級）；使用者護石庫另由 request.charms 帶入合併。 */
  charmPool: Charm[];
  /** 武器覺醒虛擬 set bonus +1 件（比照 World；固定武器模式）。 */
  virtualSetBonus?: Record<string, number>;
};

/** 可注入的資料相依（測試用）；預設使用本地 JSON。 */
export type SearchDeps = {
  armors: ArmorPiece[];
  armorById: Record<string, ArmorPiece>;
  decorationsBySkill: Record<string, Decoration[]>;
  skillMax: Record<string, number>;
  weaponById: Record<string, Weapon>;
  weapons: Weapon[];
  /** 解放條件資料（可選）。與 request.progress 同時給定時啟用進度篩選。 */
  unlocks?: Record<string, UnlockEntry>;
  /** World 專屬擴充（可選）。undefined＝Rise，所有 World 分支短路。 */
  world?: WorldSearchExt;
  /** Wilds 專屬擴充（可選）。undefined＝Rise/World，所有 wilds 分支短路。 */
  wilds?: WildsSearchExt;
};

/**
 * 由延遲載入的 GameData（防具 + 武器）搭配靜態小資料組出搜尋相依。
 * 可注入額外防具（例如傀異鍊成產生的自訂版本），與原始防具並存於候選池。
 */
export function createSearchDeps(
  gameData: GameData,
  extraArmors: ArmorPiece[] = [],
  /** 解放條件資料（loadUnlocks() 的 entries）；給定後 request.progress 才會生效。 */
  unlocks?: Record<string, UnlockEntry>
): SearchDeps {
  let armors = gameData.armors;
  let armorById = gameData.armorById;
  if (extraArmors.length > 0) {
    armors = [...gameData.armors, ...extraArmors];
    armorById = { ...gameData.armorById };
    for (const a of extraArmors) armorById[a.id] = a;
  }
  return {
    armors,
    armorById,
    weapons: gameData.weapons,
    weaponById: gameData.weaponById,
    decorationsBySkill: defaultDecosBySkill,
    skillMax: defaultSkillMax,
    ...(unlocks ? { unlocks } : {}),
  };
}

export type SearchMeta = {
  combosEvaluated: number;
  validBuilds: number;
  truncated: boolean;
  mode: string;
  candidatesPerPart: Record<string, number>;
  /** 參與搜尋的武器候選數（fixed 為 1；後援手動洞數為 0）。 */
  weaponsTried: number;
  /** 參與組合計算的護石數（不使用護石時為 0）。 */
  charmsTried: number;
  elapsedMs: number;
};

export type SearchOutput = {
  results: BuildResult[];
  meta: SearchMeta;
};

/** 內部候選緩衝（規格：內部保留 300~500 做二次排序）。 */
const INTERNAL_BUFFER = 500;
/** 防止資料變大後組合爆炸的硬上限（含護石維度的解算次數）。 */
const MAX_COMBOS = 300000;
/** 條件技能觸發率（傳入 EFR；校準時可調）。 */
const CONDITIONAL_UPTIME = 0.75;

/** 沒有護石時的佔位（不提供技能與洞位）。 */
const NO_CHARM: Charm = { skills: {}, slots: [] };

/**
 * 孔位支配：a 的孔位能否容納 b 的所有孔位（兩者皆須先降冪正規化、去零）。
 * 依 Hall 定理，降冪逐位比較即為最佳配對：a 至少和 b 一樣多孔，且每一位 ≥ b。
 */
function slotsDominate(a: number[], b: number[]): boolean {
  if (a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i] < b[i]) return false;
  }
  return true;
}

/**
 * 護石支配：a 是否在「每個相關技能等級」與「孔位」上都 ≥ b。
 * relevant = 必要技能 ∪ EFR 技能；非相關技能（純舒適/冷門）不影響配裝合法性與 EFR
 * 排名，故不列入比較，以剪掉更多冗餘護石（wiki-db 能吃數百顆護石即靠此）。
 * 成立時 b 為冗餘——任何用 b 的合法配裝換成 a 後，必要技能仍達成、EFR 不降、
 * 孔位不減，故 b 可安全剔除。代價僅：b 若帶有非相關的額外技能，該「賺到」的
 * 技能可能不再出現在結果中（EFR 與必要技能完全不受影響）。
 */
function charmDominates(
  a: Charm,
  aSlots: number[],
  b: Charm,
  bSlots: number[],
  relevant: ReadonlySet<string>
): boolean {
  for (const [skill, lvl] of Object.entries(b.skills)) {
    if (!relevant.has(skill)) continue;
    if ((a.skills[skill] ?? 0) < lvl) return false;
  }
  return slotsDominate(aSlots, bSlots);
}

/**
 * 護石支配剪枝：剔除被其他護石在相關技能與孔位上完全支配的冗餘護石。
 * 這是配裝器控制護石維度爆炸的經典手法——玩家囤的數十顆護石裡，大量是
 * 早期留下、被後期護石全面壓過的冗餘品，剪掉後不影響任何最優解。
 *
 * 依「相關技能總等級 + 孔位價值」由強到弱處理，逐一保留「未被任何已保留護石支配」者：
 * 因支配關係可遞移且較強者先處理，被支配者必有一顆已保留的護石支配它；
 * 完全相同的重複護石只會保留第一顆。
 */
export function pruneDominatedCharms(
  charms: Charm[],
  relevant: ReadonlySet<string>
): Charm[] {
  const items = charms.map((c) => ({
    c,
    slots: [...c.slots].filter((s) => s > 0).sort((x, y) => y - x),
  }));
  const strength = (it: (typeof items)[number]) => {
    let s = 0;
    for (const [skill, lvl] of Object.entries(it.c.skills)) {
      if (relevant.has(skill)) s += lvl;
    }
    for (const sl of it.slots) s += sl * 0.1;
    return s;
  };
  items.sort((a, b) => strength(b) - strength(a));
  const kept: typeof items = [];
  for (const it of items) {
    if (!kept.some((k) => charmDominates(k.c, k.slots, it.c, it.slots, relevant))) {
      kept.push(it);
    }
  }
  return kept.map((k) => k.c);
}

export function searchBuilds(
  request: BuildSearchRequest,
  deps: SearchDeps,
  /** 可傳入計時器；預設 0（避免非決定性，交由呼叫端量測亦可）。 */
  now: () => number = () => 0
): SearchOutput {
  const start = now();
  const {
    charms,
    fixedParts,
    excludedItems,
    requiredSkills,
    excludedSkills,
    reservedSlots,
    searchMode,
    resultLimit,
    weaponSearchMode,
    fixedWeaponId,
    autoRules,
    elementFilter,
    minDefense,
    minResistances,
  } = normalizeRequest(request);

  const excludedSet = new Set(excludedSkills);

  // 防禦/耐性過濾：只在有設定時才作用。耐性只檢查使用者有指定的屬性。
  const resFilter = Object.entries(minResistances) as [
    keyof typeof minResistances,
    number
  ][];

  // 屬性流：候選武器以屬性值優先
  const preferElement =
    request.preferElement ?? !!autoRules?.addElementAttackSkill;

  // 護石候選：World 與 Rise 走不同路徑。
  let charmCandidates: Charm[];
  let charmsTried: number;
  if (deps.world) {
    // World（charmMode = craftable-list）：由 charms.json 建候選池，走相關度裁切
    // （limit 12）、支援固定/排除；不做支配剪枝（features.charmDominancePruning=false，
    // 無隨機護石，剪枝無意義）。Rise 的護石庫路徑完全不受影響。
    const pool = buildCharmPool({
      charms: deps.world.charmPool,
      requiredSkills,
      excludedSkills: excludedSet,
      excludedCharmIds: excludedItems.charmIds ?? [],
      fixedCharmId: request.fixedCharmId,
      limit: 12,
    });
    charmCandidates = pool.length > 0 ? pool : [NO_CHARM];
    charmsTried = pool.length;
  } else if (deps.wilds) {
    // Wilds（charmMode = 混合）：可生產清單（相關度裁切）+ 使用者護石庫（request.charms，
    // Rise 式輸入，含 rarity/slotPools）。兩來源合併後同池參與搜尋（UI 輸入是 Phase 5，
    // 本輪走資料通路 + 引擎消費）。不做支配剪枝（比照 World）。
    const craftablePool = buildCharmPool({
      charms: deps.wilds.charmPool,
      requiredSkills,
      excludedSkills: excludedSet,
      excludedCharmIds: excludedItems.charmIds ?? [],
      fixedCharmId: request.fixedCharmId,
      limit: 12,
    });
    const userCharms = charms.filter(
      (c) => !Object.keys(c.skills).some((s) => excludedSet.has(s))
    );
    const merged = [...craftablePool, ...userCharms];
    charmCandidates = merged.length > 0 ? merged : [NO_CHARM];
    charmsTried = merged.length;
  } else {
    // Rise：帶有排除技能的護石直接跳過；清單為空（或全被排除）＝不使用護石。
    // 再做支配剪枝剔除冗餘護石（玩家常囤數十顆，多數被完全壓過），控制組合維度。
    const usableCharms = charms.filter(
      (c) => !Object.keys(c.skills).some((s) => excludedSet.has(s))
    );
    // 相關技能 = 必要技能 ∪ EFR 技能（含各屬性攻擊強化，故已涵蓋逐武器自動技能）。
    const relevantCharmSkills = new Set<string>([
      ...Object.keys(requiredSkills),
      ...EFR_RELEVANT_SKILLS,
    ]);
    const prunedCharms = pruneDominatedCharms(usableCharms, relevantCharmSkills);
    charmCandidates = prunedCharms.length > 0 ? prunedCharms : [NO_CHARM];
    charmsTried = prunedCharms.length;
  }

  // 進度解放篩選：request.progress 與 deps.unlocks 同時給定才啟用（旗標疊加，
  // 未啟用時行為與既有搜尋完全相同）。固定部位/武器照舊不受限。
  const progress = request.progress;
  const unlockMap = deps.unlocks;
  const craftable =
    progress && unlockMap
      ? (id: string) => isCraftable(unlockMap[id], progress)
      : undefined;

  // 武器候選池：fixed → 單一指定武器；search → 同類型武器依分數取前 N
  const weaponPool = buildWeaponPool({
    weapons: deps.weapons,
    weaponById: deps.weaponById,
    weaponType: request.weaponType,
    weaponSearchMode,
    fixedWeaponId,
    fixedPartsWeapon: fixedParts.weapon,
    excludedWeaponIds: excludedItems.weaponIds,
    requiredSkills,
    excludedSkills: excludedSet,
    mode: searchMode,
    elementFilter,
    preferElement,
    maxRarity: request.maxRarity,
    craftable,
  });
  // 後援：無任何武器候選（無資料或全被排除）時，退回舊版手動洞數
  const weaponCandidates: (Weapon | undefined)[] =
    weaponPool.length > 0 ? weaponPool : [undefined];
  const weaponFixed = weaponSearchMode === "fixed";

  // 防具基礎池：分組（依 rarity 上限/進度解放/排除技能限制）→ 排除 → 固定
  const basePools0 = buildEquipmentPools(
    deps.armors,
    excludedItems,
    request.maxRarity,
    craftable,
    excludedSet
  );
  const basePools = applyFixedParts(basePools0, fixedParts, deps.armorById);

  const candidatesPerPart: Record<string, number> = {};
  const buffer: BuildResult[] = [];
  let combos = 0;
  let valid = 0;
  let truncated = false;

  // EFR 模組：World 用 profile.efr（efr-world 逐級數值/斬味倍率）；Rise（deps.world
  // 為 undefined）用本檔靜態 import 的 efr.ts。gated by deps.world → Rise 路徑逐位元不變
  // （回歸背書）。修 Phase 4 遺留：profile.efr 先前未被 searchBuilds 消費，World 搜尋
  // 誤用 Rise EFR 排序。
  const computeEfrFn = deps.world
    ? deps.world.profile.efr.computeEfr
    : deps.wilds
      ? deps.wilds.profile.efr.computeEfr
      : computeEfr;

  // World：預算防具相關度所需的常量（不依 effRequired，故迴圈外算一次）。
  const worldGlobalUnlockers: string[] = deps.world
    ? Object.values(deps.world.skillByName)
        .filter((s) => s.unlocksAllSecrets)
        .map((s) => s.name)
    : [];
  const worldSetBonusSkillNames = new Set<string>();
  if (deps.world) {
    for (const sb of Object.values(deps.world.setBonusById)) {
      for (const r of sb.ranks) worldSetBonusSkillNames.add(r.skillName);
    }
  }

  weaponLoop: for (const weapon of weaponCandidates) {
    // 依武器屬性套用自動技能（硬條件：併入必要技能）
    const autoSkills = resolveAutoSkills(autoRules, weapon);
    const effRequired = mergeMaxSkills(requiredSkills, autoSkills);

    // World 防具相關度：必要技能等級超過原生上限時，收集可解放該 secret 的件之
    // 解放器名（專屬極意 + 全域 Inheritance），並標出「只由 set bonus 提供的必要技能」。
    // 使 prunePools 保留自身不帶目標技能、但 set bonus 才是價值的件（Fatalis 之於挑戰者7）。
    let worldRel: WorldArmorRelevance | undefined;
    if (deps.world) {
      const demandedUnlockers = new Set<string>();
      const requiredSetBonusSkills = new Set<string>();
      for (const [skill, lvl] of Object.entries(effRequired)) {
        const s = deps.world.skillByName[skill];
        if (s?.secretMaxLevel != null && lvl > s.maxLevel) {
          if (s.secretUnlockedBy) demandedUnlockers.add(s.secretUnlockedBy);
          for (const g of worldGlobalUnlockers) demandedUnlockers.add(g);
        }
        if (worldSetBonusSkillNames.has(skill)) requiredSetBonusSkills.add(skill);
      }
      worldRel = {
        setBonusById: deps.world.setBonusById,
        demandedUnlockers,
        requiredSetBonusSkills,
      };
    }

    // Wilds 防具相關度（mechanics #10 義務 b）：把「被要求、但由 set/group 提供」的技能標為
    // requiredSetBonusSkills，使 prunePools 保留自身不帶該技能、但經 setBonusId ∪ extraSetBonusIds
    // （Gogmazios 借用）或 groupId 才有價值的件。＝World「Fatalis 件裁切」教訓的 Wilds 對應。
    let wildsRel: WorldArmorRelevance | undefined;
    if (deps.wilds) {
      const requiredSetBonusSkills = new Set<string>();
      for (const skill of Object.keys(effRequired)) {
        const k = deps.wilds.skillKind[skill];
        if (k === "set" || k === "group") requiredSetBonusSkills.add(skill);
      }
      wildsRel = {
        setBonusById: deps.wilds.setBonusById,
        demandedUnlockers: new Set(), // Wilds 目前無 secret 解放路徑
        requiredSetBonusSkills,
        groupById: deps.wilds.groupById,
      };
    }

    const pools = prunePools(
      basePools,
      effRequired,
      searchMode,
      fixedParts,
      weaponCandidates.length,
      charmCandidates.length,
      worldRel ?? wildsRel
    );
    for (const part of ARMOR_PARTS) {
      candidatesPerPart[part] = pools[part].length;
    }

    const weaponSlots = weapon ? weapon.slots : (request.weaponSlots ?? []);
    const weaponSkills = weapon?.skills;

    const heads = pools.head;
    const chests = pools.chest;
    const armsArr = pools.arms;
    const waists = pools.waist;
    const legsArr = pools.legs;

    for (const head of heads) {
      for (const chest of chests) {
        for (const arms of armsArr) {
          for (const waist of waists) {
            for (const legs of legsArr) {
              const pieces: ArmorPiece[] = [head, chest, arms, waist, legs];

              // 防禦/耐性：由 5 件防具加總，與珠子/護石無關，故在昂貴的解算前先過濾。
              let totalDefense = 0;
              const totalResistances = {
                fire: 0,
                water: 0,
                thunder: 0,
                ice: 0,
                dragon: 0,
              };
              for (const p of pieces) {
                totalDefense += p.defense ?? 0;
                const er = p.elementRes;
                if (er) {
                  totalResistances.fire += er.fire;
                  totalResistances.water += er.water;
                  totalResistances.thunder += er.thunder;
                  totalResistances.ice += er.ice;
                  totalResistances.dragon += er.dragon;
                }
              }
              if (minDefense > 0 && totalDefense < minDefense) continue;
              let resOk = true;
              for (const [key, min] of resFilter) {
                if (totalResistances[key] < min) {
                  resOk = false;
                  break;
                }
              }
              if (!resOk) continue;

              // 防具技能與護石無關，每個防具組合只算一次
              const armorSkills = calculateSkills(pieces, undefined);

              // World：set bonus 技能 + 動態上限（僅依防具，每防具組合算一次）。
              // Rise（deps.world 為 undefined）短路：setBonusSkills 保持 undefined、
              // effSkillMax 保持 deps.skillMax 同參考，後續路徑與改造前逐位元一致。
              let setBonusSkills: SkillMap | undefined;
              let effSkillMax = deps.skillMax;
              if (deps.world?.profile.features.setBonus) {
                setBonusSkills = computeSetBonusSkills(
                  pieces,
                  deps.world.setBonusById,
                  deps.world.virtualSetBonus
                );
                effSkillMax = resolveDynamicSkillMax(
                  deps.skillMax,
                  setBonusSkills,
                  deps.world.profile.resolveSkillMax,
                  deps.world.secretSkillNames
                );
              } else if (deps.wilds?.profile.features.setBonus) {
                // Wilds 雙軌（mechanics #4/#10）：set（setBonusId ∪ extraSetBonusIds 聯集件數，
                // 門檻 [2,4]）+ group（groupId 件數，門檻 [3]）併入；兩軌互不干擾。
                setBonusSkills = mergeSkills(
                  computeSetBonusSkills(
                    pieces,
                    deps.wilds.setBonusById,
                    deps.wilds.virtualSetBonus
                  ),
                  computeGroupSkills(pieces, deps.wilds.groupById)
                );
                effSkillMax = resolveDynamicSkillMax(
                  deps.skillMax,
                  setBonusSkills,
                  deps.wilds.profile.resolveSkillMax,
                  deps.wilds.secretSkillNames
                );
              }

              for (const charm of charmCandidates) {
                combos++;
                if (combos > MAX_COMBOS) {
                  truncated = true;
                  break weaponLoop;
                }

                const baseCurrent = mergeSkills(
                  armorSkills,
                  mergeSkills(charm.skills, weaponSkills)
                );
                // World：併入 set bonus 觸發的技能（解放器 + 傷害技能）。
                const currentSkills = setBonusSkills
                  ? mergeSkills(baseCurrent, setBonusSkills)
                  : baseCurrent;
                const slots = collectSlots(pieces, charm, weaponSlots);

                // Wilds：珠雙池 → 池分割雙解（solveDecorationsWilds）；武器洞=weapon 池、
                // 5 防具洞=armor 池、護石洞依 slotPools 逐洞分池（craftable 無洞、只有使用者護石帶洞）。
                // Rise/World（deps.wilds undefined）走既有 solveDecorations，逐位元不變（回歸背書）。
                let solve;
                if (deps.wilds) {
                  const cSlots = charm.slots ?? [];
                  const cPools = charm.slotPools;
                  const weaponCharmSlots = cPools
                    ? cSlots.filter((_, i) => cPools[i] === "weapon")
                    : [];
                  const armorCharmSlots = cPools
                    ? cSlots.filter((_, i) => cPools[i] === "armor")
                    : cSlots; // 無 slotPools → 全歸防具池（craftable 無洞；僅影響未標池的使用者護石）
                  solve = solveDecorationsWilds({
                    weaponSlots: [...weaponSlots, ...weaponCharmSlots],
                    armorSlots: [
                      ...pieces.flatMap((p) => p.slots ?? []),
                      ...armorCharmSlots,
                    ],
                    currentSkills,
                    requiredSkills: effRequired,
                    reservedSlots,
                    decorationsBySkill: deps.decorationsBySkill,
                    skillMax: effSkillMax,
                    skillKind: deps.wilds.skillKind,
                  });
                } else {
                  solve = solveDecorations({
                    slots,
                    currentSkills,
                    requiredSkills: effRequired,
                    reservedSlots,
                    decorationsBySkill: deps.decorationsBySkill,
                    skillMax: effSkillMax,
                  });
                }

                if (!solve.success) continue; // 必要技能或保留洞位不符 → 淘汰

                // solve.achievedSkills = currentSkills + 所有珠子技能（含複合珠附贈）。
                // 對 Rise 單技能珠，等同 mergeSkills(currentSkills, 逐 assignment 累加)，
                // 逐位元一致（由回歸基準保證）；World 複合珠的第二技能亦正確納入。
                const finalSkills = clampSkillsToMax(
                  solve.achievedSkills,
                  effSkillMax
                );

                // 排除技能最終防線（候選池已預濾，這裡擋固定部位等漏網）
                if (
                  excludedSet.size > 0 &&
                  Object.keys(finalSkills).some(
                    (s) => excludedSet.has(s) && finalSkills[s] > 0
                  )
                ) {
                  continue;
                }

                valid++;
                const efr = weapon
                  ? computeEfrFn({
                      weapon,
                      skills: finalSkills,
                      conditionalUptime: CONDITIONAL_UPTIME,
                    })
                  : undefined;

                const result: BuildResult = {
                  id: `${weapon?.id ?? "custom"}|${head.id}|${chest.id}|${arms.id}|${waist.id}|${legs.id}|${charm.id ?? "none"}`,
                  weapon,
                  armor: { head, chest, arms, waist, legs },
                  charm,
                  decorations: solve.assignments,
                  finalSkills,
                  remainingSlots: solve.remainingSlots,
                  totalDefense,
                  totalResistances,
                  efr: {
                    raw: Math.round(efr?.raw ?? 0),
                    element: Math.round(efr?.element ?? 0),
                    total: Math.round(efr?.total ?? 0),
                  },
                  missingRequiredSkills: {},
                  meetsReservedSlots: true,
                  autoSkills: Object.keys(autoSkills).length
                    ? autoSkills
                    : undefined,
                  weaponFixed: weapon ? weaponFixed : undefined,
                  summary: "",
                };
                result.summary = formatBuildResult(result);
                buffer.push(result);
              }
            }
          }
        }
      }
    }
  }

  // 二次排序：預設依 EFR 綜合值（物理＋屬性）→ 取內部緩衝上限 → 最終 resultLimit
  buffer.sort((a, b) => b.efr.total - a.efr.total);
  const pooled = buffer.slice(0, INTERNAL_BUFFER);
  const limit = Math.min(resultLimit, 100);
  const results = pooled.slice(0, limit);

  return {
    results,
    meta: {
      combosEvaluated: combos,
      validBuilds: valid,
      truncated,
      mode: searchMode,
      candidatesPerPart,
      weaponsTried: weaponPool.length,
      charmsTried,
      elapsedMs: now() - start,
    },
  };
}

/** 補齊 request 缺省欄位，避免 undefined。 */
function normalizeRequest(req: BuildSearchRequest) {
  const fixedParts = req.fixedParts ?? {};
  const fixedWeaponId = req.fixedWeaponId ?? fixedParts.weapon;
  return {
    charms: req.charms ?? [],
    fixedParts,
    excludedItems: req.excludedItems ?? { armorIds: [], weaponIds: [] },
    requiredSkills: req.requiredSkills ?? {},
    excludedSkills: req.excludedSkills ?? [],
    reservedSlots: req.reservedSlots ?? { 4: 0, 3: 0, 2: 0, 1: 0 },
    searchMode: req.searchMode ?? "fast",
    resultLimit: req.resultLimit ?? 100,
    minDefense: req.minDefense ?? 0,
    minResistances: req.minResistances ?? {},
    // 相容舊請求：未指定模式時，有固定武器視為 fixed，否則 search
    weaponSearchMode:
      req.weaponSearchMode ?? (fixedWeaponId ? "fixed" : "search"),
    fixedWeaponId,
    autoRules: req.autoRules,
    elementFilter: req.elementFilter,
  };
}

/** 產生一段人類可讀的配裝摘要（也用於「複製配裝摘要」）。 */
export function formatBuildResult(build: BuildResult): string {
  const lines: string[] = [];
  if (build.weapon) {
    lines.push(
      `武器：${build.weapon.nameZh}（${formatSlots(build.weapon.slots)}）${formatWeaponStats(build.weapon)}`
    );
  }
  if (build.autoSkills && Object.keys(build.autoSkills).length) {
    lines.push(
      `自動技能：${Object.entries(build.autoSkills)
        .map(([n, l]) => `${n} Lv${l}`)
        .join("、")}`
    );
  }
  for (const part of ARMOR_PARTS) {
    const piece = build.armor[part];
    lines.push(
      `${ARMOR_PART_LABELS[part]}：${piece.nameZh}（${formatSlots(piece.slots)}）`
    );
  }
  const charmSkills = Object.entries(build.charm.skills)
    .map(([n, l]) => `${n}${l}`)
    .join("、");
  lines.push(
    `護石：${charmSkills || "無"}（${formatSlots(build.charm.slots)}）`
  );

  const r = build.totalResistances;
  lines.push(
    `防禦：${build.totalDefense}　耐性：火${r.fire} 水${r.water} 雷${r.thunder} 冰${r.ice} 龍${r.dragon}`
  );

  const topSkills = Object.entries(build.finalSkills)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n, l]) => `${n} Lv${l}`)
    .join("、");
  lines.push(`技能：${topSkills}`);

  if (build.decorations.length) {
    const decoText = summarizeDecorations(build.decorations);
    lines.push(`裝飾珠：${decoText}`);
  }
  lines.push(`剩餘洞位：${formatSlots(build.remainingSlots)}`);
  if (build.efr.raw > 0) {
    lines.push(
      `EFR：${build.efr.raw}${build.efr.element > 0 ? `　期望屬性值：${build.efr.element}` : ""}`
    );
  }
  return lines.join("\n");
}

/** 將珠子指派彙整成「珠名 ×n」的可讀字串。 */
export function summarizeDecorations(
  assignments: { decorationName: string }[]
): string {
  const counts: Record<string, number> = {};
  for (const a of assignments) {
    counts[a.decorationName] = (counts[a.decorationName] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, n]) => (n > 1 ? `${name}×${n}` : name))
    .join("、");
}
