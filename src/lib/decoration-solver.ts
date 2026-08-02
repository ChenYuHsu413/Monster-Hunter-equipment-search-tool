import type {
  Decoration,
  DecorationAssignment,
  DecorationSolveResult,
  EquipmentPart,
  ReservedSlots,
  SkillMap,
} from "@/types/build";
import { normalizeSlots, placeDecoration, slotValue } from "./slot-utils";
import { mergeSkills, skillGaps } from "./skill-calculator";

export type SolveInput = {
  /** 已合併好的洞池（未正規化亦可，內部會正規化）。 */
  slots: number[];
  /** 補珠前的既有技能（防具 + 護石 + 武器）。 */
  currentSkills: SkillMap;
  requiredSkills: SkillMap;
  reservedSlots: ReservedSlots;
  /** 技能名稱 → 可用珠子清單（已依效率排序）。 */
  decorationsBySkill: Record<string, Decoration[]>;
  skillMax: Record<string, number>;
  /** 洞池來源標記（第一版統一標為 "mixed"，細分需要逐洞追蹤，MVP 從簡）。 */
  source?: EquipmentPart;
};

/**
 * 珠子對某技能的等級：複合珠取 skills[skill]；單技能珠退回 {skillName: skillLevel}。
 * Rise 珠子無 skills 欄，對其唯一技能回傳 skillLevel（與改造前一致）。
 */
function decoSkillLevel(d: Decoration, skill: string): number {
  return (d.skills ?? { [d.skillName]: d.skillLevel })[skill] ?? 0;
}

/** 珠子涵蓋的技能名集合（複合珠多個；單技能珠一個）。 */
function decoSkills(d: Decoration): Record<string, number> {
  return d.skills ?? { [d.skillName]: d.skillLevel };
}

/**
 * 複合珠的「附贈涵蓋數」：除目標技能外，還覆蓋幾個「仍需補的必要技能」。
 * 單技能珠（Rise，及 World 單技能珠）恆為 0——附贈項只有目標技能自身。
 */
function bonusCoverage(
  d: Decoration,
  skill: string,
  neededSkills: ReadonlySet<string>
): number {
  const eff = decoSkills(d);
  let n = 0;
  for (const k of Object.keys(eff)) {
    if (k !== skill && neededSkills.has(k)) n++;
  }
  return n;
}

/**
 * 從洞池挑選一顆最適合補指定技能的珠子（不 mutate slots）。
 * `preferCompound`（預設 true，＝改造前行為）：排序鍵把「附贈涵蓋」置於洞位大小之前，
 * 傾向優先取用能一次推進多個必要技能的複合珠。有界修復會以 `false` 再跑一次「偏好單珠」
 * （附贈項降到最後），以修正貪婪過度搶大洞給複合珠、餓死只有大洞可補之技能的次優。
 * Rise 珠附贈項恆為 0，兩種排序鍵對其結果**完全相同**（−bonus 為常數 0，位置不影響序）。
 */
function pickDecoForSkill(
  skill: string,
  gap: number,
  slots: number[],
  decorationsBySkill: Record<string, Decoration[]>,
  neededSkills: ReadonlySet<string>,
  preferCompound: boolean
): Decoration | null {
  const candidates = (decorationsBySkill[skill] ?? []).filter((d) =>
    slots.some((s) => s >= d.slotLevel)
  );
  if (candidates.length === 0) return null;

  // 目標：最省洞位。以「對缺口的有效覆蓋」為主；複合珠若同時覆蓋另一個仍需補的
  // 必要技能（2-in-1，省一洞）優先，其次用小洞、少浪費。
  // 附贈項對 Rise 單技能珠恆為 0，故排序鍵退化為原三元組，選擇與改造前逐位元一致。
  let best: Decoration | null = null;
  let bestKey: number[] | null = null;
  for (const d of candidates) {
    const lvl = decoSkillLevel(d, skill);
    const effective = Math.min(lvl, gap); // 有效覆蓋
    const overshoot = lvl - effective; // 浪費的等級
    const bonus = bonusCoverage(d, skill, neededSkills); // 附贈涵蓋（複合珠）
    // preferCompound（預設）：覆蓋大→附贈涵蓋多→洞小→浪費少（與改造前逐位元一致）。
    // 偏好單珠：覆蓋大→洞小→浪費少→附贈涵蓋多（附贈降到最後，避免搶大洞）。
    const key: number[] = preferCompound
      ? [-effective, -bonus, d.slotLevel, overshoot]
      : [-effective, d.slotLevel, overshoot, -bonus];
    if (!bestKey || lexLess(key, bestKey)) {
      bestKey = key;
      best = d;
    }
  }
  return best;
}

