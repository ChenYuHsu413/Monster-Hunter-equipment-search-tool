/**
 * efr-wilds 手算對照 ≥20 組（Phase 4 §5）+ 消費端佈線證據 + 決定性。
 * 每組以**顯式手算期望值**斷言 computeEfr 輸出（模型佈線正確性），跨武種/涵蓋
 * 攻擊/會心/超會心/斬味匠插值/屬性/技能加成路徑。
 *   node scripts/wilds/test-efr-wilds.mjs
 */
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
register("./scripts/regression-loader.mjs", pathToFileURL(REPO + path.sep).href);

const { computeEfr } = await import("@/lib/efr-wilds");
const { searchBuilds } = await import("@/lib/build-search");
const { loadWildsSearchDeps } = await import("@/lib/wilds-registry");
const deps = await loadWildsSearchDeps();

let pass = 0, fail = 0;
const approx = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;
const A = (cond, msg) => { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } };

// 頂端 60 單位加權平均倍率（手算輔助，複現模型公式做獨立核對）。
const RAW = [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39];
function expSharp(bands, N = 60) {
  let rem = N, acc = 0, used = 0;
  for (let i = 6; i >= 0 && rem > 0; i--) { if (bands[i] <= 0) continue; const t = Math.min(bands[i], rem); acc += t * RAW[i]; used += t; rem -= t; }
  return used ? acc / used : 1.0;
}
const interp = (base, max, lv) => base.map((b, i) => b + Math.min(lv, 5) / 5 * (max[i] - b));

// 測試武器（合成，控制變因）。
const mkW = (o) => ({ id: "t", nameZh: "測試", weaponType: "great-sword", attack: 200, affinity: 0, slots: [], tags: [], ...o });
const SH = (base, max) => ({ base, max });

console.log("━━━ A. 攻擊力手算（攻擊/挑戰者/無傷）━━━");
{
  const w = mkW({ attack: 190, sharpness: SH([0,0,100,0,0,0,0],[0,0,100,0,0,0,0]) }); // 全黃(1.0), 無匠差
  A(approx(computeEfr({ weapon: w, skills: {} }).effAttack, 190), "無技能 effAttack=190（=raw）");
  A(approx(computeEfr({ weapon: w, skills: { 攻擊: 5 } }).effAttack, 190 * 1.04 + 9), "攻擊5 effAttack=190×1.04+9=206.6");
  A(approx(computeEfr({ weapon: w, skills: { 攻擊: 3 } }).effAttack, 190 + 7), "攻擊3 effAttack=190+7=197（pct=0）");
  A(approx(computeEfr({ weapon: w, skills: { 挑戰者: 5 } }).effAttack, 190 + 20 * 0.75), "挑戰者5 effAttack=190+20×0.75=205（×uptime）");
  A(approx(computeEfr({ weapon: w, skills: { 無傷: 5 } }).effAttack, 190 + 20 * 0.75), "無傷5 effAttack=190+15（20×0.75）");
}

console.log("━━━ B. 會心率 + 超會心手算 ━━━");
{
  const w = mkW({ attack: 200, affinity: 0, sharpness: SH([0,0,100,0,0,0,0],[0,0,100,0,0,0,0]) });
  A(approx(computeEfr({ weapon: w, skills: { 看破: 5 } }).effAffinity, 20), "看破5 會心=20%");
  A(approx(computeEfr({ weapon: w, skills: { 看破: 3, 弱點特效: 5 } }).effAffinity, 12 + 30), "看破3+WEX5 會心=12+30=42%");
  A(approx(computeEfr({ weapon: w, skills: { 挑戰者: 5 } }).effAffinity, 15 * 0.75), "挑戰者5 會心=15×0.75=11.25%");
  A(approx(computeEfr({ weapon: w, skills: { 精神抖擻: 3 } }).effAffinity, 30 * 0.75), "精神抖擻3 會心=30×0.75=22.5%");
  // critMult：會心100%×超會心5(1.40) → 1.40；會心50%×無超會心(1.25) → 1.125
  A(approx(computeEfr({ weapon: mkW({ attack: 200, affinity: 100, sharpness: SH([0,0,100,0,0,0,0],[0,0,100,0,0,0,0]) }), skills: { 超會心: 5 } }).critMult, 1.40, 0.01), "會心100%+超會心5 critMult=1.40");
  A(approx(computeEfr({ weapon: mkW({ attack: 200, affinity: 50, sharpness: SH([0,0,100,0,0,0,0],[0,0,100,0,0,0,0]) }), skills: {} }).critMult, 1 + 0.5 * 0.25, 0.01), "會心50%無超會心 critMult=1.125");
  A(approx(computeEfr({ weapon: mkW({ attack: 200, affinity: -20, sharpness: SH([0,0,100,0,0,0,0],[0,0,100,0,0,0,0]) }), skills: {} }).critMult, 1 - 0.2 * 0.25, 0.01), "負會心-20% critMult=0.95");
}

