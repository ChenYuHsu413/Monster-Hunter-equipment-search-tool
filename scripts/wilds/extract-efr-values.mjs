/**
 * Wilds EFR 相關技能逐級值 **機械抽取**（Phase 4；硬編禁止 → 由 mhdb skills 描述 regex 推導）。
 * 產出 src/data/wilds/efr-skill-values.json，供 efr-wilds.ts import（重跑安全、可驗證）。
 *   node scripts/wilds/extract-efr-values.mjs
 *
 * 抽取自 `.cache/skills.en.json` 的 rank.description（EN 較 regex 穩定）。逐級值與 Rise 多處不同
 * （攻擊/看破/WEX/超會心/無傷…），故**禁沿用前代**，一律由本輪資料抽取。
 * 無法從描述抽數的定性技能（會心擊【屬性】）以社群傷害公式值補，`$source` 標記出處。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(readFileSync(path.join(HERE, ".cache", "skills.en.json"), "utf8"));
const zh = JSON.parse(readFileSync(path.join(HERE, ".cache", "skills.zh-Hant.json"), "utf8"));
const zhById = new Map(zh.map((s) => [s.id, s]));
const byEn = new Map(en.map((s) => [s.name, s]));

/** 取某技能逐級描述，回傳 { zhName, ranks:[{level,desc}] }。 */
function ranks(enName) {
  const s = byEn.get(enName);
  if (!s) return null;
  return { zhName: zhById.get(s.id)?.name, ranks: s.ranks.map((r) => ({ level: r.level, desc: r.description || "" })) };
}
/** 逐級抽一個數（regex 對 desc），回傳 [lv1..lvN] 陣列（機械抽取）。 */
function extract(enName, re, transform = (x) => x) {
  const r = ranks(enName);
  if (!r) return null;
  return r.ranks.map((x) => {
    const m = x.desc.match(re);
    return m ? transform(Number(m[1])) : 0;
  });
}

const out = { $source: "mhdb-wilds skills 描述機械抽取（node scripts/wilds/extract-efr-values.mjs）", $note: "逐級值 index 0 = Lv1；未持有 = 0（efr-wilds 以 at() 存取）。" };

// 攻擊：flat「Attack +N」+ pct「Attack +N%」（Lv4/5 為 +N% Bonus: +M，兩者並存）。
out["攻擊"] = {
  flat: extract("Attack Boost", /Bonus:\s*\+(\d+)/) // Lv4/5 的 Bonus flat
    .map((b, i) => b || (ranks("Attack Boost").ranks[i].desc.match(/Attack \+(\d+)(?!%)/)?.[1] ?? 0))
    .map(Number),
  pct: extract("Attack Boost", /Attack \+(\d+)%/, (x) => x / 100),
};
// 看破：Affinity +N%
out["看破"] = { aff: extract("Critical Eye", /Affinity \+(\d+)%/) };
// 弱點特效：Lv1-3「affinity +N%」、Lv4-5「N% increased affinity」（兩式並存）。
out["弱點特效"] = {
  aff: ranks("Weakness Exploit").ranks.map((x) => {
    const m = x.desc.match(/affinity \+(\d+)%/i) || x.desc.match(/(\d+)% increased affinity/i);
    return m ? Number(m[1]) : 0;
  }),
};
// 超會心：critical hits to N%（會心傷害倍率 = N/100；無技能基準 1.25）
out["超會心"] = { critDmg: extract("Critical Boost", /to (\d+)%/, (x) => x / 100) };
// 挑戰者：Attack +N and affinity +M%
out["挑戰者"] = {
  atk: extract("Agitator", /Attack \+(\d+)/),
  aff: extract("Agitator", /affinity \+(\d+)%/),
};
// 精神抖擻（Max Might）：Affinity +N%
out["精神抖擻"] = { aff: extract("Maximum Might", /Affinity \+(\d+)%/) };
// 無傷：Attack +N
out["無傷"] = { atk: extract("Peak Performance", /Attack \+(\d+)/) };
// 匠：Weapon sharpness +N（驗證 +10/級；斬味模型用，EFR 匠插值另由 sharpness base/max）
out["匠"] = { sharp: extract("Handicraft", /sharpness \+(\d+)/) };
// 會心擊【屬性】：定性描述（slightly/greatly），無數字 → 社群傷害公式值（點名）。
out["會心擊【屬性】"] = {
  $qualitative: true,
  $source: "描述定性無數字；採 MH 系列社群傷害公式屬性會心倍率（Fextralife/社群）",
  elemCritMult: [1.05, 1.1, 1.15],
};
// 屬性攻擊強化（五屬）：Elemental attack +N (+M%)——抽 flat 與 pct。
for (const [zhk, enk] of [["火屬性攻擊強化", "Fire Attack"], ["水屬性攻擊強化", "Water Attack"], ["雷屬性攻擊強化", "Thunder Attack"], ["冰屬性攻擊強化", "Ice Attack"], ["龍屬性攻擊強化", "Dragon Attack"]]) {
  const r = ranks(enk);
  if (!r) continue;
  out[zhk] = {
    // flat：優先「Bonus: +M」（Lv2+），否則「attack +N」不接 %（Lv1）。
    flat: r.ranks.map((x) => {
      const b = x.desc.match(/Bonus:\s*\+(\d+)/);
      if (b) return Number(b[1]);
      const f = x.desc.match(/attack \+(\d+)(?!%)/i);
      return f ? Number(f[1]) : 0;
    }),
    pct: r.ranks.map((x) => Number(x.desc.match(/attack \+(\d+)%/i)?.[1] ?? 0) / 100),
  };
}

const OUT = path.resolve(HERE, "..", "..", "src", "data", "wilds", "efr-skill-values.json");
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("[extract-efr-values] 產出 efr-skill-values.json");
for (const [k, v] of Object.entries(out)) if (!k.startsWith("$")) console.log("  " + k + ":", JSON.stringify(v));
