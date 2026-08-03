/**
 * Wilds 推薦配裝驗證（Phase 6b §3；Phase Z 重構為三層可歸因分析）。
 *
 * ★ Phase Z 抽查翻案：原「exact vs off（Artian roll 135 / 邊際 26）」把兩件事混為一談——
 *   我方能否忠實重現裝備並正確計算，vs Game8 skillTotals 是否為其自列裝備的忠實加總。
 *   實測後者**不成立**（Game8 總表為人工摘要，常漏列武器內建/元素技，偶爾等級與自列珠不符）。
 *   故拆為三層：
 *     (a) 裝備層重現：build 列出的防具/武器/珠/護石是否全對到 DB 實體（id 級）。
 *     (b) 引擎自洽：對「該套實際裝備」，**真實引擎函式**（skill-calculator）算出的技能，
 *         與各件裝備資料的獨立加總是否逐位元一致——**應 100%**；不一致＝我方 bug（停手）。
 *     (c) Game8 總表偏差：引擎自洽值 vs Game8 skillTotals 的差異，**按方向分類計數**
 *         （引擎多算：內建技/set/group/元素技未列入摘要；引擎少算：Artian roll/顯示技/摘要噪音）。
 *   核心保證＝(a)+(b)「忠實重現裝備並正確計算」；(c) 是對照噪音源的誠實刻畫，非我方達成率。
 *   (2) 核心技能 N 校準、(3) EFR sanity 不變。
 *
 *   node scripts/wilds/validate-wilds-builds.mjs
 */
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
register("./scripts/regression-loader.mjs", pathToFileURL(REPO + path.sep).href);
const { searchBuilds } = await import("@/lib/build-search");
const { loadWildsSearchDeps, ensureWildsRegistered } = await import("@/lib/wilds-registry");
const { selectWorldCoreSkillRows } = await import("@/lib/builder-import");
// 真實引擎技能聚合函式（layer b 以此驗證，非手寫加總）。
const { calculateSkills, computeSetBonusSkills, computeGroupSkills, clampSkillsToMax, mergeSkills } =
  await import("@/lib/skill-calculator");
const load = (p) => JSON.parse(readFileSync(path.join(REPO, p), "utf8"));

const builds = load("src/data/wilds/recommended-builds.json").builds;
const armors = load("src/data/wilds/armors.json");
const decos = load("src/data/wilds/decorations.json");
const charms = load("src/data/wilds/charms.json");
const weapons = load("src/data/wilds/weapons.json");
const setBonuses = load("src/data/wilds/setBonuses.json");
const groupSkills = load("src/data/wilds/groupSkills.json");
const skillsData = load("src/data/wilds/skills.json");
const armorById = Object.fromEntries(armors.map((a) => [a.id, a]));
const decoById = Object.fromEntries(decos.map((d) => [d.id, d]));
const charmById = Object.fromEntries(charms.map((c) => [c.id, c]));
const weaponById = Object.fromEntries(weapons.map((w) => [w.id, w]));
const sbById = Object.fromEntries(setBonuses.map((b) => [b.id, b]));
const grpById = Object.fromEntries(groupSkills.map((g) => [g.id, g]));
const skillMax = Object.fromEntries(skillsData.map((s) => [s.name, s.maxLevel]));
const skillKind = Object.fromEntries(skillsData.map((s) => [s.name, s.kind]));
// set/group 效果名（Game8 列於 groupSetSkills 顯示、不入 skillTotals）。
const setGroupNames = new Set([
  ...setBonuses.flatMap((s) => s.ranks.map((r) => r.skillName)),
  ...groupSkills.flatMap((g) => g.ranks.map((r) => r.skillName)),
]);

await ensureWildsRegistered();
const deps = await loadWildsSearchDeps();
const profile = deps.wilds.profile;
const resolveMaxOf = (name) => profile.resolveSkillMax(name);

const eq = (a, b) => {
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ks) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
};
const scale = (m, n) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, v * n]));
const allDecosOf = (b) => [...(b.weapons?.[0]?.decorations ?? []), ...(b.buildDecorations ?? [])];

