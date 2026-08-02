/**
 * 統一回歸閘門：單一指令同時跑 Rise + World 逐位元基準（PLAN-wilds Phase 1）。
 *
 *   node scripts/regression-all.mjs --check    # 兩者皆 --check，任一失敗 → exit 1
 *   node scripts/regression-all.mjs --write     # 兩者皆 --write（重建基準；慎用）
 *
 * 以子行程分別跑 regression-baseline.mjs（Rise）與 regression-world.mjs（World），
 * 各自獨立 register loader / process.exit，互不干擾；聚合退出碼。
 * Rise harness 一行未動（sibling 設計）——World 基準與其解耦，卻由本 runner 統一為
 * 一道閘門指令（每輪推送前跑此指令即涵蓋兩遊戲）。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const flag = process.argv.includes("--write")
  ? "--write"
  : process.argv.includes("--check")
    ? "--check"
    : "";

const TARGETS = [
  { label: "Rise", script: "regression-baseline.mjs" },
  { label: "World", script: "regression-world.mjs" },
];

let failed = 0;
for (const t of TARGETS) {
  console.log(`\n═══════════ ${t.label} 回歸（${t.script} ${flag || "print"}）═══════════`);
  const r = spawnSync(
    process.execPath,
    [path.join(SCRIPTS_DIR, t.script), ...(flag ? [flag] : [])],
    { stdio: "inherit" }
  );
  if (r.status !== 0) {
    failed++;
    console.error(`[regression-all] ${t.label} 失敗（exit ${r.status}）`);
  }
}

if (failed) {
  console.error(`\n[regression-all] FAILED: ${failed}/${TARGETS.length} 遊戲基準未通過。`);
  process.exit(1);
}
console.log(`\n[regression-all] PASS: Rise + World 全部逐位元通過。`);
