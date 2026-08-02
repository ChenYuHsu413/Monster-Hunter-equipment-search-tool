/**
 * Game8 Wilds 推薦配裝爬取（逐頁瀏覽器渲染 → 快取固化）。方法見 docs/wilds-game8-audit.md。
 *
 * Game8 build 頁為 JS 渲染，明細為結構化表格。爬取採「瀏覽器渲染已載入頁 → 於 console 執行
 * EXTRACTOR → JSON 進快取 .cache/game8/<weaponType>.json（含 url+scrapedAt，首抓不覆蓋、跨輪續跑）」。
 * import-game8（下輪）讀快取做 EN→id 映射與 achievability 重算，不重爬。
 *
 * 用法：
 *   1. 於瀏覽器導航到某武器 build 頁（PAGES 表），貼 EXTRACTOR 進 console 取 JSON。
 *   2. `node scripts/wilds/scrape-game8-mhwd.mjs save <weaponType> <jsonFile>` 寫入快取（不覆蓋既有）。
 *   3. `node scripts/wilds/scrape-game8-mhwd.mjs status` 列快取進度。
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, ".cache", "game8");
mkdirSync(CACHE, { recursive: true });

/** 14 武器 build 頁（Game8 Wilds，Ver 1.041 體系）。待補的 archives 續輪由站內搜尋補齊。 */
export const PAGES = {
  "great-sword": "https://game8.co/games/Monster-Hunter-Wilds/archives/502430",
  hammer: "https://game8.co/games/Monster-Hunter-Wilds/archives/502505",
  "sword-shield": "https://game8.co/games/Monster-Hunter-Wilds/archives/503090",
  "hunting-horn": "https://game8.co/games/Monster-Hunter-Wilds/archives/502508",
  gunlance: "https://game8.co/games/Monster-Hunter-Wilds/archives/503030",
  bow: "https://game8.co/games/Monster-Hunter-Wilds/archives/503042",
  "insect-glaive": "https://game8.co/games/Monster-Hunter-Wilds/archives/502439",
  // 待補 URL（下輪站內搜尋）：long-sword / dual-blades / lance / switch-axe / charge-blade /
  //                              light-bowgun / heavy-bowgun
};

/**
 * 瀏覽器 console 抽取器（貼上執行 → 回傳 { url, weaponType, scrapedAt, builds[] }）。
 * 以「Weapon|Rarity|ATK」表為 build 起點，收 armor/decos/talisman/skillTotals（=重算目標）。
 * 完整版本見本輪 session 記錄；此常數供續輪重用。
 */
export const EXTRACTOR_NOTE =
  "見 docs/wilds-game8-audit.md §3；抽取器於瀏覽器 console 對已渲染 Game8 頁執行。";

const cmd = process.argv[2];
if (cmd === "save") {
  const wt = process.argv[3];
  const file = process.argv[4];
  if (!wt || !file) throw new Error("用法：save <weaponType> <jsonFile>");
  const out = path.join(CACHE, `${wt}.json`);
  if (existsSync(out)) {
    console.log(`[game8] ${wt} 快取已存在，不覆蓋（快取固化）。`);
  } else {
    const data = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(out, JSON.stringify(data) + "\n", "utf8");
    console.log(`[game8] 寫入 ${wt}.json（${data.builds?.length ?? 0} builds）`);
  }
} else {
  // status
  const done = existsSync(CACHE) ? readdirSync(CACHE).filter((f) => f.endsWith(".json")) : [];
  console.log(`[game8] 快取進度：${done.length}/14 武種`);
  for (const f of done) {
    const d = JSON.parse(readFileSync(path.join(CACHE, f), "utf8"));
    console.log(`  ${f}: ${d.builds?.length ?? 0} builds（${d.scrapedAt}）`);
  }
  console.log(`  待補 URL 武種：${Object.keys(PAGES).length}/14 已知；其餘續輪站內搜尋。`);
}