/** 各件裝備資料獨立加總（naive；不經 skill-calculator）。 */
function naiveSum(b) {
  const s = {};
  const addAll = (m, mult = 1) => { for (const [k, v] of Object.entries(m || {})) s[k] = (s[k] ?? 0) + v * mult; };
  for (const a of b.armor ?? []) if (a.id) addAll(armorById[a.id]?.skills);
  for (const d of allDecosOf(b)) if (d.id) addAll(decoById[d.id]?.skills, d.count || 1);
  if (b.weapons?.[0]?.id) addAll(weaponById[b.weapons[0].id]?.skills);
  if (b.charm?.id) addAll(charmById[b.charm.id]?.skills);
  const sc = {};
  for (const a of b.armor ?? []) { const ar = a.id ? armorById[a.id] : null; if (!ar) continue; if (ar.setBonusId) sc[ar.setBonusId] = (sc[ar.setBonusId] ?? 0) + 1; for (const e of ar.extraSetBonusIds ?? []) sc[e] = (sc[e] ?? 0) + 1; }
  for (const [id, c] of Object.entries(sc)) { const sb = sbById[id]; if (sb) for (const r of sb.ranks) if (c >= r.pieces) s[r.skillName] = (s[r.skillName] ?? 0) + r.skillLevel; }
  const gc = {};
  for (const a of b.armor ?? []) { const ar = a.id ? armorById[a.id] : null; if (ar?.groupId) gc[ar.groupId] = (gc[ar.groupId] ?? 0) + 1; }
  for (const [id, c] of Object.entries(gc)) { const g = grpById[id]; if (g) for (const r of g.ranks) if (c >= r.pieces) s[r.skillName] = (s[r.skillName] ?? 0) + r.skillLevel; }
  return clampSkillsToMax(s, skillMax);
}

/** 真實引擎聚合（skill-calculator 函式）。 */
function engineSum(b) {
  const pieces = (b.armor ?? []).map((a) => (a.id ? armorById[a.id] : null)).filter(Boolean);
  const charm = b.charm?.id ? charmById[b.charm.id] : undefined;
  const weapon = b.weapons?.[0]?.id ? weaponById[b.weapons[0].id] : undefined;
  const base = calculateSkills(pieces, charm, weapon);
  const decoSkills = mergeSkills(...allDecosOf(b).map((d) => (d.id ? scale(decoById[d.id]?.skills, d.count || 1) : undefined)));
  const setSk = computeSetBonusSkills(pieces, sbById);
  const grpSk = computeGroupSkills(pieces, grpById);
  return clampSkillsToMax(mergeSkills(base, decoSkills, setSk, grpSk), skillMax);
}

// ═══ (a) 裝備層重現：build 列出的裝備全對到 DB id ═══
let aOk = 0, aBad = 0; const aEx = [];
for (const b of builds) {
  const miss = [];
  for (const a of b.armor ?? []) if (!a.id || !armorById[a.id]) miss.push(`armor:${a.rawNameEn}`);
  if (!b.weapons?.[0]?.id || !weaponById[b.weapons[0].id]) miss.push(`weapon:${b.weapons?.[0]?.rawNameEn}`);
  for (const d of allDecosOf(b)) if (!d.id || !decoById[d.id]) miss.push(`deco:${d.rawNameEn}`);
  if (b.charm && (!b.charm.id || !charmById[b.charm.id])) miss.push(`charm:${b.charm.rawNameEn}`);
  if (miss.length === 0) aOk++; else { aBad++; if (aEx.length < 8) aEx.push(`${b.id}: ${miss.join(",")}`); }
}
console.log("━━━ (a) 裝備層重現（build 列裝備全對到 DB id）━━━");
console.log(`  ${aOk}/${builds.length} 套裝備全解析；${aBad} 套有未解析件`);
aEx.forEach((e) => console.log("    " + e));