function lexLess(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/**
 * 嘗試從洞池中保留指定的洞位需求。
 * 高等級需求優先（較難滿足），每項以「能容納的最小洞」保留。
 * 回傳 { held, remaining } 或 null（無法保留）。
 */
function reserveSlots(
  slots: number[],
  reserved: ReservedSlots
): { held: number[]; remaining: number[] } | null {
  const work = [...slots];
  const held: number[] = [];
  for (const level of [4, 3, 2, 1] as const) {
    const need = reserved[level] ?? 0;
    for (let i = 0; i < need; i++) {
      // 找能容納 level 的最小洞
      let bestIdx = -1;
      let bestVal = Infinity;
      for (let j = 0; j < work.length; j++) {
        if (work[j] >= level && work[j] < bestVal) {
          bestVal = work[j];
          bestIdx = j;
        }
      }
      if (bestIdx === -1) return null;
      held.push(work[bestIdx]);
      work.splice(bestIdx, 1);
    }
  }
  return { held, remaining: work };
}

/**
 * 貪婪補珠核心（改造前的 solveDecorations 主體，行為未改，僅參數化 preferCompound）：
 * 1. 先補 requiredSkills；補不滿 → success:false（missingRequired 記錄缺口）
 * 2. 檢查 reservedSlots 是否仍能保留；不能 → success:false（保留洞位視為硬條件）
 * 3. 回傳所有指派、達成技能、剩餘洞位（含保留下來的空洞，留給玩家自由運用）
 */
function greedySolve(
  input: SolveInput,
  preferCompound = true
): DecorationSolveResult {
  const {
    currentSkills,
    requiredSkills,
    reservedSlots,
    decorationsBySkill,
    skillMax,
  } = input;
  const source: EquipmentPart = input.source ?? "head";

  let slots = normalizeSlots(input.slots);
  const assignments: DecorationAssignment[] = [];
  const achieved: SkillMap = {};

  const record = (d: Decoration, placedInSlotLevel: number) => {
    assignments.push({
      decorationId: d.id,
      decorationName: d.nameZh,
      skillName: d.skillName,
      skillLevel: d.skillLevel,
      slotLevel: d.slotLevel,
      placedInSlotLevel,
      source,
    });
    // 累加珠子的所有技能：複合珠雙技能各累加（附贈技能同樣計入 achieved，
    // 之後受上限截斷）。單技能珠退回 {skillName: skillLevel}，與改造前逐位元一致。
    const eff = decoSkills(d);
    for (const [sk, lv] of Object.entries(eff)) {
      achieved[sk] = (achieved[sk] ?? 0) + lv;
    }
  };

  // ---- 1. 必要技能 ----
  // 逐一補足缺口。每輪重算 gap（因為某些珠子可能一次補多級）。
  const requiredGaps = skillGaps(currentSkills, requiredSkills, skillMax);
  // 某技能距目標仍有缺口的等級數（受上限截斷）。
  const gapOf = (name: string) =>
    (skillMax[name] ? Math.min(requiredSkills[name], skillMax[name]) : requiredSkills[name]) -
    ((currentSkills[name] ?? 0) + (achieved[name] ?? 0));
  // 當前仍需補的必要技能集合（供複合珠附贈涵蓋判定；隨補珠動態變化，故每次重算）。
  const neededSet = (): ReadonlySet<string> => {
    const s = new Set<string>();
    for (const name of Object.keys(requiredSkills)) if (gapOf(name) > 0) s.add(name);
    return s;
  };
  for (const skill of Object.keys(requiredGaps)) {
    const gap = () => gapOf(skill);
    while (gap() > 0) {
      const deco = pickDecoForSkill(
        skill,
        gap(),
        slots,
        decorationsBySkill,
        neededSet(),
        preferCompound
      );
      if (!deco) {
        // 無法補滿必要技能
        return {
          success: false,
          assignments,
          achievedSkills: mergeSkills(currentSkills, achieved),
          remainingSlots: slots,
          missingRequired: skillGaps(
            mergeSkills(currentSkills, achieved),
            requiredSkills,
            skillMax
          ),
        };
      }
      const placed = placeDecoration(deco.slotLevel, slots);
      if (!placed) break; // 理論上不會發生（pick 已確認可放）
      record(deco, placed.placedInSlotLevel);
      slots = placed.remaining;
    }
  }

  // ---- 2. 保留洞位（硬條件）----
  const reserve = reserveSlots(slots, reservedSlots);
  if (!reserve) {
    return {
      success: false,
      assignments,
      achievedSkills: mergeSkills(currentSkills, achieved),
      remainingSlots: slots,
      missingRequired: {}, // 必要技能已達成，但保留洞位失敗
    };
  }
  // ---- 3. 回傳 ----
  // 剩餘洞位 = 自由洞 + 保留下來的空洞（都仍可供玩家使用）
  const remaining = normalizeSlots([...reserve.remaining, ...reserve.held]);
  return {
    success: true,
    assignments,
    achievedSkills: mergeSkills(currentSkills, achieved),
    remainingSlots: remaining,
    missingRequired: {},
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 有界交換後處理（PLAN-iceborne 尾巴 D）
//
// 動機（實測，非沿用 PLAN 假設）：貪婪的 bonusCoverage 排序其實**已能**在「兩必要技能可由
// 一顆複合珠同時推進」時選出複合珠（探測腳本證實 R 場景貪婪即成功）。真正殘留的次優是：
//  (E) 貪婪過度搶大洞給複合珠 → 餓死「只有大洞可補」的第三技能（貪婪失敗，改偏好單珠可解）；
//  (F) 多顆複合珠並存時，貪婪逐技能的短視挑法選錯首顆 → 需 depth-2 複合珠配對才可解。
// 故本修復同時涵蓋兩個方向（偏好單珠 alt + 複合珠 seed depth≤2），非僅 PLAN 所述單向。
// 詳見 CLAUDE.md「D：複合珠 solver」裁決與 docs 已知近似。
//
// 安全性保證：
//  - **只在貪婪失敗且候選珠含多技能珠（覆蓋 ≥2 必要技能）時啟動**。Rise 珠全單技能 →
//    relevantCompounds 恆空 → 立即回傳原貪婪結果（逐位元不變，回歸背書）。
//  - **只採用嚴格更優者**（(必要技能滿足數, 保留洞位可行, 剩餘洞位價值) 字典序），平手不換 →
//    絕不退化、決定性（同輸入同輸出）。
//  - 有界：偏好單珠 1 次 + 複合珠 seed 至多 depth-2，且 depth-2 僅在 depth-1 未救活時才試。
// ════════════════════════════════════════════════════════════════════════════

/**
 * 蒐集「覆蓋 ≥2 個必要技能」的複合珠（去重、依 id 排序 → 決定性）。
 * 這是修復的 gate 兼 seed 來源：唯有這類複合珠才可能造成 (E)/(F) 次優。
 * Rise（珠無 skills 欄）→ 恆空 → 修復整段短路。
 */
function relevantCompounds(input: SolveInput): Decoration[] {
  const required = input.requiredSkills;
  const seen = new Set<string>();
  const out: Decoration[] = [];
  for (const skill of Object.keys(required)) {
    for (const d of input.decorationsBySkill[skill] ?? []) {
      if (!d.skills) continue; // 單技能珠（含所有 Rise 珠）
      const keys = Object.keys(d.skills);
      if (keys.length < 2) continue;
      if (keys.filter((k) => k in required).length < 2) continue; // 需覆蓋 ≥2 必要技能
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** 已補到的必要技能數（受上限截斷）。 */
function metRequiredCount(r: DecorationSolveResult, input: SolveInput): number {
  let n = 0;
  for (const [s, target] of Object.entries(input.requiredSkills)) {
    const cap = input.skillMax[s] ? Math.min(target, input.skillMax[s]) : target;
    if ((r.achievedSkills[s] ?? 0) >= cap) n++;
  }
  return n;
}

/** 保留洞位是否仍可行（剩餘洞池能否容納 reservedSlots）。 */
function reservedOk(r: DecorationSolveResult, input: SolveInput): boolean {
  return reserveSlots(r.remainingSlots, input.reservedSlots) !== null;
}

/** 修復比較用的字典序度量：(必要技能滿足數, 保留洞位可行, 剩餘洞位價值)。 */
function metricTriple(r: DecorationSolveResult, input: SolveInput): number[] {
  return [
    metRequiredCount(r, input),
    reservedOk(r, input) ? 1 : 0,
    slotValue(r.remainingSlots),
  ];
}

/** a 是否嚴格優於 b（字典序）。平手回傳 false（→ 不交換，決定性）。 */
function strictlyBetter(
  a: DecorationSolveResult,
  b: DecorationSolveResult,
  input: SolveInput
): boolean {
  const ka = metricTriple(a, input);
  const kb = metricTriple(b, input);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] > kb[i];
  }
  return false;
}

/**
 * 先放入指定的 seed 複合珠（決定性順序），再以貪婪填補其餘缺口。
 * 任一 seed 放不下 → 回傳 null（此 seed 組合不可行）。
 */
function seedAndSolve(
  seeds: Decoration[],
  input: SolveInput
): DecorationSolveResult | null {
  const source: EquipmentPart = input.source ?? "head";
  let slots = normalizeSlots(input.slots);
  const seedAssignments: DecorationAssignment[] = [];
  let seeded = input.currentSkills;
  for (const d of seeds) {
    const placed = placeDecoration(d.slotLevel, slots);
    if (!placed) return null;
    slots = placed.remaining;
    seeded = mergeSkills(seeded, decoSkills(d));
    seedAssignments.push({
      decorationId: d.id,
      decorationName: d.nameZh,
      skillName: d.skillName,
      skillLevel: d.skillLevel,
      slotLevel: d.slotLevel,
      placedInSlotLevel: placed.placedInSlotLevel,
      source,
    });
  }
  // 其餘以貪婪（偏好複合）填補；seeded 已含 seed 技能，故不會重複補。
  const sub = greedySolve({ ...input, slots, currentSkills: seeded });
  return {
    success: sub.success,
    // sub.achievedSkills 已含 currentSkills + seed 技能 + sub 補的珠，故直接採用。
    assignments: [...seedAssignments, ...sub.assignments],
    achievedSkills: sub.achievedSkills,
    remainingSlots: sub.remainingSlots,
    missingRequired: sub.missingRequired,
  };
}

/** 改造前的純貪婪解（供自測「前後對照」；不含有界修復）。 */
export function greedySolveDecorations(input: SolveInput): DecorationSolveResult {
  return greedySolve(input, true);
}

// 效能對照/測試專用開關：生產環境恆為 true（應用碼絕不呼叫此 setter）。
// 供 perf 基準腳本以「關閉修復」量測貪婪-only 搜尋時間，對照修復後的增幅。
let repairEnabled = true;
/** @internal 僅供 bench/測試切換有界修復；預設啟用。 */
export function __setDecorationRepairEnabled(v: boolean): void {
  repairEnabled = v;
}

/**
 * 自動補珠：貪婪主流程 + 有界交換後處理（僅在貪婪失敗且有相關複合珠時啟動）。
 * Rise 與「無多技能珠覆蓋 ≥2 必要技能」的搜尋一律短路回傳貪婪結果（逐位元不變）。
 */
export function solveDecorations(input: SolveInput): DecorationSolveResult {
  const greedy = greedySolve(input, true);
  if (greedy.success || !repairEnabled) return greedy; // 貪婪已成功 → 不動（含 Rise 全部成功路徑）

  const compounds = relevantCompounds(input);
  if (compounds.length === 0) return greedy; // GATE：Rise / 無相關複合珠 → 短路

  let best = greedy;
  const consider = (cand: DecorationSolveResult | null) => {
    if (cand && strictlyBetter(cand, best, input)) best = cand;
  };

  // (E) 偏好單珠 alt：修正貪婪過度搶大洞給複合珠、餓死大洞技能的次優。
  consider(greedySolve(input, false));

  // (F) 複合珠 seed depth-1：強制先放某顆複合珠再貪婪填補。
  for (const c of compounds) consider(seedAndSolve([c], input));

  // depth-2 只在 depth-1 仍未救活時才試（有界，控制效能）。
  if (!best.success) {
    for (let i = 0; i < compounds.length; i++) {
      for (let j = i; j < compounds.length; j++) {
        consider(seedAndSolve([compounds[i], compounds[j]], input));
      }
    }
  }

  return best;
}

// ════════════════════════════════════════════════════════════════════════════
// Wilds 珠雙池補珠（PLAN-wilds Phase 3 改動點 1）
//
// 機制（Phase 0 定案 #2）：武器珠只吃武器洞、防具珠只吃防具洞（decoration.pool）。
// 實作策略＝**池分割雙解**：把洞池與必要技能按 weapon/armor 池切開，各池分別呼叫既有
// solveDecorations（含尾巴 D 有界修復）。因兩池獨立求解，**修復的交換天然不可能跨池**
// → §3.1「交換不得跨池」由結構滿足，尾巴 D 修復程式碼**一行未改**（逐位元凍結）。
//   - weaponSlots：武器洞 + 護石 weapon 池洞；armorSlots：5 防具洞 + 護石 armor 池洞。
//   - requiredSkills 依 skillKind 切：weapon 技能 → 武器池；其餘（armor/set/group）→ 防具池
//     （set/group 技能無珠、已由 currentSkills 提供，gap=0 時零消耗；未達成則該池 fail，正確）。
//   - reservedSlots 為池無關概念：各池以 reserved=0 補滿必要技能，再對**合併剩餘洞**做保留檢核。
// Rise/World 不呼叫此函式（build-search 僅 deps.wilds 分支選用）。
// ════════════════════════════════════════════════════════════════════════════

export type WildsSolveInput = {
  weaponSlots: number[];
  armorSlots: number[];
  currentSkills: SkillMap;
  requiredSkills: SkillMap;
  reservedSlots: ReservedSlots;
  decorationsBySkill: Record<string, Decoration[]>;
  skillMax: Record<string, number>;
  /** 技能名 → 池別（weapon 技能進武器池，其餘進防具池）。 */
  skillKind: Record<string, "weapon" | "armor" | "group" | "set" | undefined>;
};

/** 逐技能相減（a − b，僅保留正值）；用於合併雙池補珠增益不重複計 currentSkills。 */
function subtractSkills(a: SkillMap, b: SkillMap): SkillMap {
  const out: SkillMap = {};
  for (const [k, v] of Object.entries(a)) {
    const d = v - (b[k] ?? 0);
    if (d > 0) out[k] = d;
  }
  return out;
}

const NO_RESERVE: ReservedSlots = { 4: 0, 3: 0, 2: 0, 1: 0 };

export function solveDecorationsWilds(
  input: WildsSolveInput
): DecorationSolveResult {
  const wReq: SkillMap = {};
  const aReq: SkillMap = {};
  for (const [s, l] of Object.entries(input.requiredSkills)) {
    if (input.skillKind[s] === "weapon") wReq[s] = l;
    else aReq[s] = l; // armor / group / set / 未知 → 防具池（無珠者 gap=0 零消耗）
  }
  const base = {
    currentSkills: input.currentSkills,
    reservedSlots: NO_RESERVE,
    decorationsBySkill: input.decorationsBySkill,
    skillMax: input.skillMax,
  };
  const wSolve = solveDecorations({ ...base, slots: input.weaponSlots, requiredSkills: wReq });
  const aSolve = solveDecorations({ ...base, slots: input.armorSlots, requiredSkills: aReq });

  const assignments = [...wSolve.assignments, ...aSolve.assignments];
  const wAdded = subtractSkills(wSolve.achievedSkills, input.currentSkills);
  const aAdded = subtractSkills(aSolve.achievedSkills, input.currentSkills);
  const achievedSkills = mergeSkills(input.currentSkills, wAdded, aAdded);

  if (!wSolve.success || !aSolve.success) {
    return {
      success: false,
      assignments,
      achievedSkills,
      remainingSlots: normalizeSlots([...wSolve.remainingSlots, ...aSolve.remainingSlots]),
      missingRequired: mergeSkills(wSolve.missingRequired, aSolve.missingRequired),
    };
  }

  // 保留洞位：對兩池合併剩餘洞做檢核（池無關）。
  const combined = normalizeSlots([...wSolve.remainingSlots, ...aSolve.remainingSlots]);
  const reserve = reserveSlots(combined, input.reservedSlots);
  if (!reserve) {
    return { success: false, assignments, achievedSkills, remainingSlots: combined, missingRequired: {} };
  }
  return {
    success: true,
    assignments,
    achievedSkills,
    remainingSlots: normalizeSlots([...reserve.remaining, ...reserve.held]),
    missingRequired: {},
  };
}
