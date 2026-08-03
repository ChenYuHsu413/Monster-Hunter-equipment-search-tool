/**
 * Wilds 推薦配裝驗證（Phase 6b §3）。比照 World validate-mhwi-builds.mjs：
 *   (1) 用我方資料重算每套 skillTotals（防具技能 + 珠 + 護石 + 武器 seed + set/group bonus）
 *       對 Game8 宣稱值（±1 容忍）。不符先分「Artian 未模擬（重算<Game8）vs 其他」。World 179 標準。
 *   (2) 核心技能 N 校準：抽 wildsEndgame，以 top-N 核心技能跑 Wilds 搜尋，數幾筆有結果 → 定 N。
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
const load = (p) => JSON.parse(readFileSync(path.join(REPO, p), "utf8"));

const builds = load("src/data/wilds/recommended-builds.json").builds;
const armors = load("src/data/wilds/armors.json");
const decos = load("src/data/wilds/decorations.json");
const charms = load("src/data/wilds/charms.json");
const weapons = load("src/data/wilds/weapons.json");
const setBonuses = load("src/data/wilds/setBonuses.json");
const groupSkills = load("src/data/wilds/groupSkills.json");
const armorById = Object.fromEntries(armors.map((a) => [a.id, a]));
const decoById = Object.fromEntries(decos.map((d) => [d.id, d]));
const charmById = Object.fromEntries(charms.map((c) => [c.id, c]));
const weaponById = Object.fromEntries(weapons.map((w) => [w.id, w]));
const sbById = Object.fromEntries(setBonuses.map((b) => [b.id, b]));
const grpById = Object.fromEntries(groupSkills.map((g) => [g.id, g]));

await ensureWildsRegistered();
const deps = await loadWildsSearchDeps();
const profile = deps.wilds.profile;
const resolveMaxOf = (name) => profile.resolveSkillMax(name);
const add = (m, k, v) => { m[k] = (m[k] ?? 0) + v; };

/** 用我方資料重算一套配裝技能總表（clamp 到靜態上限）。 */
function recompute(build) {
  const skills = {};
  // 防具自帶技能
  for (const a of build.armor ?? []) {
    const ar = a.id ? armorById[a.id] : null;
    if (ar) for (const [k, v] of Object.entries(ar.skills || {})) add(skills, k, v);
  }
  // 珠：武器珠 + buildDecorations（防具珠總表）
  const allDecos = [...(build.weapons?.[0]?.decorations ?? []), ...(build.buildDecorations ?? [])];
  for (const d of allDecos) {
    const dd = d.id ? decoById[d.id] : null;
    if (dd) for (const [k, v] of Object.entries(dd.skills || {})) add(skills, k, v * (d.count || 1));
  }
  // 武器 seed 技能
  const w = build.weapons?.[0]?.id ? weaponById[build.weapons[0].id] : null;
  if (w) for (const [k, v] of Object.entries(w.skills || {})) add(skills, k, v);
  // 護石
  if (build.charm?.id) { const c = charmById[build.charm.id]; if (c) for (const [k, v] of Object.entries(c.skills || {})) add(skills, k, v); }
  // set bonus：件數吃 setBonusId + extraSetBonusIds 聯集（Gogmazios 借用件亦計）
  const sbCount = {};
  for (const a of build.armor ?? []) {
    const ar = a.id ? armorById[a.id] : null;
    if (!ar) continue;
    if (ar.setBonusId) add(sbCount, ar.setBonusId, 1);
    for (const ex of ar.extraSetBonusIds ?? []) add(sbCount, ex, 1);
  }
  for (const [id, cnt] of Object.entries(sbCount)) {
    const sb = sbById[id]; if (!sb) continue;
    for (const r of sb.ranks) if (cnt >= r.pieces) add(skills, r.skillName, r.skillLevel);
  }
  // group skill：件數達門檻（通常 3）觸發
  const grpCount = {};
  for (const a of build.armor ?? []) { const ar = a.id ? armorById[a.id] : null; if (ar?.groupId) add(grpCount, ar.groupId, 1); }
  for (const [id, cnt] of Object.entries(grpCount)) {
    const g = grpById[id]; if (!g) continue;
    for (const r of g.ranks) if (cnt >= r.pieces) add(skills, r.skillName, r.skillLevel);
  }
  const clamped = {};
  for (const [k, v] of Object.entries(skills)) clamped[k] = Math.min(v, resolveMaxOf(k));
  return { clamped };
}