// ═══ (b) 引擎自洽：真實引擎聚合 == 各件資料獨立加總（應 100%）═══
let bOk = 0, bBad = 0; const bEx = [];
for (const b of builds) {
  if (!eq(engineSum(b), naiveSum(b))) { bBad++; if (bEx.length < 8) bEx.push(b.id); } else bOk++;
}
console.log("\n━━━ (b) 引擎自洽（skill-calculator 聚合 == 各件資料加總）━━━");
console.log(`  ${bOk}/${builds.length} 套逐位元一致${bBad ? `；${bBad} 套不符 → 我方 bug` : "（引擎對已知裝備計算正確）"}`);
bEx.forEach((e) => console.log("    MISMATCH " + e));
if (bBad > 0) { console.log("\n  ✗ (b) 未達 100% → 依 Phase Z §1 停手（根因在引擎/資料，不夾帶修）。"); process.exit(1); }

// ═══ (c) Game8 總表偏差：引擎自洽值 vs Game8 skillTotals，按方向分類 ═══
console.log("\n━━━ (c) Game8 skillTotals 偏差分類（引擎自洽值 vs Game8 宣稱；±1 容忍）━━━");
const cat = {
  surplusSetGroup: 0, surplusElement: 0, surplusWeaponInnate: 0, surplusOther: 0,
  deficitArtianRoll: 0, deficitOther: 0,
};
const isElement = (k) => /屬性攻擊強化$/.test(k) || /會心擊【(屬性|特殊)】/.test(k);
let cleanMatch = 0, buildsWithSurplus = 0, buildsWithDeficit = 0;
const deficitOtherEx = [];
for (const b of builds) {
  const eng = engineSum(b);
  const weaponInnate = b.weapons?.[0]?.id ? weaponById[b.weapons[0].id]?.skills ?? {} : {};
  const claim = {};
  for (const s of b.skillTotals ?? []) if (s.id) claim[s.id] = Math.max(claim[s.id] ?? 0, s.level);
  let hasSurplus = false, hasDeficit = false, clean = true;
  const keys = new Set([...Object.keys(eng), ...Object.keys(claim)]);
  for (const k of keys) {
    const diff = (eng[k] ?? 0) - (claim[k] ?? 0);
    if (Math.abs(diff) <= 1) continue;
    clean = false;
    if (diff > 0) { // 引擎多算
      hasSurplus = true;
      if (setGroupNames.has(k)) cat.surplusSetGroup++;
      else if (isElement(k)) cat.surplusElement++;
      else if (weaponInnate[k]) cat.surplusWeaponInnate++;
      else cat.surplusOther++;
    } else { // 引擎少算（Game8 有更多）
      hasDeficit = true;
      if (b.unmodeled?.artian) cat.deficitArtianRoll++;
      else { cat.deficitOther++; if (deficitOtherEx.length < 12) deficitOtherEx.push(`${b.id}:${k} 引擎${eng[k] ?? 0}<G8${claim[k]}(${skillKind[k] ?? "?"})`); }
    }
  }
  if (clean) cleanMatch++;
  if (hasSurplus) buildsWithSurplus++;
  if (hasDeficit) buildsWithDeficit++;
}
console.log(`  ${cleanMatch}/${builds.length} 套引擎自洽值與 Game8 總表 ±1 全合；${buildsWithSurplus} 套含引擎多算、${buildsWithDeficit} 套含引擎少算`);
console.log(`  引擎多算（Game8 摘要漏列）：set/group 名 ${cat.surplusSetGroup}（顯示分離）／元素技 ${cat.surplusElement}／武器內建 ${cat.surplusWeaponInnate}／其他 ${cat.surplusOther}`);
console.log(`  引擎少算（Game8 多）：Artian roll 未模擬 ${cat.deficitArtianRoll}／非 Artian 其他 ${cat.deficitOther}`);
if (deficitOtherEx.length) { console.log("  非 Artian 少算範例（Game8 摘要噪音/邊際差）："); deficitOtherEx.forEach((e) => console.log("    " + e)); }

