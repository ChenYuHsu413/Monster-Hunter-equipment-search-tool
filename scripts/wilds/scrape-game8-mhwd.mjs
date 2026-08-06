/**
 * Game8 Wilds 推薦配裝爬取（**game8.jp 日文原站**，fetch → 靜態表解析 → 快取固化）。
 * 尾巴 W-F 換源：game8.co（英文）→ game8.jp（日文）。定性/覆蓋對照/裁決見 docs/wilds-game8-audit.md §W-F。
 *
 * ★ 換源理由（非覆蓋）：JP 原生詞彙直通 mhdb ja locale（免英文有損轉譯）、技能表完整可拆解
 *   （vs Phase Z 證 EN skillTotals 為人工摘要）、護石池別標註直對珠雙池、Rise 前例一致。
 *   覆蓋量實測 EN 173 > JP 99（見 §W-F.2，據實記載，非覆蓋升級）。
 *
 * 每武種兩分頁（實測結構，§W-F.4）：
 *   - 最強装備（終盤 Meta）→ category `wildsEndgame`。build 為 h3；三表
 *     `武器｜装飾品` / `防具｜スロット｜装飾品` / `武器スキル・防具スキル・シリーズ/グループ`。
 *   - 上位おすすめ装備（HR9〜39 進度）→ category `wildsProgression`。build 為 h2；表頭變體
 *     `武器｜武器スキル／装飾品`（技能+珠合併）、`発動スキル`（單一總表）、護石列 `["護石",名]`。
 *   （序盤/下位頁為散文養成攻略、非結構化 build → 本輪 defer wildsLowRank，不爬。）
 *
 * 快取兩層：原始 HTML `.cache/html/jp-<id>.html`（gitignore）；抽取結果
 *   `.cache/game8/<weaponType>.json`（**進版控**，含兩分頁 builds）。首抓固化不覆蓋。
 *
 * 用法：
 *   node scripts/wilds/scrape-game8-mhwd.mjs            # 抓+抽全 14 武種（cache-first）
 *   node scripts/wilds/scrape-game8-mhwd.mjs --only=great-sword,bow
 *   node scripts/wilds/scrape-game8-mhwd.mjs --refresh  # 忽略 HTML 快取重抓
 *   node scripts/wilds/scrape-game8-mhwd.mjs status      # 列快取進度
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML_CACHE = path.join(HERE, ".cache", "html");
const CACHE = path.join(HERE, ".cache", "game8");
mkdirSync(HTML_CACHE, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const DELAY_MS = 2500;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const BASE = "https://game8.jp";

/** 14 武種 → { endgame:最強頁 id, progression:上位頁 id }。
 *  provenance（§W-F.4）：最強 id 自 hub /mhwilds/673589 各武種連結；上位 id 自各最強頁「上位おすすめ装備」連結。
 *  （最強編號跳過 668369；gunlance 最強實為 670772，以 hub 實連結為準。） */
export const PAGES = {
  "great-sword": { endgame: 668362, progression: 675622 },
  "long-sword": { endgame: 668363, progression: 675623 },
  "sword-shield": { endgame: 668364, progression: 675620 },
  "dual-blades": { endgame: 668365, progression: 675621 },
  hammer: { endgame: 668366, progression: 675624 },
  "hunting-horn": { endgame: 668367, progression: 675625 },
  lance: { endgame: 668368, progression: 675626 },
  gunlance: { endgame: 670772, progression: 675627 },
  "switch-axe": { endgame: 668370, progression: 675619 },
  "charge-blade": { endgame: 668371, progression: 675628 },
  "insect-glaive": { endgame: 668372, progression: 675629 },
  bow: { endgame: 668373, progression: 675630 },
  "light-bowgun": { endgame: 668374, progression: 675631 },
  "heavy-bowgun": { endgame: 668375, progression: 675632 },
};

const TIER_CATEGORY = { endgame: "wildsEndgame", progression: "wildsProgression" };
const DATA_VERSION = "1.041"; // 遊戲資料版本（Ascendance 2027 前凍結）