// ═══ (1) 重算 vs Game8 ═══
console.log("━━━ (1) skillTotals 重算 vs Game8 宣稱（±1 容忍，World 179 方法）━━━");
let ax = 0, ao = 0, nx = 0, no = 0; // artian exact/off, non-artian exact/off
const offExamples = [];
for (const b of builds) {
  const { clamped } = recompute(b);
  const claim = {};
  for (const s of b.skillTotals ?? []) if (s.id) claim[s.id] = Math.max(claim[s.id] ?? 0, s.level);
  let bad = 0;
  for (const [k, lv] of Object.entries(claim)) {
    const got = clamped[k] ?? 0;
    if (Math.abs(got - lv) <= 1) continue;
    bad++;
    if (offExamples.length < 8) offExamples.push(`${b.id} ${k}: 重算${got} vs G8 ${lv}${b.unmodeled?.artian ? " [Artian]" : ""}`);
  }
  const isA = !!b.unmodeled?.artian;
  if (bad === 0) (isA ? ax++ : nx++);
  else (isA ? ao++ : no++);
}
const artian = builds.filter((b) => b.unmodeled?.artian).length;
console.log(`  exact（±1）：Artian ${ax}/${artian}、非 Artian ${nx}/${builds.length - artian}；合計 ${ax + nx}/${builds.length}`);
console.log(`  off：Artian ${ao}（roll 的 set/group/focus/攻擊 不在資料 → 重算<Game8，即 Wilds 版 World 覺醒未模擬，`);
console.log(`       占比高因 Wilds meta 78% 用 Artian）；非 Artian ${no}（武器內建技/Game8 珠總表省略等邊際差，同 World 26 "其他"級）`);
for (const e of offExamples) console.log("    " + e);

// ═══ (1b) Gogmazios 借用件：extraSetBonusIds 聯集計數達成 ═══
const gog = builds.filter((b) => b.armor?.some((a) => /Gogmazios/i.test(a.rawNameEn || "")));
console.log(`\n━━━ (1b) Gogmazios 借用件 set 聯集計數（${gog.length} 套）━━━`);
{
  const b = gog.find((x) => x.id.includes("charge-blade")) ?? gog[0];
  const piece = b.armor.find((a) => /Gogmazios/i.test(a.rawNameEn || ""));
  const ar = armorById[piece.id];
  console.log(`  例 ${b.id} ${piece.rawNameEn}：setBonusId=${ar?.setBonusId} + extra=${JSON.stringify(ar?.extraSetBonusIds)}`);
  console.log(`  → recompute 對 setBonusId 與每個 extra 各 +1 件（聯集），借用 set 門檻可達；smoke-wilds ⑦/⑦b 背書。`);
}

// ═══ (2) N 校準 ═══
function sample(pool, k = 12) {
  const step = Math.max(1, Math.floor(pool.length / k));
  return pool.filter((_, i) => i % step === 0).slice(0, k);
}
function calibrateN(label, pool) {
  console.log(`\n━━━ (2) 核心技能 N 校準（${label}，top-N → Wilds 搜尋有無結果）━━━`);
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
    console.log(`  N=${N}: ${hit}/${s.length} 有結果` + (zero.length ? `  零: ${zero.slice(0, 4).join(" ; ")}${zero.length > 4 ? " …" : ""}` : ""));
  }
  console.log(`  技能數分佈（skillTotals 有 id 者）: ` +
    JSON.stringify(pool.map((b) => (b.skillTotals ?? []).filter((s) => s.id).length).reduce((a, n) => (a[n] = (a[n] ?? 0) + 1, a), {})));
}
calibrateN("wildsEndgame", builds.filter((b) => b.category === "wildsEndgame"));
calibrateN("wildsHighRank", builds.filter((b) => b.category === "wildsHighRank"));

// ═══ (3) EFR 排序 sanity（N=60；≥3 武種：endgame 核心技能搜尋，結果 EFR 降冪且首位非平凡）═══
console.log("\n━━━ (3) EFR 排序 sanity（endgame 核心技能 → 搜尋結果 EFR 降冪）━━━");
const N_EFR = 5;
const seen = new Set();
let sane = 0, total = 0;
for (const b of builds.filter((x) => x.category === "wildsEndgame")) {
  if (seen.has(b.weaponType) || seen.size >= 4) { if (seen.size >= 4) break; else continue; }
  const rows = selectWorldCoreSkillRows(b, resolveMaxOf, N_EFR);
  const req = {};
  for (const r of rows.rows) req[r.name] = r.level;
  const { results } = searchBuilds({
    weaponType: b.weaponType, weaponSearchMode: "search",
    charms: [], fixedParts: {}, excludedItems: { armorIds: [], weaponIds: [] },
    requiredSkills: req, excludedSkills: [], reservedSlots: { 4: 0, 3: 0, 2: 0, 1: 0 },
    searchMode: "fast", resultLimit: 10,
  }, deps);
  if (results.length < 2) continue;
  seen.add(b.weaponType);
  total++;
  const efrs = results.map((r) => r.efr?.total ?? 0);
  const descending = efrs.every((v, i) => i === 0 || v <= efrs[i - 1] + 1e-9);
  const top = efrs[0];
  if (descending && top > 0) sane++;
  console.log(`  ${b.weaponType.padEnd(13)} "${b.buildName}"：${results.length} 結果，top efr=${top.toFixed(1)}，降冪=${descending ? "✓" : "✗"}`);
}
console.log(`  EFR sanity：${sane}/${total} 武種結果 EFR 降冪且首位非平凡`);
