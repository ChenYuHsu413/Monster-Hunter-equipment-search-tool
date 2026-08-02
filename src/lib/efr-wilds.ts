import type { EfrInput, EfrResult } from "./efr";
import VALUES from "@/data/wilds/efr-skill-values.json";

/**
 * efr-wilds.ts — MH Wilds EFR 模型（Phase 4，與 efr.ts / efr-world.ts 同介面）。
 *
 * **數值來源全部機械抽取**（docs/efr-wilds-notes.md）：
 *  - 技能逐級值：`src/data/wilds/efr-skill-values.json`（`scripts/wilds/extract-efr-values.mjs`
 *    regex 抽自 mhdb skills 描述；與 Rise 多處不同，禁沿用前代）。
 *  - 斬味 base/max：weapons.json（Phase 4 考證：base=匠0、max=handicraft 延展，
 *    docs/wilds-sharpness-audit.md 全 947 把自洽）。
 *  - 攻擊尺度：weapon.attack = damage.raw（Kiranico 顯示值，推翻 Phase 2 的 display）。
 *
 * 期望倍率模型（sharpness audit §5 決策）：沿用「頂端 N 單位加權平均倍率」**形狀**
 * （非只取最高色），N = `WILDS_EXPECTED_SHARPNESS_USE`（暫 60，**待 Wilds 實測校準**）。
 * 匠：base↔max 依匠等級線性插值 → 頂端高色段變厚 → 物理 EFR 單調上升。
 */

// 斬味色→物理/屬性倍率：MH 系列社群傷害公式長期穩定值（Fextralife/社群；Wilds 未見官方改動證據）。
// 索引 0紅 1橙 2黃 3綠 4藍 5白 6紫。與 efr.ts 同值＝MH 系列標準，非沿用 Rise 特有數字（來源同上）。
const RAW_SHARP_MULT = [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39];
const ELEM_SHARP_MULT = [0.25, 0.5, 0.75, 1.0, 1.0625, 1.15, 1.25];
const SHARP_COLOR_ZH = ["紅", "橙", "黃", "綠", "藍", "白", "紫"];

/** 頂端使用單位數（World 為 60；Wilds v1 沿用形狀、獨立常數，待實測校準——禁當定值）。 */
const WILDS_EXPECTED_SHARPNESS_USE = 60;

// efr-skill-values.json（$ 前綴為 meta）。逐級陣列 index 0 = Lv1。
type ValTable = Record<string, Record<string, number[]>>;
const V = VALUES as unknown as ValTable;
/** 取技能 field 的 Lv 值（lv=0 → 0；陣列 Lv1-indexed）。 */
function val(skill: string, field: string, lv: number): number {
  if (lv <= 0) return 0;
  const arr = V[skill]?.[field];
  if (!arr) return 0;
  return arr[Math.min(lv, arr.length) - 1] ?? 0;
}

export const EFR_RELEVANT_SKILLS: ReadonlySet<string> = new Set([
  "攻擊", "看破", "弱點特效", "超會心", "匠", "會心擊【屬性】",
  "火屬性攻擊強化", "水屬性攻擊強化", "雷屬性攻擊強化", "冰屬性攻擊強化", "龍屬性攻擊強化",
  "挑戰者", "精神抖擻", "無傷",
]);

/** 依匠等級在 base↔max 間逐色線性插值，得生效斬味色帶。 */
function effectiveBands(
  sharpness: { base: number[]; max: number[] } | undefined,
  handicraftLv: number
): number[] | null {
  if (!sharpness) return null;
  const t = Math.min(Math.max(handicraftLv, 0), 5) / 5;
  return sharpness.base.map((b, i) => b + t * ((sharpness.max[i] ?? 0) - b));
}

/** 頂端 N 單位加權平均倍率（由最高色往下取 N 單位）。無斬味回中性黃(1.0)。 */
function expectedSharpMult(bands: number[] | null, mult: number[]): number {
  if (!bands) return 1.0;
  let remaining = WILDS_EXPECTED_SHARPNESS_USE;
  let acc = 0;
  let used = 0;
  for (let i = 6; i >= 0 && remaining > 0; i--) {
    if (bands[i] <= 0) continue;
    const take = Math.min(bands[i], remaining);
    acc += take * mult[i];
    used += take;
    remaining -= take;
  }
  return used > 0 ? acc / used : mult[2];
}

