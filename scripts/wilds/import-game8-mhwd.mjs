/**
 * Wilds 推薦配裝匯入：Game8 抽取快取（.cache/game8/*.json）→ EN→id 映射 →
 * src/data/wilds/recommended-builds.json（schema 對齊 World，見 src/types/recommended.ts）。
 *
 * 映射（EN→專案 id，Phase 6b §2）：
 *   - 防具/武器：src/data/wilds/{armors,weapons}.json 的 nameEn（含 Artian 武器）。
 *   - 裝飾珠/護石：mhdb-wilds en locale（.cache/{decorations,charms}.en.json）的 id → wd_/wc_
 *     （wilds id 即由 mhdb id 派生，見 import-wilds.mjs；en locale 重抓與 committed 資料 0 漂移，已驗）。
 *   - 技能：skills.json 的 nameEn → 繁中 name（skillTotals 的 id）。
 *   - group/set 技能：Game8「Group / Set Skills」為顯示效果名（非 set nameEn），與防具 setBonusId/
 *     groupId 冗餘 → 存 rawNameEn 作顯示、不參與 achievability（由防具件數重算，見 validate-wilds-builds）。
 *   對不上者：命名差異→game8-en-overrides.json（附據）；真缺→unresolved 點名。實測全通、override 空。
 *
 * clamp（§2.3）：skillTotals 逐級 clamp 到 skillMax（Wilds 無 secret 動態上限 → 靜態；
 *   set/group 由防具件數表達、不虛構 secret）。Artian 武器 → unmodeled.artian（隨機強化不模擬）。
 *
 * 用法：node scripts/wilds/import-game8-mhwd.mjs   （讀快取，不重爬；重跑逐位元一致）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CACHE = path.join(HERE, ".cache");
const G8 = path.join(CACHE, "game8");
const OUT = path.join(REPO, "src", "data", "wilds", "recommended-builds.json");
const OVERRIDE_FILE = path.join(HERE, "game8-en-overrides.json");

const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const loadRepo = (rel) => load(path.join(REPO, rel));

// ───────── 名稱正規化 ─────────
const normE = (s) =>
  s
    .normalize("NFKC").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[【\[]/g, "[").replace(/[】\]]/g, "]")
    .replace(/\balpha\b/gi, "α").replace(/\bbeta\b/gi, "β").replace(/\bgamma\b/gi, "γ")
    .replace(/\s+/g, "").toLowerCase();
const normS = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

// ───────── 資料源 ─────────
const armors = loadRepo("src/data/wilds/armors.json");
const weapons = loadRepo("src/data/wilds/weapons.json");
const skills = loadRepo("src/data/wilds/skills.json");
const manifest = loadRepo("src/data/wilds/manifest.json");
const decoEn = load(path.join(CACHE, "decorations.en.json"));
const charmEn = load(path.join(CACHE, "charms.en.json"));
const overrides = existsSync(OVERRIDE_FILE)
  ? load(OVERRIDE_FILE)
  : { armors: {}, weapons: {}, decorations: {}, charms: {}, skills: {} };

const armorMap = new Map(armors.map((a) => [normE(a.nameEn), a.id]));
const weaponMap = new Map(weapons.map((w) => [normE(w.nameEn), w.id]));
const decoMap = new Map(decoEn.map((d) => [normE(d.name), `wd_${d.id}`]));
const charmMap = new Map();
for (const c of charmEn) for (const r of c.ranks) charmMap.set(normE(r.name), `wc_${r.id}`);
const skillMap = new Map(skills.map((s) => [normS(s.nameEn), s.name]));
const skillMax = Object.fromEntries(skills.map((s) => [s.name, s.maxLevel]));
// override 併入
for (const [en, id] of Object.entries(overrides.armors || {})) armorMap.set(normE(en), id);
for (const [en, id] of Object.entries(overrides.weapons || {})) weaponMap.set(normE(en), id);
for (const [en, id] of Object.entries(overrides.decorations || {})) decoMap.set(normE(en), id);
for (const [en, id] of Object.entries(overrides.charms || {})) charmMap.set(normE(en), id);
for (const [en, zh] of Object.entries(overrides.skills || {})) skillMap.set(normS(en), zh);

// 屬性佔位技能（Game8 泛稱，非單一技能；依武器屬性自選 → placeholder）。
const PLACEHOLDER_SKILLS = new Set(
  ["Elemental Attack", "Element Attack", "Any Elemental Attack", "Any Element Attack",
   "Element/Status Attack", "Element Resistance"].map(normS)
);

// ───────── 映射統計 ─────────
const stat = { entities: 0, direct: 0, placeholder: 0 };
const unresolved = new Map();
let curBuildId = null;
function note(type, en) {
  const key = `${type}:${en}`;
  const u = unresolved.get(key) ?? { type, en, count: 0, examples: [] };
  u.count++;
  if (curBuildId && u.examples.length < 3 && !u.examples.includes(curBuildId)) u.examples.push(curBuildId);
  unresolved.set(key, u);
}
function resolve(map, en, type, norm = normE) {
  stat.entities++;
  const id = map.get(norm(en));
  if (id != null) { stat.direct++; return id; }
  note(type, en);
  return null;
}

const mapDecos = (list) =>
  list.map((d) => {
    const id = resolve(decoMap, d.nameEn, "decorations");
    return id ? { id, count: d.count, rawNameEn: d.nameEn } : { count: d.count, rawNameEn: d.nameEn };
  });

function mapSkillTotals(list) {
  const out = [];
  for (const s of list) {
    if (PLACEHOLDER_SKILLS.has(normS(s.nameEn))) {
      stat.placeholder++;
      out.push({ rawNameEn: s.nameEn, level: s.level, setBonusOrUnknown: true });
      continue;
    }
    const zh = skillMap.get(normS(s.nameEn));
    if (zh) {
      const lv = Math.min(s.level, skillMax[zh] ?? s.level); // §2.3 clamp 靜態上限
      out.push({ id: zh, level: lv, rawNameEn: s.nameEn });
    } else {
      note("skills", s.nameEn);
      out.push({ rawNameEn: s.nameEn, level: s.level, setBonusOrUnknown: true });
    }
  }
  return out;
}

// ───────── 匯入 ─────────
const CATEGORY_ORDER = { wildsEndgame: 0, wildsHighRank: 1, wildsProgression: 2 };
const allBuilds = [];
for (const f of readdirSync(G8).filter((x) => x.endsWith(".json")).sort()) {
  const page = load(path.join(G8, f));
  for (const b of page.builds) {
    if (!b.complete) continue;
    curBuildId = b.id;
    const weaponId = b.weapon ? resolve(weaponMap, b.weapon, "weapons") : null;
    const weapon = {
      rawNameEn: b.weapon,
      slots: b.weaponSlots,
      decorations: mapDecos(b.weaponDecos),
    };
    if (weaponId) weapon.id = weaponId;
    const armor = b.armor.map((a) => {
      const id = resolve(armorMap, a.nameEn, "armors");
      const piece = { slot: a.slot, rawNameEn: a.nameEn };
      if (id) piece.id = id;
      return piece;
    });
    let charm = null;
    if (b.talisman) {
      const id = resolve(charmMap, b.talisman, "charms");
      charm = id ? { id, rawNameEn: b.talisman } : { rawNameEn: b.talisman };
    }
    const build = {
      id: b.id,
      weaponType: b.weaponType,
      category: b.category,
      kind: "full-build",
      buildName: b.buildName,
      metaVersion: page.dataVersion ?? "1.041",
      sourceUrl: b.sourceUrl,
      weapons: [weapon],
      armor,
      charm,
      buildDecorations: mapDecos(b.armorDecos),
      skillTotals: mapSkillTotals(b.skillTotals),
      groupSetSkills: b.groupSetSkills.map((n) => ({ rawNameEn: n })),
    };
    if (b.artian) build.unmodeled = { artian: true };
    allBuilds.push(build);
  }
}
allBuilds.sort((a, b) =>
  a.weaponType < b.weaponType ? -1 : a.weaponType > b.weaponType ? 1 :
  (CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]) || (a.id < b.id ? -1 : 1)
);

const out = {
  meta: {
    source: "Game8 — Monster Hunter Wilds High Rank Builds",
    attribution: "https://game8.co/games/Monster-Hunter-Wilds",
    scrapedAt: "2026-08-03",
    gameId: "wilds",
    dataVersion: manifest.dataVersion,
    schemaDoc: "docs/wilds-game8-audit.md",
  },
  builds: allBuilds,
  errors: [],
  unresolved: [...unresolved.values()].sort((a, b) => b.count - a.count),
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");

// ───────── 回報 ─────────
const byCat = {};
for (const b of allBuilds) byCat[b.category] = (byCat[b.category] ?? 0) + 1;
const artian = allBuilds.filter((b) => b.unmodeled?.artian).length;
console.log(`[import-game8] ${allBuilds.length} builds → src/data/wilds/recommended-builds.json`);
console.log("  分區:", JSON.stringify(byCat), "| Artian:", artian);
console.log(`  映射: 實體 ${stat.entities} / 直通 ${stat.direct} / 屬性佔位 ${stat.placeholder} / 真缺 ${out.unresolved.length} 類`);
if (out.unresolved.length) for (const u of out.unresolved.slice(0, 30)) console.log(`    [${u.type}] ${u.en} ×${u.count} (例 ${u.examples.join(",")})`);
else console.log("  真缺 0 — override 空。");