// ───────── HTML 工具 ─────────
const decodeEnt = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ");
const textOf = (h) => decodeEnt(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const rowsOf = (tableHtml) => [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const cellsOf = (rowHtml) =>
  rowHtml.split(/<t[dh][^>]*>/i).slice(1).map((s) => textOf(s.replace(/<\/t[dh]>[\s\S]*$/i, "")));
const cellsHtmlOf = (rowHtml) =>
  rowHtml.split(/<t[dh][^>]*>/i).slice(1).map((s) => s.replace(/<\/t[dh]>[\s\S]*$/i, ""));

/** 圈圈數字（全/半形）→ 各洞等級陣列。ー/－/-＝空洞（跳過）。 */
const SLOT_MAP = { "①": 1, "②": 2, "③": 3, "④": 4 };
const parseSlots = (s) => [...(s || "")].filter((c) => SLOT_MAP[c]).map((c) => SLOT_MAP[c]);
/** 護石池別洞（武①防①防① → [{pool:'weapon',size:1},{pool:'armor',size:1},...]）。 */
function parsePoolSlots(s) {
  const out = [];
  let pool = null;
  for (const c of s || "") {
    if (c === "武") pool = "weapon";
    else if (c === "防") pool = "armor";
    else if (SLOT_MAP[c]) out.push({ pool: pool ?? "armor", size: SLOT_MAP[c] });
  }
  return out;
}

const isDecoName = (name) => /【\d+】/.test((name || "").normalize("NFKC"));
const decoLevel = (name) => Number(((name || "").normalize("NFKC").match(/【(\d+)】/) || [])[1] || 0);

/**
 * 從一格 HTML 抽裝飾珠（layout-agnostic）：每顆為 `<a>珠名【N】</a>`，選填 `<b>xN</b>`。
 * 僅收含【\d+】者（排除技能如 抜刀術【技】＝【技】非數字、見切り Lv3＝無【】）。同名合併計數。
 */
function parseDecosFromCell(cellHtml) {
  const m = new Map();
  const re = /<a[^>]*>([\s\S]*?)<\/a>(?:\s*<b[^>]*>\s*x\s*(\d+)\s*<\/b>)?/gi;
  let mm;
  while ((mm = re.exec(cellHtml))) {
    const name = textOf(mm[1]);
    if (!isDecoName(name)) continue;
    const cnt = mm[2] ? Number(mm[2]) : 1;
    m.set(name, (m.get(name) ?? 0) + cnt);
  }
  return [...m.entries()].map(([nameJa, count]) => ({ nameJa, count }));
}

// ───────── 表分類（內容驅動，跨兩 layout 穩定）─────────
function classifyTable(tableHtml) {
  const rows = rowsOf(tableHtml);
  if (!rows.length) return null;
  // 取首個「非空」列當表頭（部分技能表首列為空 <tr></tr>，真表頭在次列的 <th colspan>）。
  const head = rows.map(cellsOf).find((c) => c.length) || [];
  const h0 = head[0] || "";
  // 武器表頭變體（全 28 頁實測）：武器｜装飾品、武器｜武器スキル／装飾品、武器｜武器スキル／スロット、
  //   武器｜武器スキル、メイン武器｜…（CB 終盤）、武器／強化パーツ｜…。技能表 h0=「武器スキル」須排除。
  const isWeaponHead = (h0 === "武器" || h0 === "メイン武器" || h0.startsWith("武器／")) && head.length >= 2;
  if (isWeaponHead) return "weapon";
  if (h0 === "防具" && head.some((c) => /スロット/.test(c))) return "armor"; // 素材表「防具｜スキル｜必要素材」不含スロット→不匹配（如實排除）
  // 技能表：表頭可能為空首列 + 次列 <th>武器スキル</th>，或散裝 <th> 於列外（malformed）。
  // 以「緊接 < 的表頭字」偵測，避開上位武器表頭「武器スキル／装飾品」（其後非 <）。
  if (/^(武器スキル|防具スキル|発動スキル|スキル)$/.test(h0)) return "skill";
  if (/>\s*(武器スキル|防具スキル|発動スキル)\s*</.test(tableHtml)) return "skill";
  return null;
}

/** 解析武器表 → { nameJa, artian, statsRaw, artianRaw, decos[], slots[] }。 */
function parseWeaponTable(tableHtml) {
  const rows = rowsOf(tableHtml);
  const cellsHtml = cellsHtmlOf(rows[1] || "");
  const firstCell = cellsHtml[0] || "";
  const anchor = (firstCell.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "";
  const anchorText = textOf(anchor); // 「名 （…アーティア武器）」
  const artian = /アーティア/.test(anchorText);
  const nameJa = anchorText.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim();
  const statsRaw = textOf((firstCell.match(/<b[^>]*>([\s\S]*?)<\/b>/) || [])[1] || "");
  const decos = parseDecosFromCell(cellsHtml[1] || ""); // 兩 layout 珠皆在第 2 格
  // 生產ボーナス（Artian）列：最強頁 row2；上位頁無。
  const artianRow = rows[2] ? cellsOf(rows[2]).join(" ") : "";
  const artianRaw = /生産ボーナス|復元強化|変異パーツ/.test(artianRow) ? artianRow : null;
  // 武器洞位：JP 表無獨立洞位欄 → 由已置珠的【N】推得（展開計數，降冪；display-only）。
  const slots = decos.flatMap((d) => Array(d.count).fill(decoLevel(d.nameJa))).sort((a, b) => b - a);
  return { nameJa, artian, statsRaw, artianRaw, decos, slots };
}

const ARMOR_SLOTS = ["head", "chest", "arms", "waist", "legs"];

/**
 * 解析防具表 → { armor[{slot,nameJa,slots[],augmentRaw}], armorDecos[合併], talisman }。
 * 護石列偵測（兩 layout）：最強頁 `[名(含護石), 武①防①防①, 技能+珠]`；上位頁 `["護石", 名]`。
 */
function parseArmorTable(tableHtml) {
  const rows = rowsOf(tableHtml);
  const armor = [];
  const decoAgg = new Map();
  let talisman = null;
  let armorIdx = 0;
  const addDecos = (list) => { for (const d of list) decoAgg.set(d.nameJa, (decoAgg.get(d.nameJa) ?? 0) + d.count); };

  for (const r of rows) {
    const cells = cellsOf(r);
    const cellsHtml = cellsHtmlOf(r);
    const c0 = cells[0] || "";
    if (c0 === "防具" && cells.some((c) => /スロット/.test(c))) continue; // 標頭
    // 護石列：cell0='護石' 標籤（上位）或 cell0 含 '護石'（最強）。
    const isCharmRow = c0 === "護石" || /護石/.test(c0);
    if (isCharmRow) {
      const nameJa = c0 === "護石" ? textOf(cellsHtml[1] || "") : c0;
      const poolSlots = parsePoolSlots(cells.find((c) => /[武防][①②③④]/.test(c)) || "");
      // 護石格技能+珠（<hr> 分隔）：珠進 armorDecos 聚合，技能忽略（skillTotals 為權威）。
      const charmDecoCell = cellsHtml[cellsHtml.length - 1] || "";
      const charmDecos = parseDecosFromCell(charmDecoCell);
      addDecos(charmDecos);
      talisman = { nameJa, poolSlots, decos: charmDecos };
      continue;
    }
    // 一般防具列：cell0=名（可含（限界突破強化）等後綴）、cell1=slots、末格=珠。
    if (armorIdx < 5 && c0) {
      const augMatch = c0.match(/（([^）]*)）|\(([^)]*)\)/);
      const nameJa = c0.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim();
      const slots = parseSlots(cells[1] || "");
      const decos = parseDecosFromCell(cellsHtml[cellsHtml.length - 1] || "");
      addDecos(decos);
      armor.push({ slot: ARMOR_SLOTS[armorIdx], nameJa, slots, augmentRaw: augMatch ? (augMatch[1] || augMatch[2]) : null, decos });
      armorIdx++;
    }
  }
  const armorDecos = [...decoAgg.entries()].map(([nameJa, count]) => ({ nameJa, count }));
  return { armor, armorDecos, talisman };
}

/** 疑似技能名（濾雜訊）。 */
const isSkillName = (s) => !!s && s !== "-" && s !== "ー" && !/【\d+】/.test((s || "").normalize("NFKC")) && s.length <= 30;

/**
 * 解析技能表（兩 layout）→ { skillTotals[{nameJa,level}], groupSetSkills[{nameJa}] }。
 * 最強頁：`武器スキル`/`防具スキル`（成對 name Lv.N）+ `シリーズスキル・グループスキル`（無 Lv 名）。
 * 上位頁：`発動スキル` 單表（name Lv.N），尾端夾雜 series/group（無 Lv 名，如 毛皮の昂揚 / 闢獣の力（力自慢Ⅱ））。
 */
function parseSkillTable(tableHtml) {
  const rows = rowsOf(tableHtml);
  const skillTotals = [];
  const groupSetSkills = [];
  let mode = "skill";
  const seenGroup = new Set();
  for (const r of rows) {
    const cells = cellsOf(r).map((c) => c.trim());
    const joined = cells.join(" ");
    if (cells.length <= 1 && /シリーズ|グループ/.test(joined)) { mode = "groupset"; continue; }
    if (cells.length <= 1 && /^(武器スキル|防具スキル|発動スキル|スキル)$/.test(cells[0] || "")) { mode = "skill"; continue; }
    for (const c of cells) {
      if (!c || c === "-" || c === "ー") continue;
      // 取「首個」name LvN（非末端錨定）：Game8「A Lv2 or B Lv2」擇一列取主技能 A、丟棄 or 後備選。
      const lv = c.normalize("NFKC").match(/^(.+?)\s*Lv\.?\s*(\d+)/);
      if (lv && isSkillName(lv[1].trim())) {
        skillTotals.push({ nameJa: lv[1].trim(), level: Number(lv[2]) });
      } else if (isSkillName(c)) {
        // 無 Lv → series/group 效果名（含「毛皮の昂揚」「闢獣の力（力自慢Ⅱ）」「防具スロ2×2」等）。
        const name = c.replace(/（[^）]*）/g, "").replace(/\s+/g, "").trim() || c;
        if (!seenGroup.has(name)) { seenGroup.add(name); groupSetSkills.push({ nameJa: c }); }
      }
    }
  }
  return { skillTotals, groupSetSkills };
}

// ───────── 整頁解析 ─────────
/** 找出 body 內建置區（截掉「ユーザーが投稿した」使用者投稿 h2 之後）。 */
function editorialBody(html) {
  const h2s = [...html.matchAll(/<h2[^>]*id="[^"]+"[^>]*>([\s\S]*?)<\/h2>/g)];
  for (const m of h2s) if (/投稿/.test(textOf(m[1]))) return html.slice(0, m.index);
  return html;
}

/** 解析一頁（單一 tier）→ builds[]。以 weapon 表為 build 錨，攔截其後 armor/skill 表（至下個 weapon 表）。 */
function parsePage(html, weaponType, tier, url) {
  const body = editorialBody(html);
  const category = TIER_CATEGORY[tier];
  const headings = [...body.matchAll(/<h([234])[^>]*id="[^"]+"[^>]*>([\s\S]*?)<\/h[234]>/g)]
    .map((m) => ({ pos: m.index, name: textOf(m[2]) }));
  const nearestHeading = (pos) => { let best = ""; for (const h of headings) { if (h.pos < pos) best = h.name; else break; } return best; };

  const tables = [...body.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => ({ html: m[0], pos: m.index, type: classifyTable(m[0]) }));
  const builds = [];
  let cur = null;
  let idx = 0;
  const verWarnings = [];
  for (const t of tables) {
    if (t.type === "weapon") {
      if (cur) builds.push(cur);
      const w = parseWeaponTable(t.html);
      cur = {
        id: `${weaponType}_${category}_${idx++}`,
        weaponType, category, kind: "full-build",
        buildName: nearestHeading(t.pos), sourceUrl: url,
        weapon: w.nameJa, weaponStats: w.statsRaw, weaponSlots: w.slots,
        weaponDecos: w.decos, artian: w.artian, artianRaw: w.artianRaw,
        armor: [], armorDecos: [], talisman: null,
        skillTotals: [], groupSetSkills: [],
      };
      if (/\bTU5\b|Abyssal/i.test(t.html)) verWarnings.push(cur.buildName);
    } else if (t.type === "armor" && cur) {
      const a = parseArmorTable(t.html);
      cur.armor = a.armor; cur.armorDecos = a.armorDecos; cur.talisman = a.talisman;
    } else if (t.type === "skill" && cur) {
      const s = parseSkillTable(t.html);
      cur.skillTotals = s.skillTotals; cur.groupSetSkills = s.groupSetSkills;
    }
  }
  if (cur) builds.push(cur);
  // 完整性：armor 5 件 + skillTotals 非空 + weapon。不完整逐筆分類（§1.2）：
  //   (a) 源未提供 full-build（無「発動スキル」總表；只有武器建議側註「◯◯もおすすめ」、
  //       或早期「防具｜スキル｜必要素材」素材養成表〔全 28 頁僅 CB HR9〜19 一例〕）→ 如實排除。
  //   (b) 抽取器漏抽 → 修抽取器（本輪已修：技能表空首列 + 散裝 <th> 表頭變體）。
  for (const b of builds) {
    b.complete = b.armor.length === 5 && b.skillTotals.length > 0 && !!b.weapon;
    if (!b.complete) {
      b.excludeReason =
        b.skillTotals.length === 0 && b.weapon
          ? "a:non-fullbuild" // 無発動スキル總表 → 源提供側註/素材表，非 full-build
          : "review"; // 有技能卻缺 armor＝抽取器漏抽（不應殘留）
    }
  }
  return { builds, verWarnings };
}

// ───────── 抓取（cache-first）─────────
async function fetchHtml(id, refresh) {
  const f = path.join(HTML_CACHE, `jp-${id}.html`);
  if (existsSync(f) && !refresh) return readFileSync(f, "utf8");
  const url = `${BASE}/mhwilds/${id}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  const html = await res.text();
  writeFileSync(f, html, "utf8");
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return html;
}

const jpUpdatedAt = (html) => (html.match(/更新日：\s*([0-9.]+)/) || [])[1] || null;

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "status") {
    const done = readdirSync(CACHE).filter((f) => f.endsWith(".json"));
    console.log(`[game8-jp] 抽取快取：${done.length}/14 武種`);
    for (const f of done) {
      const d = JSON.parse(readFileSync(path.join(CACHE, f), "utf8"));
      const comp = d.builds.filter((b) => b.complete).length;
      const eg = d.builds.filter((b) => b.category === "wildsEndgame").length;
      const pr = d.builds.filter((b) => b.category === "wildsProgression").length;
      console.log(`  ${f.replace(".json", "").padEnd(14)} ${d.builds.length} builds（完整 ${comp}／最強 ${eg}／上位 ${pr}）  ${d.scrapedAt}`);
    }
    return;
  }
  const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const refresh = args.includes("--refresh");
  const scrapedAt = args.find((a) => a.startsWith("--date="))?.slice(7) || new Date().toISOString().slice(0, 10);

  const targets = Object.entries(PAGES).filter(([wt]) => only.length === 0 || only.includes(wt));
  for (const [wt, ids] of targets) {
    const out = path.join(CACHE, `${wt}.json`);
    if (existsSync(out) && !refresh) {
      const d = JSON.parse(readFileSync(out, "utf8"));
      console.log(`[game8-jp] ${wt.padEnd(14)} 抽取快取已存在（${d.builds.length} builds）— 首抓固化不覆蓋`);
      continue;
    }
    const builds = [];
    const sources = {};
    const allVerWarnings = [];
    let jpDate = null;
    for (const tier of ["endgame", "progression"]) {
      const html = await fetchHtml(ids[tier], refresh);
      const url = `${BASE}/mhwilds/${ids[tier]}`;
      const { builds: bs, verWarnings } = parsePage(html, wt, tier, url);
      builds.push(...bs);
      sources[tier] = { url, jpUpdatedAt: jpUpdatedAt(html) };
      jpDate = jpDate || jpUpdatedAt(html);
      allVerWarnings.push(...verWarnings);
    }
    const data = { weaponType: wt, scrapedAt, dataVersion: DATA_VERSION, jpUpdatedAt: jpDate, sources, builds };
    writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
    const comp = builds.filter((b) => b.complete).length;
    const artian = builds.filter((b) => b.artian).length;
    const eg = builds.filter((b) => b.category === "wildsEndgame").length;
    const pr = builds.filter((b) => b.category === "wildsProgression").length;
    console.log(
      `[game8-jp] ${wt.padEnd(14)} ${String(builds.length).padStart(2)} builds（完整 ${comp}／最強 ${eg}／上位 ${pr}／Artian ${artian}）` +
        (allVerWarnings.length ? `  ⚠ 版號警告：${allVerWarnings.join(",")}` : "")
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
