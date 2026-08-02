/**
 * Wilds 資料版本 diff 報告骨架（PLAN-wilds Phase 2 §3；為 Ascendance 版本漂移預留）。
 * 吃兩份帶版本的資料目錄，按類目分節、每節「新增/移除/變更」三類，以 id 為鍵比對。
 *
 *   node scripts/wilds/diff-report.mjs <dirA> <dirB>
 *   node scripts/wilds/diff-report.mjs                    # 預設自我 diff（src/data/wilds vs 自己）→ 空報告，驗證可跑
 *
 * 本計畫不跑真 diff（只有 1.041 一版）；自我 diff 空報告證明骨架可跑。
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "wilds");
const dirA = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT;
const dirB = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT;

const FILES = ["armors", "weapons", "decorations", "charms", "skills", "setBonuses", "groupSkills"];
const load = (dir, f) => {
  const p = path.join(dir, `${f}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
};
const ver = (dir) => {
  const p = path.join(dir, "manifest.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).dataVersion : "?";
};

console.log(`# Wilds 資料 diff：${ver(dirA)}（A）→ ${ver(dirB)}（B）`);
console.log(`A=${dirA}\nB=${dirB}\n`);

let totalAdded = 0, totalRemoved = 0, totalChanged = 0;
for (const f of FILES) {
  const a = new Map(load(dirA, f).map((x) => [x.id, x]));
  const b = new Map(load(dirB, f).map((x) => [x.id, x]));
  const added = [...b.keys()].filter((id) => !a.has(id));
  const removed = [...a.keys()].filter((id) => !b.has(id));
  const changed = [...a.keys()].filter(
    (id) => b.has(id) && JSON.stringify(a.get(id)) !== JSON.stringify(b.get(id))
  );
  totalAdded += added.length; totalRemoved += removed.length; totalChanged += changed.length;
  if (added.length + removed.length + changed.length === 0) {
    console.log(`## ${f}: 無變更`);
    continue;
  }
  console.log(`## ${f}: +${added.length} / -${removed.length} / ~${changed.length}`);
  if (added.length) console.log(`  新增: ${added.slice(0, 20).join(", ")}${added.length > 20 ? " …" : ""}`);
  if (removed.length) console.log(`  移除: ${removed.slice(0, 20).join(", ")}${removed.length > 20 ? " …" : ""}`);
  if (changed.length) console.log(`  變更: ${changed.slice(0, 20).join(", ")}${changed.length > 20 ? " …" : ""}`);
}

console.log(`\n總計：新增 ${totalAdded} / 移除 ${totalRemoved} / 變更 ${totalChanged}`);
if (dirA === dirB) console.log("（自我 diff → 空報告 = 骨架可跑 ✓）");
