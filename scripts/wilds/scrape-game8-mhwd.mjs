/**
 * Game8 Wilds 推薦配裝爬取（fetch → 靜態 HTML 解析 → 快取固化）。方法見 docs/wilds-game8-audit.md。
 *
 * ★ 方法修正（Phase 6b，實測翻案）：Phase 6 前半 audit 記「Game8 build 頁為 JS 渲染、需瀏覽器」。
 *   實測 `fetch()` GS 頁得 923KB 靜態 HTML，build 明細表（Best Weapon / Armor Loadout / Skill
 *   Summary）**全在初始 HTML**（React 摘要表另有 fallback 靜態表）。故改用與 World
 *   `scrape-game8-mhwi.mjs` 同款「fetch → 解析 → 快取」可重跑管線，取代半自動瀏覽器 console 抽取。
 *
 * 快取兩層：
 *   - 原始 HTML：.cache/html/<archiveId>.html（gitignore，大、可重抓）。
 *   - 抽取結果：.cache/game8/<weaponType>.json（**進版控**，Phase 6b 裁決：跨機開發常態、
 *     單副本風險已實際發生、內容為結構化事實資料，見 audit「快取版控修正」節）。含 url+scrapedAt。
 *
 * 用法：
 *   node scripts/wilds/scrape-game8-mhwd.mjs            # 抓+抽全 14 頁（cache-first）
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

/** 14 武器 build 頁（Game8 Wilds High Rank，Ver 1.041 體系）。archives id 由 GS 頁「All Weapon
 *  Builds」區塊站內交叉取得（Phase 6b 補齊 7 個待補；sword-shield/hammer 與前半已知一致，互證）。 */
export const PAGES = {
  "great-sword": "https://game8.co/games/Monster-Hunter-Wilds/archives/502430",
  "long-sword": "https://game8.co/games/Monster-Hunter-Wilds/archives/502435",
  "sword-shield": "https://game8.co/games/Monster-Hunter-Wilds/archives/503090",
  "dual-blades": "https://game8.co/games/Monster-Hunter-Wilds/archives/501198",
  hammer: "https://game8.co/games/Monster-Hunter-Wilds/archives/502505",
  "hunting-horn": "https://game8.co/games/Monster-Hunter-Wilds/archives/502508",
  lance: "https://game8.co/games/Monster-Hunter-Wilds/archives/503092",
  gunlance: "https://game8.co/games/Monster-Hunter-Wilds/archives/503030",
  "switch-axe": "https://game8.co/games/Monster-Hunter-Wilds/archives/502864",
  "charge-blade": "https://game8.co/games/Monster-Hunter-Wilds/archives/503022",
  "insect-glaive": "https://game8.co/games/Monster-Hunter-Wilds/archives/502439",
  bow: "https://game8.co/games/Monster-Hunter-Wilds/archives/503042",
  "light-bowgun": "https://game8.co/games/Monster-Hunter-Wilds/archives/502870",
  "heavy-bowgun": "https://game8.co/games/Monster-Hunter-Wilds/archives/502810",
};

