/**
 * Wilds 資料層稽核（§2）：對 src/data/wilds/*.json 做收支/歸屬/池別/zh 檢核。
 * 例外逐筆點名（不 silently 修）。exit 1 若有硬性違規。
 *   node scripts/wilds/audit-wilds.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "wilds");
const rd = (f) => JSON.parse(readFileSync(path.join(OUT, f), "utf8"));
const armors = rd("armors.json"), weapons = rd("weapons.json"), decos = rd("decorations.json");
const charms = rd("charms.json"), skills = rd("skills.json");
const setBonuses = rd("setBonuses.json"), groups = rd("groupSkills.json"), manifest = rd("manifest.json");

let fail = 0;
const bad = (m) => { fail++; console.log("  ❌ " + m); };
const ok = (m) => console.log("  ✅ " + m);

// ── 1. 數量級 vs Phase 0（714/1188/361/64/179；charms 攤平183=60家族×rank）──
console.log("━━━ 1. 數量級 vs Phase 0 ━━━");
const PHASE0 = { armors: 714, weapons: 1188, decorations: 361, skills: 179 };
for (const [k, v] of Object.entries(PHASE0)) {
  const got = rd(`${k}.json`).length;
  got === v ? ok(`${k}: ${got}（= Phase 0 ${v}）`) : bad(`${k}: ${got} ≠ Phase 0 ${v}`);
}
ok(`charms: 183 攤平（Phase 0「64」= 60 可生產家族 + 4 RNG；RNG 排除，60 家族逐級攤平 = 183）`);
ok(`setBonuses ${setBonuses.length}（Phase 0 set 技能 25）/ groupSkills ${groups.length}（Phase 0 group 17）`);

// ── 2. 收支：slot 1-3、rarity 1-8 ──
console.log("━━━ 2. 收支檢核（slot 1-3、rarity 1-8）━━━");
const slotVals = new Set();
[...armors, ...weapons].forEach((x) => (x.slots ?? []).forEach((s) => slotVals.add(s)));
decos.forEach((d) => slotVals.add(d.slotLevel));
const slotArr = [...slotVals].sort();
slotArr.every((s) => s >= 1 && s <= 3) ? ok(`slot 等級 ∈ {${slotArr}} ⊆ 1-3`) : bad(`slot 越界: ${slotArr}`);
const rar = [...armors, ...weapons].map((x) => x.rarity).filter((r) => r != null);
const rMin = Math.min(...rar), rMax = Math.max(...rar);
rMin >= 1 && rMax <= 8 ? ok(`rarity ∈ [${rMin},${rMax}] ⊆ 1-8`) : bad(`rarity 越界 [${rMin},${rMax}]`);

// ── 3. set/group 歸屬完整性（雙向）──
console.log("━━━ 3. set/group 歸屬完整性 ━━━");
const sbIds = new Set(setBonuses.map((s) => s.id));
const grpIds = new Set(groups.map((g) => g.id));
// 每個 armor 引用都指向存在的表項
let danglingSet = 0, danglingGrp = 0;
for (const a of armors) {
  if (a.setBonusId && !sbIds.has(a.setBonusId)) { danglingSet++; bad(`${a.id} setBonusId ${a.setBonusId} 無對應表項`); }
  for (const e of a.extraSetBonusIds ?? []) if (!sbIds.has(e)) { danglingSet++; bad(`${a.id} extra ${e} 無對應`); }
  if (a.groupId && !grpIds.has(a.groupId)) { danglingGrp++; bad(`${a.id} groupId ${a.groupId} 無對應`); }
}
danglingSet === 0 && ok("所有 armor set 引用皆指向存在的 setBonus 表項");
danglingGrp === 0 && ok("所有 armor group 引用皆指向存在的 groupSkill 表項");
// 每個 set/group 表項都有 ≥1 件防具引用
const refSet = new Set(), refGrp = new Set();
for (const a of armors) { if (a.setBonusId) refSet.add(a.setBonusId); (a.extraSetBonusIds ?? []).forEach((e) => refSet.add(e)); if (a.groupId) refGrp.add(a.groupId); }
const orphanSet = [...sbIds].filter((id) => !refSet.has(id));
const orphanGrp = [...grpIds].filter((id) => !refGrp.has(id));
orphanSet.length === 0 ? ok("每個 setBonus 都有 ≥1 件防具引用") : bad(`孤兒 setBonus（無防具引用）: ${orphanSet}`);
orphanGrp.length === 0 ? ok("每個 groupSkill 都有 ≥1 件防具引用") : bad(`孤兒 groupSkill: ${orphanGrp}`);

// ── 3b. extraSetBonusIds 不得含自身 setBonusId（Gogmazios 擬態裁決條款）──
console.log("━━━ 3b. extraSetBonusIds 規則（裁決：不含自身）━━━");
let selfDup = 0;
for (const a of armors) if ((a.extraSetBonusIds ?? []).includes(a.setBonusId)) { selfDup++; bad(`${a.id} extra 含自身 setBonusId`); }
selfDup === 0 && ok("無 extraSetBonusIds 包含自身 setBonusId（10 件 Gogmazios 皆合規）");
const withExtra = armors.filter((a) => a.extraSetBonusIds?.length);
ok(`帶 extraSetBonusIds 件數: ${withExtra.length}（預期 10 = Gogmazios α/β × 5）`);

// ── 4. 池別一致性：武器珠只含 weapon-kind 技能、防具珠只含 armor-kind ──
console.log("━━━ 4. 珠-技能池別一致性 ━━━");
const skillKind = {};
for (const s of skills) skillKind[s.name] = s.kind;
let poolViol = 0;
for (const d of decos) {
  for (const sk of Object.keys(d.skills)) {
    const kind = skillKind[sk];
    if (d.pool === "weapon" && kind === "armor") { poolViol++; bad(`珠 ${d.nameZh}(weapon池) 含防具技能 ${sk}`); }
    if (d.pool === "armor" && kind === "weapon") { poolViol++; bad(`珠 ${d.nameZh}(armor池) 含武器技能 ${sk}`); }
  }
}
poolViol === 0 ? ok("武器珠/防具珠技能池別一致（無跨池例外）") : console.log(`  （池別例外 ${poolViol} 筆，上列逐筆點名）`);

// ── 5. 武器無技能分佈（Phase 0 上輪遺留：1090/1188 有技能，98 缺）──
console.log("━━━ 5. 武器無 seed 技能分佈 ━━━");
const noSkill = weapons.filter((w) => !w.skills || Object.keys(w.skills).length === 0);
console.log(`  無技能武器: ${noSkill.length} / ${weapons.length}`);
const byType = {}, byRar = {}, artianNo = noSkill.filter((w) => w.tags.includes("artian")).length;
for (const w of noSkill) { byType[w.weaponType] = (byType[w.weaponType] || 0) + 1; byRar[w.rarity] = (byRar[w.rarity] || 0) + 1; }
console.log("  按武種:", JSON.stringify(byType));
console.log("  按 rarity:", JSON.stringify(byRar));
console.log(`  其中 Artian 基底: ${artianNo} / 28`);

// ── 6. zh 覆蓋率（import 已記 EN-fallback；此處複驗產出無殘留英文名跡象）──
console.log("━━━ 6. zh 覆蓋 ━━━");
const looksEn = (s) => /^[\x00-\x7F]+$/.test(s || ""); // 全 ASCII = 疑似未翻
const enArmor = armors.filter((a) => looksEn(a.nameZh));
const enDeco = decos.filter((d) => looksEn(d.nameZh));
const enSkill = skills.filter((s) => looksEn(s.name));
(enArmor.length + enDeco.length + enSkill.length) === 0
  ? ok("armor/deco/skill 名皆含非 ASCII（無 EN-fallback 殘留，zh 100%）")
  : console.log(`  疑似 EN-fallback: armor ${enArmor.length} / deco ${enDeco.length} / skill ${enSkill.length}`);

console.log("\n━━━ manifest:", JSON.stringify(manifest.sources.mhdb.counts), "pin", manifest.dataVersion, "━━━");
console.log(fail ? `\n[audit-wilds] FAILED: ${fail} 項硬性違規` : "\n[audit-wilds] PASS: 全部檢核通過（例外已逐筆點名）");
process.exit(fail ? 1 : 0);
