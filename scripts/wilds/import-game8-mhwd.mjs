/**
 * Wilds 推薦配裝匯入（尾巴 W-F：**game8.jp 日文**快取 → JP→id 映射）：
 * .cache/game8/*.json（JP 抽取結果）→ nameJa→id → src/data/wilds/recommended-builds.json。
 *
 * 映射（JP→專案 id，全走 mhdb **ja** locale，§W-F 保真度裁決）：
 *   - 防具/武器/珠：mhdb ja `{armor,weapons,decorations}` 的 name → `wa_/ww_/wd_${id}`（id 即 wilds id 源）。
 *   - 護石：mhdb ja charms 的 `ranks[].name` → `wc_${rankId}`（生產護石）；RNG「鑑定護石」不在 mhdb → 無 id。
 *   - 技能：nameJa → mhdb ja skill id → mhdb zh-Hant name（＝skills.json 繁中 name，已驗 179/179 橋接）。
 *   對不上者：命名差異→game8-jp-overrides.json 別名修正（Game8 名→mhdb 正典名，逐筆附據）；真缺→unresolved。
 *
 * clamp：skillTotals 逐級 clamp 到 skillMax（Wilds 靜態上限，無 secret 動態）。屬性泛稱技（属性攻撃強化
 *   等 generic 形）→ placeholder（依武器屬性自選、無單一 id）。Artian 武器→unmodeled.artian；RNG 護石→unmodeled.rngCharm。
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
const OVERRIDE_FILE = path.join(HERE, "game8-jp-overrides.json");

const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const loadRepo = (rel) => load(path.join(REPO, rel));

// ───────── 名稱正規化（JP）─────────
// NFKC（全形數字/Ⅲ→半形、統一）＋【】正規化＋去空白＋小寫。α/β/γ 已為 NFKC 安全。
const normJa = (s) =>
  (s || "").normalize("NFKC").replace(/[【\[]/g, "[").replace(/[】\]]/g, "]").replace(/\s+/g, "").toLowerCase();

// ───────── 資料源（mhdb ja locale）─────────
const armorJa = load(path.join(CACHE, "armor.ja.json"));
const weaponJa = load(path.join(CACHE, "weapons.ja.json"));
const decoJa = load(path.join(CACHE, "decorations.ja.json"));
const charmJa = load(path.join(CACHE, "charms.ja.json"));
const skillJa = load(path.join(CACHE, "skills.ja.json"));
const skillZh = load(path.join(CACHE, "skills.zh-Hant.json")); // id → 繁中 name 橋接
const skills = loadRepo("src/data/wilds/skills.json"); // 繁中 name → maxLevel
const projCharms = loadRepo("src/data/wilds/charms.json"); // 可搜尋護石池（183；RNG 鑑定 4 家族已排除）
const manifest = loadRepo("src/data/wilds/manifest.json");
const overrides = existsSync(OVERRIDE_FILE) ? load(OVERRIDE_FILE) : {};
const alias = (cat, name) => overrides[cat]?.[name] ?? name; // 別名修正（Game8 名→mhdb 正典名）

const armorMap = new Map(armorJa.map((a) => [normJa(a.name), `wa_${a.id}`]));
const weaponMap = new Map(weaponJa.map((w) => [normJa(w.name), `ww_${w.id}`]));
const decoMap = new Map(decoJa.map((d) => [normJa(d.name), `wd_${d.id}`]));
const charmPoolIds = new Set(projCharms.map((c) => c.id)); // 僅池內護石可解析
const charmMap = new Map();
for (const c of charmJa) for (const r of c.ranks || []) charmMap.set(normJa(r.name), `wc_${r.id}`);
const zhById = new Map(skillZh.map((s) => [s.id, s.name]));
const skillMap = new Map(skillJa.map((s) => [normJa(s.name), zhById.get(s.id)]).filter(([, zh]) => zh));
const skillMax = Object.fromEntries(skills.map((s) => [s.name, s.maxLevel]));

// 屬性泛稱技（generic，依武器屬性自選 → placeholder，非單一 id）。具體元素技（火属性攻撃強化 等）不在此、正常解析。
const PLACEHOLDER_SKILLS = new Set(
  ["属性強化", "属性攻撃強化", "各属性攻撃強化", "◯属性攻撃強化", "○属性攻撃強化"].map(normJa)
);
// RNG（鑑定）護石：隨機錬成、不在可搜尋池（生產護石之外）→ 無 id、標 unmodeled.rngCharm。
// 判定＝解析不到「池內」護石 id：涵蓋泛稱「鑑定護石」（mhdb 無此名）與具名鑑定護石
//   未解/秘歴/栄世/史伝の護石（mhdb 有名但 skills 空、import-wilds「RNG 4 排除」不入池）。
// 回傳池內 wc_id 或 null（null＝RNG/無法建模）。
function resolveCharm(name) {
  const wc = charmMap.get(normJa(alias("charms", name)));
  return wc && charmPoolIds.has(wc) ? wc : null;
}

// ───────── 映射統計 ─────────
const stat = { entities: 0, direct: 0, aliased: 0, placeholder: 0, rngCharm: 0 };
const unresolved = new Map();
let curBuildId = null;
function note(type, name) {
  const key = `${type}:${name}`;
  const u = unresolved.get(key) ?? { type, name, count: 0, examples: [] };
  u.count++;
  if (curBuildId && u.examples.length < 3 && !u.examples.includes(curBuildId)) u.examples.push(curBuildId);
  unresolved.set(key, u);
}
function resolve(map, name, type, cat) {
  stat.entities++;
  const canon = alias(cat, name);
  if (canon !== name) stat.aliased++;
  const id = map.get(normJa(canon));
  if (id != null) { stat.direct++; return id; }
  note(type, name);
  return null;
}

const mapDecos = (list) =>
  list.map((d) => {
    const id = resolve(decoMap, d.nameJa, "decorations", "decorations");
    return id ? { id, count: d.count, rawNameJa: d.nameJa } : { count: d.count, rawNameJa: d.nameJa };
  });

function mapSkillTotals(list) {
  const out = [];
  for (const s of list) {
    if (PLACEHOLDER_SKILLS.has(normJa(s.nameJa))) {
      stat.placeholder++;
      out.push({ rawNameJa: s.nameJa, level: s.level, setBonusOrUnknown: true });
      continue;
    }
    const zh = skillMap.get(normJa(s.nameJa));
    if (zh) {
      const lv = Math.min(s.level, skillMax[zh] ?? s.level); // clamp 靜態上限
      out.push({ id: zh, level: lv, rawNameJa: s.nameJa });
    } else {
      note("skills", s.nameJa);
      out.push({ rawNameJa: s.nameJa, level: s.level, setBonusOrUnknown: true });
    }
  }
  return out;
}

// ───────── 匯入 ─────────
const allBuilds = [];
for (const f of readdirSync(G8).filter((x) => x.endsWith(".json")).sort()) {
  const page = load(path.join(G8, f));
  const metaVersion = `${page.dataVersion ?? "1.041"} (game8.jp ${page.jpUpdatedAt ?? "?"})`;
  for (const b of page.builds) {
    if (!b.complete) continue;
    curBuildId = b.id;
    const weaponId = b.weapon ? resolve(weaponMap, b.weapon, "weapons", "weapons") : null;
    const weapon = { rawNameJa: b.weapon, slots: b.weaponSlots, statsRaw: b.weaponStats, decorations: mapDecos(b.weaponDecos) };
    if (weaponId) weapon.id = weaponId;
    const armor = b.armor.map((a) => {
      const id = resolve(armorMap, a.nameJa, "armors", "armors");
      const piece = { slot: a.slot, rawNameJa: a.nameJa };
      if (id) piece.id = id;
      if (a.augmentRaw) piece.augmentRaw = a.augmentRaw;
      return piece;
    });
    let charm = null;
    let rngCharm = false;
    if (b.talisman) {
      const name = b.talisman.nameJa;
      const id = resolveCharm(name);
      if (id) { stat.entities++; stat.direct++; charm = { id, rawNameJa: name }; }
      else { stat.rngCharm++; rngCharm = true; charm = { rawNameJa: name }; } // RNG/鑑定 → 不建模
    }
    const build = {
      id: b.id,
      weaponType: b.weaponType,
      category: b.category,
      kind: "full-build",
      buildName: b.buildName,
      metaVersion,
      sourceUrl: b.sourceUrl,
      weapons: [weapon],
      armor,
      charm,
      buildDecorations: mapDecos(b.armorDecos),
      skillTotals: mapSkillTotals(b.skillTotals),
      groupSetSkills: b.groupSetSkills.map((g) => ({ rawNameJa: g.nameJa })),
    };
    const unmodeled = {};
    if (b.artian) unmodeled.artian = true;
    if (rngCharm) unmodeled.rngCharm = true;
    if (Object.keys(unmodeled).length) build.unmodeled = unmodeled;
    allBuilds.push(build);
  }
}
// 顯示順序：weaponType → category（progression 先於 endgame，HR 遞增）→ id。
const CATEGORY_ORDER = { wildsProgression: 0, wildsHighRank: 1, wildsEndgame: 2 };
allBuilds.sort((a, b) =>
  a.weaponType < b.weaponType ? -1 : a.weaponType > b.weaponType ? 1 :
  (CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]) || (a.id < b.id ? -1 : 1)
);

const out = {
  meta: {
    source: "Game8 — モンハンワイルズ 最強装備・おすすめ装備（game8.jp）",
    attribution: "https://game8.jp/mhwilds/673589",
    scrapedAt: "2026-08-05",
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
console.log(`[import-game8-jp] ${allBuilds.length} builds → src/data/wilds/recommended-builds.json`);
console.log("  分區:", JSON.stringify(byCat), "| Artian:", artian, "| RNG護石:", stat.rngCharm);
console.log(`  映射: 實體 ${stat.entities} / 直通 ${stat.direct}（別名 ${stat.aliased}）/ 屬性佔位 ${stat.placeholder} / 真缺 ${out.unresolved.length} 類`);
if (out.unresolved.length) for (const u of out.unresolved.slice(0, 30)) console.log(`    [${u.type}] ${u.name} ×${u.count} (例 ${u.examples.join(",")})`);
else console.log("  真缺 0。");
