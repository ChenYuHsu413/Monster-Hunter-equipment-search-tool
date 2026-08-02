import type { EfrInput, EfrResult } from "./efr";
import { EFR_RELEVANT_SKILLS as RISE_EFR_RELEVANT } from "./efr";

/**
 * ⚠️⚠️ efr-wilds-STUB — TEMP，Phase 4 整檔替換為 efr-wilds.ts ⚠️⚠️
 *
 * 本檔**不是成品**。存在的唯一目的：讓 Phase 3 的 searchBuilds 有一個 profile.efr 可呼叫、
 * 使 wilds 搜尋能跑完排序（buffer.sort by efr.total）。Phase 3 的驗收**明令禁止對 EFR 數值
 * 做斷言**（冒煙只驗技能達成/池合法性/計數），因為：
 *   - 斬味目前為 base=max 佔位值（匠 inactive，Phase 2 未考證 split），**本 stub 完全不碰斬味**；
 *   - 逐級數值（會心/攻擊/屬性技能）未機械抽取，本 stub 不建模技能加成。
 *
 * 模型（極簡，一句話）：EFR ≈ 顯示攻擊 × 期望會心倍率（超會心固定倍率），屬性直接取武器屬性值。
 * 禁止把它當基準、禁止據此下數值結論。Phase 4 會以 Wilds 資料 + 多源考證機械重建
 * （docs/wilds-sharpness-audit.md / efr-wilds-notes.md），與 efr.ts/efr-world.ts 同介面。
 */

/** 期望會心倍率：正會心以 (1.25 或超會心 1.30~1.40) 加權；負會心以 0.75 加權（極簡近似）。 */
function critMultiplier(affinity: number, superCrit: number): number {
  const p = Math.max(-100, Math.min(100, affinity)) / 100;
  const posMult = 1.25 + Math.min(3, Math.max(0, superCrit)) * 0.05; // 超會心 Lv1-3：+0.05/級
  if (p >= 0) return 1 + p * (posMult - 1);
  return 1 + p * (1 - 0.75); // 負會心
}

/** TEMP stub computeEfr（Phase 4 置換）。不碰斬味、不建模技能加成。 */
export function computeEfr(input: EfrInput): EfrResult {
  const { weapon, skills } = input;
  const effAttack = weapon.attack; // 顯示攻擊（不加技能，stub）
  const effAffinity = weapon.affinity;
  const critMult = critMultiplier(effAffinity, skills["超會心"] ?? 0);
  const raw = effAttack * critMult;
  const element = weapon.element?.value ?? 0;
  const total = raw + element * 0.25;
  return {
    raw: Math.round(raw),
    element: Math.round(element),
    total: Math.round(total),
    effAttack,
    effAffinity,
    critMult,
    sharpColor: "（stub 不計斬味）",
    sharpMult: 1,
  };
}

/** 沿用 Rise 的相關技能集（stub；Phase 4 依 Wilds 技能重定）。 */
export const EFR_RELEVANT_SKILLS: ReadonlySet<string> = RISE_EFR_RELEVANT;
