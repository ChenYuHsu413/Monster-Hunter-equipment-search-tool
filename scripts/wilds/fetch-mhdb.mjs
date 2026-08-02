/**
 * Wilds 主源抓取：mhdb-wilds API（wilds.mhdb.io），en + zh-Hant 兩 locale。
 * 產出快取到 scripts/wilds/.cache/{category}.{locale}.json（gitignore，重跑零抓取）。
 *
 *   node scripts/wilds/fetch-mhdb.mjs          # 缺檔才抓（快取在時零抓取）
 *   node scripts/wilds/fetch-mhdb.mjs --force    # 強制重抓
 *
 * pin 策略（docs/wilds-data-source-audit.md §5）：純 live API，無 commit 可 pin，
 * 故記 snapshot 日期 + 全類目筆數指紋於 _meta.json（首抓時寫一次，重跑不覆蓋 → import 決定性）。
 * 全類目為完整下載（Phase 2 全量匯入，非 Phase 0 抽樣）。
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, ".cache");
const BASE = "https://wilds.mhdb.io";
const CATEGORIES = ["armor", "weapons", "decorations", "charms", "skills"];
const LOCALES = ["en", "zh-Hant"];
const force = process.argv.includes("--force");

mkdirSync(CACHE, { recursive: true });

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

const counts = {};
for (const cat of CATEGORIES) {
  for (const loc of LOCALES) {
    const file = path.join(CACHE, `${cat}.${loc}.json`);
    if (existsSync(file) && !force) {
      const n = JSON.parse(readFileSync(file, "utf8")).length;
      console.log(`[cache] ${cat}.${loc} (${n})`);
      if (loc === "en") counts[cat] = n;
      continue;
    }
    const url = `${BASE}/${loc}/${cat}`;
    process.stdout.write(`[fetch] ${url} ... `);
    const data = await fetchJson(url);
    writeFileSync(file, JSON.stringify(data) + "\n", "utf8");
    console.log(`ok (${data.length})`);
    if (loc === "en") counts[cat] = data.length;
    await new Promise((r) => setTimeout(r, 500)); // 禮貌間隔
  }
}

// _meta：snapshot 日期 + 筆數指紋（首抓寫一次，之後不覆蓋 → import 讀取決定性）。
const metaFile = path.join(CACHE, "_meta.json");
if (!existsSync(metaFile) || force) {
  const meta = {
    source: "mhdb-wilds (wilds.mhdb.io)",
    snapshotDate: new Date().toISOString().slice(0, 10),
    counts,
  };
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n", "utf8");
  console.log("[meta] written:", JSON.stringify(meta.counts));
} else {
  console.log("[meta] kept existing (重跑不覆蓋 → import 決定性)");
}
console.log("done.");