// ═══ (d) Gogmazios 借用件：extraSetBonusIds 聯集計數 ═══
const gog = builds.filter((b) => b.armor?.some((a) => /Gogmazios/i.test(a.rawNameEn || "")));
console.log(`\n━━━ (d) Gogmazios 借用件 set 聯集計數（${gog.length} 套）━━━`);
{
  const b = gog.find((x) => x.id.includes("charge-blade")) ?? gog[0];
  const piece = b.armor.find((a) => /Gogmazios/i.test(a.rawNameEn || ""));
  const ar = armorById[piece.id];
  console.log(`  例 ${b.id} ${piece.rawNameEn}：setBonusId=${ar?.setBonusId} + extra=${JSON.stringify(ar?.extraSetBonusIds)}（computeSetBonusSkills 聯集 +1，smoke-wilds ⑦/⑦b 背書）`);
}

// ═══ (e) N 校準 ═══
function sample(pool, k = 12) {
  const step = Math.max(1, Math.floor(pool.length / k));
  return pool.filter((_, i) => i % step === 0).slice(0, k);
}
function calibrateN(label, pool) {
  console.log(`\n━━━ (e) 核心技能 N 校準（${label}，top-N → Wilds 搜尋有無結果）━━━`);
  const s = sample(pool);
  for (const N of [4, 5, 6, 7, 8]) {
    let hit = 0; const zero = [];
    for (const b of s) {
      const rows = selectWorldCoreSkillRows(b, resolveMaxOf, N);
      const req = {};
      for (const r of rows.rows) req[r.name] = r.level;
      const { results } = searchBuilds({
        weaponType: b.weaponType, weaponSearchMode: "search",
        charms: [], fixedParts: {}, excludedItems: { armorIds: [], weaponIds: [] },
        requiredSkills: req, excludedSkills: [], reservedSlots: { 4: 0, 3: 0, 2: 0, 1: 0 },
        searchMode: "fast", resultLimit: 5,
      }, deps);
      if (results.length > 0) hit++; else zero.push(`${b.weaponType}/${b.buildName}`);
    }
    console.log(`  N=${N}: ${hit}/${s.length} 有結果` + (zero.length ? `  零: ${zero.slice(0, 3).join(" ; ")}${zero.length > 3 ? " …" : ""}` : ""));
  }
}
calibrateN("wildsEndgame", builds.filter((b) => b.category === "wildsEndgame"));
calibrateN("wildsHighRank", builds.filter((b) => b.category === "wildsHighRank"));

// ═══ (f) EFR 排序 sanity ═══
console.log("\n━━━ (f) EFR 排序 sanity（endgame 核心技能 → 搜尋結果 EFR 降冪）━━━");
const seen = new Set();
let sane = 0, total = 0;
for (const b of builds.filter((x) => x.category === "wildsEndgame")) {
  if (seen.has(b.weaponType) || seen.size >= 4) { if (seen.size >= 4) break; else continue; }
  const rows = selectWorldCoreSkillRows(b, resolveMaxOf, 5);
  const req = {};
  for (const r of rows.rows) req[r.name] = r.level;
  const { results } = searchBuilds({
    weaponType: b.weaponType, weaponSearchMode: "search",
    charms: [], fixedParts: {}, excludedItems: { armorIds: [], weaponIds: [] },
    requiredSkills: req, excludedSkills: [], reservedSlots: { 4: 0, 3: 0, 2: 0, 1: 0 },
    searchMode: "fast", resultLimit: 10,
  }, deps);
  if (results.length < 2) continue;
  seen.add(b.weaponType); total++;
  const efrs = results.map((r) => r.efr?.total ?? 0);
  const descending = efrs.every((v, i) => i === 0 || v <= efrs[i - 1] + 1e-9);
  if (descending && efrs[0] > 0) sane++;
  console.log(`  ${b.weaponType.padEnd(13)} top efr=${efrs[0].toFixed(1)}，降冪=${descending ? "✓" : "✗"}`);
}
console.log(`  EFR sanity：${sane}/${total} 武種 EFR 降冪且首位非平凡`);
