/**
 * 統一回歸閘門：單一指令跑完三遊戲全部檢查（尾巴 W-C）。
 *
 *   node scripts/regression-all.mjs --check    # 四段全 --check，任一失敗 → exit 1
 *   node scripts/regression-all.mjs --write     # 僅兩基準段 --write（重建基準；慎用）
 *
 * 四段（各自子行程、獨立 register loader / process.exit、互不干擾；聚合退出碼）：
 *   1. Rise 逐位元基準   regression-baseline.mjs   （--check/--write）
 *   2. World 逐位元基準  regression-world.mjs      （--check/--write）
 *   3. Wilds 引擎冒煙    wilds/smoke-wilds.mjs      （斷言腳本，無 flag；--write 時略過）
 *   4. Wilds EFR 測試   wilds/test-efr-wilds.mjs   （斷言腳本，無 flag；--write 時略過）
 *
 * Rise/World harness 本體零改動（sibling 設計）；wilds 斷言腳本 exit(fail?1:0)，本 runner 消費退出碼。
 * --write 只重建基準（Rise/World），wilds 為純斷言（無基準可寫）故略過。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const isWrite = process.argv.includes("--write");
const flag = isWrite ? "--write" : process.argv.includes("--check") ? "--check" : "";

// 逐位元基準段（吃 flag）；Wilds 斷言段（無 flag，--write 時略過）。
const TARGETS = [
  { label: "Rise 逐位元", script: "regression-baseline.mjs", takesFlag: true },
  { label: "World 逐位元", script: "regression-world.mjs", takesFlag: true },
  { label: "Wilds 冒煙", script: "wilds/smoke-wilds.mjs", takesFlag: false, skipOnWrite: true },
  { label: "Wilds EFR", script: "wilds/test-efr-wilds.mjs", takesFlag: false, skipOnWrite: true },
];

const results = [];
for (const t of TARGETS) {
  if (isWrite && t.skipOnWrite) {
    console.log(`\n═══════════ ${t.label}（${t.script}）─ --write 略過（純斷言、無基準）═══════════`);
    results.push({ label: t.label, status: "SKIP" });
    continue;
  }
  const args = t.takesFlag && flag ? [flag] : [];
  console.log(`\n═══════════ ${t.label}（${t.script} ${args[0] ?? "run"}）═══════════`);
  const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, t.script), ...args], { stdio: "inherit" });
  const ok = r.status === 0;
  if (!ok) console.error(`[regression-all] ${t.label} 失敗（exit ${r.status}）`);
  results.push({ label: t.label, status: ok ? "PASS" : "FAIL" });
}

const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n─────────── 統一閘門總結 ───────────`);
for (const r of results) console.log(`  ${r.status.padEnd(4)}  ${r.label}`);
if (failed) {
  console.error(`\n[regression-all] FAILED: ${failed} 段未通過。`);
  process.exit(1);
}
console.log(`\n[regression-all] PASS: 三遊戲全部檢查通過（Rise + World 逐位元 + Wilds 冒煙 + Wilds EFR）。`);
