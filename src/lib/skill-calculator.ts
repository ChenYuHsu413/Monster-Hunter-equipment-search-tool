import type { ArmorPiece, Charm, GroupSkill, SetBonus, SkillMap, Weapon } from "@/types/build";

/** 合併多個 SkillMap（累加等級）。不 mutate 輸入。 */
export function mergeSkills(...maps: (SkillMap | undefined)[]): SkillMap {
  const out: SkillMap = {};
  for (const m of maps) {
    if (!m) continue;
    for (const [name, lvl] of Object.entries(m)) {
      out[name] = (out[name] ?? 0) + lvl;
    }
  }
  return out;
}

/**
 * 計算一套裝備（防具 + 護石 + 武器）在「未補珠」前的技能等級。
 * 珠子技能由 decoration-solver 之後再併入。
 */
export function calculateSkills(
  pieces: ArmorPiece[],
  charm: Charm | undefined,
  weapon?: Weapon
): SkillMap {
  return mergeSkills(
    ...pieces.map((p) => p.skills),
    charm?.skills,
    weapon?.skills
  );
}

/**
 * World：統計 5 件防具的 setBonusId 件數，回傳達門檻觸發的 set bonus 技能表。
 * 觸發的技能同時包含（a）傷害技能（如 真‧會心擊【屬性】）與（b）secret 解放器
 * （如 挑戰者‧極意、Inheritance）——後者不加傷害等級，但供 resolveSkillMax 判定動態上限。
 * Rise 防具無 setBonusId，呼叫端不會進此路徑。
 */
export function computeSetBonusSkills(
  pieces: ArmorPiece[],
  setBonusById: Record<string, SetBonus>,
  /**
   * 預先種入的件數（World 武器覺醒賦予的「虛擬 set bonus +1 件」）。Rise 不傳＝空，
   * counts 由 {} 起算，行為與改造前逐位元一致。
   */
  extraCounts?: Record<string, number>
): SkillMap {
  const counts: Record<string, number> = extraCounts ? { ...extraCounts } : {};
  for (const p of pieces) {
    if (p.setBonusId) counts[p.setBonusId] = (counts[p.setBonusId] ?? 0) + 1;
    // Wilds Gogmazios 擬態（mechanics #10 義務 a）：借用 set 併入件數聯集。
    // Rise/World 無此欄（undefined → []），迴圈零迭代，逐位元不變（回歸背書）。
    for (const e of p.extraSetBonusIds ?? []) counts[e] = (counts[e] ?? 0) + 1;
  }
  const skills: SkillMap = {};
  for (const [id, cnt] of Object.entries(counts)) {
    const sb = setBonusById[id];
    if (!sb) continue;
    for (const rank of sb.ranks) {
      if (cnt >= rank.pieces) {
        skills[rank.skillName] = (skills[rank.skillName] ?? 0) + rank.skillLevel;
      }
    }
  }
  return skills;
}

/**
 * Wilds：統計 5 件防具的 groupId 件數，回傳達門檻（Phase 0 定案恆 3 件）觸發的 group 技能表。
 * 與 set bonus 為**獨立雙軸**（mechanics #4/#10）。GroupSkill 沿用 SetBonus 的 ranks 形狀。
 * Rise/World 防具無 groupId，呼叫端（build-search wilds 分支）才進此路徑，其餘遊戲不呼叫。
 */
export function computeGroupSkills(
  pieces: ArmorPiece[],
  groupById: Record<string, GroupSkill>
): SkillMap {
  const counts: Record<string, number> = {};
  for (const p of pieces) {
    if (p.groupId) counts[p.groupId] = (counts[p.groupId] ?? 0) + 1;
  }
  const skills: SkillMap = {};
  for (const [id, cnt] of Object.entries(counts)) {
    const g = groupById[id];
    if (!g) continue;
    for (const rank of g.ranks) {
      if (cnt >= rank.pieces) {
        skills[rank.skillName] = (skills[rank.skillName] ?? 0) + rank.skillLevel;
      }
    }
  }
  return skills;
}

/**
 * World：依當前觸發的 set bonus 技能，動態解析技能上限。
 * 只覆寫「有 secret 的技能」（secretSkillNames，實測 12 個）；其餘沿用靜態上限，
 * 未觸發任何 secret 時回傳原 baseSkillMax（同參考，零額外配置）。
 * resolveSkillMax 由 profile 提供（封裝 world skillByName + 兩條解放路徑判定）。
 */
export function resolveDynamicSkillMax(
  baseSkillMax: Record<string, number>,
  setBonusSkills: SkillMap,
  resolveSkillMax: (skill: string, active: SkillMap) => number,
  secretSkillNames: readonly string[]
): Record<string, number> {
  let out: Record<string, number> | null = null;
  for (const name of secretSkillNames) {
    const dyn = resolveSkillMax(name, setBonusSkills);
    if (dyn !== baseSkillMax[name]) {
      out ??= { ...baseSkillMax };
      out[name] = dyn;
    }
  }
  return out ?? baseSkillMax;
}

/** 依技能上限截斷等級（超過上限的等級視為浪費，不計入）。 */
export function clampSkillsToMax(
  skills: SkillMap,
  skillMax: Record<string, number>
): SkillMap {
  const out: SkillMap = {};
  for (const [name, lvl] of Object.entries(skills)) {
    const max = skillMax[name];
    out[name] = max ? Math.min(lvl, max) : lvl;
  }
  return out;
}

/**
 * 計算距離目標技能還缺多少等級（gap）。
 * 已達成或超過的技能 gap 為 0。目標會先以 skillMax 截斷。
 */
export function skillGaps(
  current: SkillMap,
  target: SkillMap,
  skillMax: Record<string, number>
): SkillMap {
  const gaps: SkillMap = {};
  for (const [name, wanted] of Object.entries(target)) {
    const cap = skillMax[name] ?? wanted;
    const capped = Math.min(wanted, cap);
    const have = current[name] ?? 0;
    const gap = capped - have;
    if (gap > 0) gaps[name] = gap;
  }
  return gaps;
}

/** 是否已滿足所有必要技能。 */
export function meetsRequired(
  current: SkillMap,
  required: SkillMap,
  skillMax: Record<string, number>
): boolean {
  return Object.keys(skillGaps(current, required, skillMax)).length === 0;
}