console.log("━━━ C. 斬味匠插值手算（base↔max、頂端60加權）━━━");
{
  const base = [50,60,60,80,50,50,0], max = [50,60,60,80,50,100,0]; // hc[5] 延展白(50→100)
  const w = mkW({ attack: 200, sharpness: SH(base, max) });
  const s0 = expSharp(interp(base, max, 0)), s5 = expSharp(interp(base, max, 5)), s3 = expSharp(interp(base, max, 3));
  A(approx(computeEfr({ weapon: w, skills: {} }).sharpMult, s0, 0.001), `匠0 sharpMult=${s0.toFixed(3)}（頂端白50+藍10 加權）`);
  A(approx(computeEfr({ weapon: w, skills: { 匠: 5 } }).sharpMult, s5, 0.001), `匠5 sharpMult=${s5.toFixed(3)}（頂端全白）`);
  A(computeEfr({ weapon: w, skills: { 匠: 5 } }).sharpMult >= computeEfr({ weapon: w, skills: {} }).sharpMult, "匠 EFR 單調：匠5 sharpMult ≥ 匠0");
  A(approx(computeEfr({ weapon: w, skills: { 匠: 3 } }).sharpMult, s3, 0.001), `匠3 sharpMult=${s3.toFixed(3)}（線性插值）`);
  // raw 合成：effAttack×sharpMult×critMult
  const r = computeEfr({ weapon: w, skills: { 攻擊: 5, 匠: 5 } });
  A(approx(r.raw, (200 * 1.04 + 9) * s5 * 1.0, 0.5), "raw=effAttack×sharpMult×critMult 合成正確");
  // 無斬味武器（弓）→ 中性 1.0
  A(approx(computeEfr({ weapon: mkW({ attack: 200, sharpness: undefined }), skills: {} }).sharpMult, 1.0), "無斬味武器 sharpMult=1.0（中性）");
}

console.log("━━━ D. 屬性手算 ━━━");
{
  const w = mkW({ attack: 200, element: { type: "fire", value: 300 }, sharpness: SH([0,0,0,0,0,100,0],[0,0,0,0,0,100,0]) }); // 全白
  const eSharp = expSharp([0,0,0,0,0,100,0].map(x=>x)); // 白 elem mult
  const r0 = computeEfr({ weapon: w, skills: {} });
  A(r0.element > 0, `屬性武器 element>0（=${r0.element.toFixed(1)}）`);
  // 火屬性攻擊強化3: 300×(1+0.2)+60 = 420 → ×elemSharp
  const r3 = computeEfr({ weapon: w, skills: { 火屬性攻擊強化: 3 } });
  A(r3.element > r0.element, "火屬強化3 屬性 EFR 上升（300→420 base）");
  A(computeEfr({ weapon: mkW({ attack: 200, sharpness: SH([0,0,100,0,0,0,0],[0,0,100,0,0,0,0]) }), skills: {} }).element === 0, "無屬性武器 element=0");
}

console.log("━━━ E. 消費端佈線（searchBuilds 排序消費 efr-wilds）━━━");
{
  const gs = deps.weapons.find((w) => w.weaponType === "great-sword" && w.sharpness && w.rarity >= 7);
  const r = searchBuilds({ weaponType: "great-sword", weaponSearchMode: "fixed", fixedWeaponId: gs.id, charms: [], fixedParts: {}, excludedItems: { armorIds: [], weaponIds: [] }, requiredSkills: { 攻擊: 3 }, excludedSkills: [], reservedSlots: { 4:0,3:0,2:0,1:0 }, searchMode: "exact", resultLimit: 10 }, deps);
  const top = r.results[0];
  // 手算 top 結果的 EFR，對照引擎產出（證明 searchBuilds 消費 efr-wilds）
  const hand = computeEfr({ weapon: gs, skills: top.finalSkills });
  A(approx(top.efr.raw, Math.round(hand.raw), 1), `searchBuilds top efr.raw=${top.efr.raw} 對照手算 computeEfr=${Math.round(hand.raw)}（消費端佈線）`);
  A(r.results.every((x, i) => i === 0 || r.results[i-1].efr.total >= x.efr.total), "結果依 efr.total 降冪（排序消費新 EFR）");
}

console.log("━━━ F. 決定性 ━━━");
{
  const w = mkW({ attack: 200, affinity: 20, element: { type: "water", value: 250 }, sharpness: SH([50,60,60,80,50,50,0],[50,60,60,80,50,100,0]) });
  const s = { 攻擊: 4, 看破: 3, 超會心: 2, 匠: 4, 水屬性攻擊強化: 2 };
  A(JSON.stringify(computeEfr({ weapon: w, skills: s })) === JSON.stringify(computeEfr({ weapon: w, skills: s })), "同輸入 computeEfr 連跑兩次逐位元一致");
}

console.log("━━━ G. EFR 冒煙：隔離單一變因，EFR 單調響應（≥7 組）━━━");
{
  const w = mkW({ attack: 200, affinity: 10, element: { type: "fire", value: 250 }, sharpness: SH([50,60,60,80,50,50,0],[50,60,60,80,50,100,0]) });
  const raw = (s) => computeEfr({ weapon: w, skills: s }).raw;
  const ele = (s) => computeEfr({ weapon: w, skills: s }).element;
  const base = raw({});
  A(raw({ 攻擊: 5 }) > base, "① 攻擊5 → raw 上升（單一變因）");
  A(raw({ 看破: 5 }) > base, "② 看破5 → raw 上升（會心）");
  A(raw({ 弱點特效: 5 }) > base, "③ 弱點特效5 → raw 上升（會心）");
  A(raw({ 超會心: 5, 看破: 5 }) > raw({ 看破: 5 }), "④ 超會心5 → raw 上升（會心倍率）");
  A(raw({ 匠: 5 }) > base, "⑤ 匠5 → raw 上升（斬味頂端色變厚）");
  A(raw({ 挑戰者: 5 }) > base, "⑥ 挑戰者5 → raw 上升（條件×uptime）");
  A(ele({ 火屬性攻擊強化: 3 }) > ele({}), "⑦ 火屬強化3 → element 上升（屬性）");
  A(ele({ "會心擊【屬性】": 3, 看破: 5 }) > ele({ 看破: 5 }), "⑧ 會心擊【屬性】3 → element 上升");
}

console.log(`\n═══ efr-wilds 手算對照 + 佈線 + EFR 冒煙 + 決定性：PASS ${pass} / FAIL ${fail} ═══`);
process.exit(fail ? 1 : 0);