// ───────── HTML 工具 ─────────
const decodeEnt = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ");
const textOf = (h) => decodeEnt(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const rowsOf = (tableHtml) => [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
// Game8 常有未閉合 <td>：以「開啟標籤」切格。
const cellsOf = (rowHtml) =>
  rowHtml.split(/<t[dh][^>]*>/i).slice(1).map((s) => textOf(s.replace(/<\/tr>[\s\S]*$/i, "")));
const tablesOf = (html) => [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);

/** 圈圈數字 → 各洞等級陣列（③③③ → [3,3,3]）。 */
const SLOT_MAP = { "①": 1, "②": 2, "③": 3, "④": 4 };
const parseSlots = (s) => [...(s || "")].filter((c) => SLOT_MAP[c]).map((c) => SLOT_MAP[c]);

/**
 * 解析一格內的裝飾珠：每顆為 `<div class="align"> <a><img alt="Name Icon">Name</a> <b>xN</b> </div>`。
 * 珠名取自 img alt（去尾綴「 Icon」），數量取自 <b>xN</b>（缺則 1）。回傳 [{nameEn,count}]。
 */
function parseDecoCell(cellHtml) {
  const out = [];
  for (const blk of cellHtml.split(/<div class="align">/).slice(1)) {
    const alt = (blk.match(/alt="([^"]*?)\s*(?:Icon)?"/) || [])[1];
    if (!alt || !/【\d+】/.test(alt)) continue; // 只收帶【N】的珠
    const cnt = (blk.match(/<b[^>]*>\s*x\s*(\d+)/i) || [])[1];
    out.push({ nameEn: alt.trim(), count: cnt ? Number(cnt) : 1 });
  }
  return out;
}

/** 一列首個 <td> 的裝備名。優先取連結文字（Game8 alt 遇撇號會截斷，如「True Omega」缺「's Rod」），
 *  退回 img alt（去「Monster Hunter Wilds - 」前綴／「 Icon」尾綴）。 */
function firstEquipName(rowHtml) {
  const firstTd = rowHtml.split(/<t[dh][^>]*>/i)[1] || "";
  const anchor = (firstTd.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "";
  const linkText = textOf(anchor); // 去 img 等標籤後的錨文字＝完整裝備名
  if (linkText) return linkText;
  const alt = (firstTd.match(/alt="([^"]+)"/) || [])[1] || "";
  return alt.replace(/^Monster Hunter Wilds\s*-\s*/, "").replace(/\s*Icon$/, "").trim();
}

const ARMOR_SLOTS = ["head", "chest", "arms", "waist", "legs"];

/** 分類單一 table 型別（內容驅動，跨 14 武種穩定，不靠 H4 標題）。 */
function classifyTable(tableHtml) {
  const rows = rowsOf(tableHtml);
  if (!rows.length) return null;
  const head = cellsOf(rows[0]).map((c) => c.toLowerCase());
  const flat = rows.flatMap((r) => cellsOf(r).map((c) => c.toLowerCase()));
  if (head[0] === "weapon" && head.includes("rarity")) return "weaponStats";
  if (flat[0]?.startsWith("weapon decorations")) return "weaponDecos";
  if (flat[0]?.startsWith("production bonus")) return "artian";
  if (head[0] === "armor" && head.includes("slots")) return "armorLoadout";
  // 技能總表標頭跨頁有變體："Weapon(s)/Armor Skills"（雙軌，含 Game8 錯字複數）或單一"Build Skill List"。
  if (flat.some((c) => /^weapons? skills$/.test(c) || /^armor skills$/.test(c) || /build skill list/.test(c)))
    return "skillSummary";
  return null;
}

/** 解析裝備表（weaponStats）：回傳 { nameEn, slots[] }。 */
function parseWeaponStats(tableHtml) {
  const rows = rowsOf(tableHtml);
  const nameEn = firstEquipName(rows[1] || "");
  // 找 Slots 標頭後一列的圈圈數字
  let slots = [];
  for (let i = 0; i < rows.length; i++) {
    if (cellsOf(rows[i]).some((c) => /^slots$/i.test(c))) {
      const next = cellsOf(rows[i + 1] || "");
      slots = parseSlots(next[0] || "");
      break;
    }
  }
  return { nameEn, slots };
}

/** 解析 Production Bonus（Artian）表 → 原文摘要（用於未模擬旗標與 UI 標示）。 */
function parseArtian(tableHtml) {
  const rows = rowsOf(tableHtml);
  const lines = rows.map((r) => cellsOf(r).join(" | ")).filter(Boolean);
  const joined = lines.join(" ");
  return {
    focus: (joined.match(/Focus\s*:\s*([^|]+?)(?:Set Skill|Group Skill|$)/i) || [])[1]?.trim() || null,
    setSkill: (joined.match(/Set Skill\s*:\s*([^|]+?)(?:Group Skill|$)/i) || [])[1]?.trim() || null,
    groupSkill: (joined.match(/Group Skill\s*:\s*([^|]+?)(?:Focus|Set Skill|$)/i) || [])[1]?.trim() || null,
    raw: lines.slice(0, 4),
  };
}

/** 解析 Armor Loadout 表 → { armor[{slot,nameEn}], armorDecos[{nameEn,count}], talisman }。 */
function parseArmorLoadout(tableHtml) {
  const rows = rowsOf(tableHtml);
  const armor = [];
  let armorDecos = [];
  let talisman = null;
  let armorIdx = 0;
  for (const r of rows) {
    const cells = cellsOf(r);
    const label = (cells[0] || "").toLowerCase();
    if (label === "armor" && cells.some((c) => /slots/i.test(c))) continue; // 標頭
    if (label.startsWith("armor decorations")) {
      const td = r.split(/<th[^>]*>[\s\S]*?<\/th>/i).join("") ; // 去 th
      armorDecos = parseDecoCell(r);
      continue;
    }
    if (label.startsWith("talisman")) {
      talisman = firstEquipName(r) || textOf(cells[1] || "") || null;
      // 護石名常為純文字（非連結）：退回第二格文字
      if (!talisman || /【\d+】/.test(talisman)) talisman = textOf((r.match(/<td[^>]*>([\s\S]*?)<\/td>/) || [])[1] || "") || talisman;
      continue;
    }
    if (label.startsWith("def and res") || label.startsWith("def") ) continue;
    // 一般防具列：首格為裝備名
    const nameEn = firstEquipName(r);
    if (nameEn && armorIdx < 5) {
      armor.push({ slot: ARMOR_SLOTS[armorIdx], nameEn });
      armorIdx++;
    }
  }
  return { armor, armorDecos, talisman };
}

/** 疑似技能名（濾掉 Game8「Skill Buffs Breakdown」內的 EFR/親和分析行污染）。 */
const isSkillName = (s) =>
  !!s && s !== "-" && s !== "ー" &&
  !/[・%|]/.test(s) && !/lowest-highest/i.test(s) && s.length <= 35 &&
  !/^skill buffs breakdown$/i.test(s);

/** 解析 Skill Summary 表 → { skillTotals[{nameEn,level}], groupSetSkills[nameEn] }。 */
function parseSkillSummary(tableHtml) {
  const rows = rowsOf(tableHtml);
  const skillTotals = [];
  const groupSetSkills = [];
  let mode = "skill";
  for (const r of rows) {
    const cells = cellsOf(r).map((c) => c.trim());
    const joined = cells.join(" ").toLowerCase();
    // 「Skill Buffs Breakdown」起為 EFR/親和分析區（非技能）→ 全段忽略。
    if (/skill buffs breakdown/.test(joined)) { mode = "ignore"; continue; }
    if (/group\s*\/?\s*set skills/.test(joined) && cells.length <= 2) { mode = "groupset"; continue; }
    if (/^weapons? skills$/i.test(cells[0] || "") || /^armor skills$/i.test(cells[0] || "") || /^build skill list$/i.test(cells[0] || "")) { mode = "skill"; continue; }
    if (mode === "ignore") continue;
    if (mode === "groupset") {
      for (const c of cells) if (isSkillName(c)) groupSetSkills.push(c);
      continue;
    }
    // 技能列：成對 (name, level)
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const name = cells[i];
      if (!isSkillName(name)) continue;
      const lv = Number((cells[i + 1] || "").match(/\d+/)?.[0] ?? NaN);
      if (Number.isFinite(lv)) skillTotals.push({ nameEn: name, level: lv });
    }
  }
  return { skillTotals, groupSetSkills };
}

// ───────── zone → category ─────────
function categoryOf(h2) {
  // 各武種頁 h2 有單複數混用（"...Build (HR 36++)" vs "...Builds (HR 100++)"）。
  const m = h2.match(/High Rank Builds?\s*\(HR\s*(\d+)/i);
  if (!m) return null; // 導覽/相關區塊
  if (/Endgame/i.test(h2)) return "wildsEndgame";
  return Number(m[1]) >= 50 ? "wildsHighRank" : "wildsProgression"; // 36/21/9 → progression
}

/** 解析整頁 → builds[]。走 body h2/h3；h3 段內以內容分類 table。 */
function parsePage(html, weaponType, url) {
  const H = [...html.matchAll(/<h([234]) class="a-header--[234]" id="([^"]+)">([^<]*)<\/h[234]>/g)]
    .map((m) => ({ lvl: +m[1], name: decodeEnt(m[3]).trim(), pos: m.index }));
  const builds = [];
  let curCat = null;
  const idxByCat = {};
  const verWarnings = [];
  for (let i = 0; i < H.length; i++) {
    const hd = H[i];
    if (hd.lvl === 2) { curCat = categoryOf(hd.name); continue; }
    if (hd.lvl === 3 && curCat) {
      const next = H.slice(i + 1).find((x) => x.lvl <= 3);
      const seg = html.slice(hd.pos, next ? next.pos : hd.pos + 30000);
      // 版號合規：段內不得出現 TU5/Abyssal（PLAN §A.3 假訊息）
      if (/\bTU5\b|Abyssal/i.test(seg)) verWarnings.push(hd.name);
      const b = parseBuild(seg, weaponType, curCat, hd.name, url, (idxByCat[curCat] = (idxByCat[curCat] ?? -1) + 1));
      if (b) builds.push(b);
    }
  }
  return { builds, verWarnings };
}

function parseBuild(seg, weaponType, category, buildName, url, idx) {
  const build = {
    id: `${weaponType}_${category}_${idx}`,
    weaponType, category, kind: "full-build",
    buildName, sourceUrl: url,
    weapon: null, weaponSlots: [], weaponDecos: [], artian: null,
    armor: [], armorDecos: [], talisman: null,
    skillTotals: [], groupSetSkills: [],
  };
  for (const tbl of tablesOf(seg)) {
    switch (classifyTable(tbl)) {
      case "weaponStats": {
        const w = parseWeaponStats(tbl);
        build.weapon = w.nameEn;
        build.weaponSlots = w.slots;
        break;
      }
      case "weaponDecos":
        build.weaponDecos = parseDecoCell(tbl);
        break;
      case "artian":
        build.artian = parseArtian(tbl);
        break;
      case "armorLoadout": {
        const a = parseArmorLoadout(tbl);
        build.armor = a.armor;
        build.armorDecos = a.armorDecos;
        build.talisman = a.talisman;
        break;
      }
      case "skillSummary": {
        const s = parseSkillSummary(tbl);
        build.skillTotals = s.skillTotals;
        build.groupSetSkills = s.groupSetSkills;
        break;
      }
    }
  }
  // 完整性：需 armor 5 件 + skillTotals 非空。不完整逐筆分類（§1.2）：
  //   (a) Game8 未提供 build（如「Build Playstyle and Combos」導覽段，無任何裝備表）→ 如實排除。
  //   (b) 抽取器漏抽 → 修抽取器重抽（本輪已修：複數"Builds"分區標頭、"Build Skill List"／
  //       "Weapons Skills"技能表變體）。
  build.complete = build.armor.length === 5 && build.skillTotals.length > 0;
  if (!build.complete) {
    build.excludeReason =
      build.armor.length === 0 && build.skillTotals.length === 0 && !build.weapon
        ? "a:non-build-section" // 導覽/combos 段，非配裝
        : "review"; // 需人工複核（不應殘留）
  }
  return build;
}

// ───────── 抓取（cache-first）─────────
async function fetchHtml(url, refresh) {
  const id = url.match(/archives\/(\d+)/)[1];
  const f = path.join(HTML_CACHE, `${id}.html`);
  if (existsSync(f) && !refresh) return readFileSync(f, "utf8");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  const html = await res.text();
  writeFileSync(f, html, "utf8");
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return html;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "status") {
    const done = readdirSync(CACHE).filter((f) => f.endsWith(".json"));
    console.log(`[game8] 抽取快取：${done.length}/14 武種`);
    for (const f of done) {
      const d = JSON.parse(readFileSync(path.join(CACHE, f), "utf8"));
      const comp = d.builds.filter((b) => b.complete).length;
      console.log(`  ${f.replace(".json", "").padEnd(14)} ${d.builds.length} builds（完整 ${comp}）  ${d.scrapedAt}`);
    }
    return;
  }
  const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const refresh = args.includes("--refresh");
  const scrapedAt = args.find((a) => a.startsWith("--date="))?.slice(7) || new Date().toISOString().slice(0, 10);

  const targets = Object.entries(PAGES).filter(([wt]) => only.length === 0 || only.includes(wt));
  for (const [wt, url] of targets) {
    const out = path.join(CACHE, `${wt}.json`);
    if (existsSync(out) && !refresh) {
      const d = JSON.parse(readFileSync(out, "utf8"));
      console.log(`[game8] ${wt.padEnd(14)} 抽取快取已存在（${d.builds.length} builds）— 首抓固化不覆蓋`);
      continue;
    }
    const html = await fetchHtml(url, refresh);
    const { builds, verWarnings } = parsePage(html, wt, url);
    const data = { url, weaponType: wt, scrapedAt, dataVersion: "1.041", builds };
    writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
    const comp = builds.filter((b) => b.complete).length;
    const artian = builds.filter((b) => b.artian).length;
    console.log(
      `[game8] ${wt.padEnd(14)} ${String(builds.length).padStart(2)} builds（完整 ${comp}／Artian ${artian}）` +
        (verWarnings.length ? `  ⚠ 版號警告：${verWarnings.join(",")}` : "")
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