/** 生效斬味最高色索引（顯示用）。 */
function topSharpIndex(bands: number[] | null): number {
  if (!bands) return 2;
  for (let i = 6; i >= 0; i--) if (bands[i] > 0) return i;
  return 2;
}

/** 期望會心倍率：正會心以會心傷害計，負會心以 −25% 計。 */
function expectedCritMult(affinity: number, critDmg: number): number {
  const a = Math.min(affinity, 100) / 100;
  if (a >= 0) return 1 + a * (critDmg - 1);
  return 1 + a * 0.25;
}

const ELEM_SKILL: Record<string, string> = {
  fire: "火屬性攻擊強化", water: "水屬性攻擊強化", thunder: "雷屬性攻擊強化",
  ice: "冰屬性攻擊強化", dragon: "龍屬性攻擊強化",
};

export function computeEfr(input: EfrInput): EfrResult {
  const { weapon, skills } = input;
  const uptime = input.conditionalUptime ?? 0.75;
  const weakpoint = input.assumeWeakpoint ?? true;
  const lv = (n: string) => skills[n] ?? 0;

  // ---- 攻擊力（attack = damage.raw，Wilds 顯示尺度）----
  const pct = val("攻擊", "pct", lv("攻擊"));
  let flat = val("攻擊", "flat", lv("攻擊"));
  flat += val("挑戰者", "atk", lv("挑戰者")) * uptime; // 條件：發怒
  flat += val("無傷", "atk", lv("無傷")) * uptime; // 條件：HP 全滿
  const effAttack = weapon.attack * (1 + pct) + flat;

  // ---- 會心率 ----
  let aff = weapon.affinity;
  aff += val("看破", "aff", lv("看破"));
  if (weakpoint) aff += val("弱點特效", "aff", lv("弱點特效"));
  aff += val("挑戰者", "aff", lv("挑戰者")) * uptime;
  aff += val("精神抖擻", "aff", lv("精神抖擻")) * uptime; // 條件：耐力滿

  // 超會心：抽取值為「會心傷害加成%」（描述 to N% → N/100，如 Lv5=0.40）→ 倍率 = 1+加成。
  // 無超會心＝標準會心 +25%（倍率 1.25）。
  const critDmg = lv("超會心") > 0 ? 1 + val("超會心", "critDmg", lv("超會心")) : 1.25;
  const critMult = expectedCritMult(aff, critDmg);

  // ---- 斬味（base↔max 匠插值 → 頂端 N 單位加權）----
  const bands = effectiveBands(weapon.sharpness, lv("匠"));
  const sharpMult = expectedSharpMult(bands, RAW_SHARP_MULT);
  const topIdx = topSharpIndex(bands);

  const raw = effAttack * sharpMult * critMult;

  // ---- 屬性 ----
  let element = 0;
  if (weapon.element && weapon.element.value > 0) {
    const skillName = ELEM_SKILL[weapon.element.type];
    const elLv = skillName ? lv(skillName) : 0;
    const elBase =
      weapon.element.value * (1 + (skillName ? val(skillName, "pct", elLv) : 0)) +
      (skillName ? val(skillName, "flat", elLv) : 0);
    const elSharp = expectedSharpMult(bands, ELEM_SHARP_MULT);
    const critElem = lv("會心擊【屬性】") > 0
      ? (V["會心擊【屬性】"]?.elemCritMult as number[])[Math.min(lv("會心擊【屬性】"), 3) - 1]
      : 1;
    const aPos = Math.max(0, Math.min(aff, 100)) / 100;
    const elCritMult = 1 + aPos * (critElem - 1);
    element = elBase * elSharp * elCritMult;
  }

  const total = raw + element * 4.0;

  return {
    raw, element, total, effAttack, effAffinity: aff, critMult,
    sharpColor: SHARP_COLOR_ZH[topIdx], sharpMult,
  };
}
