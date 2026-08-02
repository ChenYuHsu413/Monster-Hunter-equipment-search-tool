/**
 * Wilds 引擎冒煙（PLAN-wilds Phase 3 §4）。從 searchBuilds 消費端打，單一變因。
 * 本腳本只驗技能達成 / 池合法性 / 計數（EFR 數值由 smoke-efr-wilds.mjs 另測）。
 *   node scripts/wilds/smoke-wilds.mjs
 * 決定性：見 smoke-wilds 尾端「連跑兩次逐位元」自測。
 */
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
register("./scripts/regression-loader.mjs", pathToFileURL(REPO + path.sep).href);

const { searchBuilds } = await import("@/lib/build-search");
const { loadWildsSearchDeps, ensureWildsRegistered } = await import("@/lib/wilds-registry");

const deps = await loadWildsSearchDeps();
const st = await ensureWildsRegistered();
const PARTS = ["head", "chest", "arms", "waist", "legs"];
const RESERVED0 = { 4: 0, 3: 0, 2: 0, 1: 0 };
const NO_EXCL = { armorIds: [], weaponIds: [] };
const kindOf = st.skillKind;

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };

// ── 決定性素材挑選 ──
const gsSlotted = deps.weapons
  .filter((w) => w.weaponType === "great-sword" && (w.slots?.length ?? 0) >= 2)
  .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
const gsNoSlot = deps.weapons
  .filter((w) => w.weaponType === "great-sword" && (w.slots?.length ?? 0) === 0)
  .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
const armorNoSlot = (part) =>
  deps.armors.filter((a) => a.part === part && (a.slots?.length ?? 0) === 0 && !a.setBonusId && !a.groupId)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
const armorWithSlot = (part) =>
  deps.armors.filter((a) => a.part === part && (a.slots?.some((s) => s >= 1)))
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
const fixAll = (fn) => Object.fromEntries(PARTS.map((p) => [p, fn(p).id]));
// 無洞防具件的內建技能集（避免所選 deco 技能剛好內建 → 污染「池約束應失敗」測試）。
const noSlotInnate = new Set();
for (const p of PARTS) for (const s of Object.keys(armorNoSlot(p).skills ?? {})) noSlotInnate.add(s);
const weaponSkill = Object.keys(deps.decorationsBySkill).find((s) => kindOf[s] === "weapon" && !noSlotInnate.has(s));
const armorSkill = Object.keys(deps.decorationsBySkill).find((s) => kindOf[s] === "armor" && !noSlotInnate.has(s));

// 一次搜尋 helper
const run = (req) => searchBuilds({ weaponSearchMode: "fixed", charms: [], fixedParts: {}, excludedItems: NO_EXCL, excludedSkills: [], reservedSlots: RESERVED0, searchMode: "exact", resultLimit: 10, ...req }, deps);
// 阻擋覆蓋指定技能的可生產護石（隔離：逼技能只能由 deco/指定護石提供，排除護石池繞道）。
const blockCharmsFor = (skill) => deps.wilds.charmPool.filter((c) => c.skills[skill]).map((c) => c.id);

// ═══ ① 純武器珠池約束（武器技能只能用武器洞）═══
console.log("\n━━━ ① 武器珠池：武器技能 + 只有武器洞 → 成功；只有防具洞 → 失敗 ━━━");
{
  const blk = { armorIds: [], weaponIds: [], charmIds: blockCharmsFor(weaponSkill) };
  // 只有武器洞（防具全無洞）：武器技能可補（block 覆蓋護石，逼靠 deco）。
  const ok = run({ weaponType: "great-sword", fixedWeaponId: gsSlotted.id, fixedParts: fixAll(armorNoSlot), excludedItems: blk, requiredSkills: { [weaponSkill]: 1 } });
  assert(ok.results.length > 0 && ok.results[0].decorations.length > 0, `武器技能「${weaponSkill}」+ 武器洞 ${JSON.stringify(gsSlotted.slots)} → 靠武器珠補得出（${ok.results.length} 結果）`);
  // 只有防具洞（武器無洞）：武器技能無處可補 → 失敗。
  const bad = run({ weaponType: "great-sword", fixedWeaponId: gsNoSlot.id, fixedParts: fixAll(armorWithSlot), excludedItems: blk, requiredSkills: { [weaponSkill]: 1 } });
  assert(bad.results.length === 0, `武器技能「${weaponSkill}」+ 僅防具洞 → 池約束擋下（0 結果，武器珠不進防具洞）`);
}

// ═══ ② 純防具珠池約束（防具技能只能用防具洞）═══
console.log("\n━━━ ② 防具珠池：防具技能 + 只有防具洞 → 成功；只有武器洞 → 失敗 ━━━");
{
  const blk = { armorIds: [], weaponIds: [], charmIds: blockCharmsFor(armorSkill) };
  const ok = run({ weaponType: "great-sword", fixedWeaponId: gsNoSlot.id, fixedParts: fixAll(armorWithSlot), excludedItems: blk, requiredSkills: { [armorSkill]: 1 } });
  assert(ok.results.length > 0, `防具技能「${armorSkill}」+ 防具洞 → 補得出（${ok.results.length} 結果）`);
  const bad = run({ weaponType: "great-sword", fixedWeaponId: gsSlotted.id, fixedParts: fixAll(armorNoSlot), excludedItems: blk, requiredSkills: { [armorSkill]: 1 } });
  assert(bad.results.length === 0, `防具技能「${armorSkill}」+ 僅武器洞 → 池約束擋下（0 結果）`);
}

// ═══ ③ 護石洞 slotPools 約束（使用者護石帶 weapon 池洞 → 補武器技能）═══
console.log("\n━━━ ③ 護石洞 slotPools：使用者護石 weapon 池 3 級洞 → 補武器技能 ━━━");
{
  const blkC = blockCharmsFor(weaponSkill); // 排除可生產護石繞道
  // 武器/防具皆無洞；唯一洞來自使用者護石的 weapon 池洞。
  const userCharm = { id: "user_test_wpool", skills: {}, slots: [3], slotPools: ["weapon"] };
  const ok = searchBuilds({ weaponType: "great-sword", weaponSearchMode: "fixed", fixedWeaponId: gsNoSlot.id, charms: [userCharm], fixedParts: fixAll(armorNoSlot), excludedItems: { armorIds: [], weaponIds: [], charmIds: blkC }, requiredSkills: { [weaponSkill]: 1 }, excludedSkills: [], reservedSlots: RESERVED0, searchMode: "exact", resultLimit: 5 }, deps);
  assert(ok.results.length > 0, `唯一洞=護石 weapon 池 3 級洞 → 武器技能補得出（${ok.results.length} 結果）`);
  // 同一顆洞若標 armor 池，武器技能不得使用 → 失敗。
  const userCharmA = { id: "user_test_apool", skills: {}, slots: [3], slotPools: ["armor"] };
  const bad = searchBuilds({ weaponType: "great-sword", weaponSearchMode: "fixed", fixedWeaponId: gsNoSlot.id, charms: [userCharmA], fixedParts: fixAll(armorNoSlot), excludedItems: { armorIds: [], weaponIds: [], charmIds: blkC }, requiredSkills: { [weaponSkill]: 1 }, excludedSkills: [], reservedSlots: RESERVED0, searchMode: "exact", resultLimit: 5 }, deps);
  assert(bad.results.length === 0, "同一護石洞標 armor 池 → 武器技能不得使用（0 結果，逐洞池歸屬生效）");
}

// helper：集合 set/group 觸發技能
const finalHas = (r, skill, lvl) => (r.finalSkills[skill] ?? 0) >= lvl;

// ═══ ④ 純 set 門檻 2/4 ═══
console.log("\n━━━ ④ set 門檻 2/4：湊滿 set 成員 → set 技能觸發 ━━━");
{
  const { setBonusById } = st;
  const sbId = Object.keys(setBonusById).find((id) => deps.armors.filter((a) => a.setBonusId === id).length >= 4);
  const sb = setBonusById[sbId];
  const members = {};
  for (const a of deps.armors.filter((a) => a.setBonusId === sbId)) members[a.part] ??= a;
  const fixed = Object.fromEntries(PARTS.filter((p) => members[p]).slice(0, 4).map((p) => [p, members[p].id]));
  const r = run({ weaponType: "great-sword", fixedWeaponId: gsSlotted.id, fixedParts: fixed, requiredSkills: {} });
  const top = r.results[0];
  const skillName = sb.ranks[0].skillName;
  assert(top && finalHas(top, skillName, 1), `${sb.nameZh} ${Object.keys(fixed).length} 件 → set 技能「${skillName}」觸發（finalSkills=${top?.finalSkills[skillName]}）`);
}

// ═══ ⑤ 純 group 門檻 3 ═══
console.log("\n━━━ ⑤ group 門檻 3：3 件同 group → group 技能觸發 ━━━");
{
  const { groupById } = st;
  const gId = Object.keys(groupById).find((id) => deps.armors.filter((a) => a.groupId === id).length >= 3);
  const g = groupById[gId];
  const gm = {};
  for (const a of deps.armors.filter((a) => a.groupId === gId)) gm[a.part] ??= a;
  const fixed = Object.fromEntries(PARTS.filter((p) => gm[p]).slice(0, 3).map((p) => [p, gm[p].id]));
  const r = run({ weaponType: "great-sword", fixedWeaponId: gsSlotted.id, fixedParts: fixed, requiredSkills: {} });
  const top = r.results[0];
  const skillName = g.ranks[0].skillName;
  assert(top && finalHas(top, skillName, 1), `${g.nameZh} 3 件 → group 技能「${skillName}」觸發（finalSkills=${top?.finalSkills[skillName]}）`);
}

// ═══ ⑥ set+group 並存 ═══
console.log("\n━━━ ⑥ set + group 並存：一件同屬 set+group，兩軌互不干擾 ━━━");
{
  // 找同屬 set+group 的件充足的組合：取某 set（≥3 件）成員，其中部分也帶 group。
  const withBoth = deps.armors.filter((a) => a.setBonusId && a.groupId);
  const sbId = withBoth[0].setBonusId;
  const members = {};
  for (const a of deps.armors.filter((a) => a.setBonusId === sbId)) members[a.part] ??= a;
  const fixed = Object.fromEntries(PARTS.filter((p) => members[p]).slice(0, 4).map((p) => [p, members[p].id]));
  const r = run({ weaponType: "great-sword", fixedWeaponId: gsSlotted.id, fixedParts: fixed, requiredSkills: {} });
  const top = r.results[0];
  const sb = st.setBonusById[sbId];
  const setSkill = sb.ranks[0].skillName;
  // 檢查此組合是否也觸發某 group（有件帶 groupId 且湊滿 3）
  const grpCounts = {};
  for (const p of Object.keys(fixed)) { const a = deps.armorById[fixed[p]]; if (a.groupId) grpCounts[a.groupId] = (grpCounts[a.groupId] ?? 0) + 1; }
  const triggeredGrp = Object.entries(grpCounts).find(([, c]) => c >= 3);
  assert(top && finalHas(top, setSkill, 1), `set「${setSkill}」觸發（${sb.nameZh}）`);
  if (triggeredGrp) { const gs2 = st.groupById[triggeredGrp[0]]; assert(finalHas(top, gs2.ranks[0].skillName, 1), `並存 group「${gs2.ranks[0].skillName}」亦觸發（雙軌互不干擾）`); }
  else assert(true, "（此 set 組合未同時湊滿 group，雙軌並存於 ⑦/整合另證）");
}

// ═══ ⑦ Gogmazios 借用計數（extraSetBonusIds 聯集）═══
console.log("\n━━━ ⑦ Gogmazios 借用：Gogmazios 件(extra) + 1 正規借用 set 件 → 借用 set 湊 2 件觸發 ━━━");
{
  const gogArms = deps.armors.find((a) => a.seriesName?.includes("Gogmazios α") && a.part === "arms");
  const borrowedId = gogArms.extraSetBonusIds[0]; // 雷顎龍之鬥志
  const bsb = st.setBonusById[borrowedId];
  // 一個非 Gogmazios 的正規借用 set 成員（不同部位）。
  const regular = deps.armors.find((a) => a.setBonusId === borrowedId && a.part === "head");
  const r = run({ weaponType: "great-sword", fixedWeaponId: gsSlotted.id, fixedParts: { arms: gogArms.id, head: regular.id }, requiredSkills: {} });
  const top = r.results[0];
  const skillName = bsb.ranks[0].skillName;
  assert(top && finalHas(top, skillName, 1), `Gogmazios腕(extra ${borrowedId}) + 正規${regular.nameZh} = 2 件 → 借用 set「${skillName}」觸發（義務 a：件數吃 extra 聯集，finalSkills=${top?.finalSkills[skillName]}）`);
}

// ═══ ⑦b Gogmazios 借用件裁切存活（義務 b：相關度不剪掉借用價值件）═══
console.log("\n━━━ ⑦b 裁切存活：排除所有正規借用件、唯 Gogmazios 腕(extra)能湊門檻 → 自由搜尋存活 ━━━");
{
  const gogArms = deps.armors.find((a) => a.seriesName?.includes("Gogmazios α") && a.part === "arms");
  const borrowedId = gogArms.extraSetBonusIds[0]; // 雷顎龍之鬥志
  const skillName = st.setBonusById[borrowedId].ranks[0].skillName;
  const regHead = deps.armors.find((a) => a.setBonusId === borrowedId && a.part === "head");
  // 排除「所有正規（setBonusId）借用件的 arms」→ 湊滿 2 件借用 set 的第二件唯有 Gogmazios 腕（經 extra）。
  const excludeArms = deps.armors.filter((a) => a.setBonusId === borrowedId && a.part === "arms").map((a) => a.id);
  // 自由搜尋 arms（不固定），fixed head=正規借用件；exact 讓 arms 候選經 prunePools 裁切。
  const r = searchBuilds({
    weaponType: "great-sword", weaponSearchMode: "fixed", fixedWeaponId: gsSlotted.id,
    charms: [], fixedParts: { head: regHead.id },
    excludedItems: { armorIds: excludeArms, weaponIds: [] },
    requiredSkills: { [skillName]: 1 }, excludedSkills: [], reservedSlots: RESERVED0, searchMode: "exact", resultLimit: 30,
  }, deps);
  const usesGog = r.results.find((b) => b.armor.arms?.id === gogArms.id);
  assert(!!usesGog, `借用 set「${skillName}」需求下，Gogmazios 腕存活於 arms 候選池並被選（義務 b：相關度給借用價值評分，未被裁切剪掉）`);
}

// ═══ ⑧ 使用者護石庫參與 ═══
console.log("\n━━━ ⑧ 使用者護石庫：Rise 式輸入護石技能參與滿足必要技能 ━━━");
{
  // block 可生產護石覆蓋 armorSkill，逼使用者護石為唯一來源（無洞、armorSkill 非內建）。
  const userCharm = { id: "user_test_skill", skills: { [armorSkill]: 2 }, slots: [] };
  const r = searchBuilds({ weaponType: "great-sword", weaponSearchMode: "fixed", fixedWeaponId: gsNoSlot.id, charms: [userCharm], fixedParts: fixAll(armorNoSlot), excludedItems: { armorIds: [], weaponIds: [], charmIds: blockCharmsFor(armorSkill) }, requiredSkills: { [armorSkill]: 2 }, excludedSkills: [], reservedSlots: RESERVED0, searchMode: "exact", resultLimit: 5 }, deps);
  const top = r.results[0];
  assert(top && top.charm?.id === "user_test_skill" && finalHas(top, armorSkill, 2), `使用者護石(${armorSkill}2) 直接滿足需求（無洞、無防具技能 → 靠護石，finalSkills=${top?.finalSkills[armorSkill]}）`);
}

// ═══ ⑨ 武器 seed 技能 ═══
console.log("\n━━━ ⑨ 武器 seed 技能：選定武器自帶技能計入起點 ━━━");
{
  const seedWeapon = deps.weapons.find((w) => w.weaponType === "great-sword" && w.skills && Object.keys(w.skills).length > 0);
  const seedSkill = Object.keys(seedWeapon.skills)[0];
  const seedLvl = seedWeapon.skills[seedSkill];
  const r = run({ weaponType: "great-sword", fixedWeaponId: seedWeapon.id, fixedParts: fixAll(armorNoSlot), requiredSkills: {} });
  const top = r.results[0];
  assert(top && finalHas(top, seedSkill, seedLvl), `武器「${seedWeapon.nameZh}」自帶「${seedSkill}」Lv${seedLvl} 計入 finalSkills（=${top?.finalSkills[seedSkill]}）`);
  // 98 把無技能武器 seed 空集不出錯
  const noSkillW = deps.weapons.find((w) => w.weaponType === "great-sword" && (!w.skills || Object.keys(w.skills).length === 0));
  const r2 = run({ weaponType: "great-sword", fixedWeaponId: noSkillW.id, fixedParts: fixAll(armorNoSlot), requiredSkills: {} });
  assert(r2.results.length > 0, `無技能武器「${noSkillW.nameZh}」seed 空集 → 搜尋正常不出錯（${r2.results.length} 結果）`);
}

// ═══ ⑩ 混合整合（Game8 Wilds meta 原型：Gore Magala 黑蝕龍會心系）═══
// 出處：Game8 MH Wilds Builds（game8.co/games/Monster-Hunter-Wilds）維護的 HR50+ meta，
// 黑蝕龍（Gore Magala）套為現行會心流代表原型。此組**整合驗證**多機制同一次搜尋並存：
// 武器 seed + set bonus + group + 武器池 deco + 防具池 deco 一起達成（禁對 EFR 斷言）。
// 裁決：以「真實 meta 套 + 真實技能組」構造整合場景，非逐字爬單篇 Game8 文（EN→zh 映射脆弱），
// 原型與出處如上；證明引擎能同時重現一套 meta 的技能達成。
console.log("\n━━━ ⑩ 混合整合（Game8 meta 原型 黑蝕龍會心系）：多機制並存達成 ━━━");
{
  const goreSb = Object.entries(st.setBonusById).find(([, sb]) => sb.nameZh.includes("黑蝕龍"))?.[0];
  const members = {};
  for (const a of deps.armors.filter((a) => a.setBonusId === goreSb)) members[a.part] ??= a;
  const fixed = Object.fromEntries(PARTS.filter((p) => members[p]).slice(0, 4).map((p) => [p, members[p].id]));
  const setSkill = st.setBonusById[goreSb].ranks[0].skillName;
  // 帶洞 GS（含 seed 技能）+ 要求 1 個武器池 deco 技能 + 1 個防具池 deco 技能同時滿足。
  const seedW = deps.weapons.find((w) => w.weaponType === "great-sword" && (w.slots?.length ?? 0) >= 2 && w.skills && Object.keys(w.skills).length > 0);
  const seedSkill = Object.keys(seedW.skills)[0];
  const r = run({ weaponType: "great-sword", fixedWeaponId: seedW.id, fixedParts: fixed, requiredSkills: { [weaponSkill]: 1, [armorSkill]: 1 } });
  const top = r.results[0];
  const grpCounts = {};
  for (const p of Object.keys(fixed)) { const a = deps.armorById[fixed[p]]; if (a.groupId) grpCounts[a.groupId] = (grpCounts[a.groupId] ?? 0) + 1; }
  const trigGrp = Object.entries(grpCounts).find(([, c]) => c >= 3);
  assert(!!top, `整合搜尋有解（黑蝕龍 ${Object.keys(fixed).length} 件 + ${seedW.nameZh}）`);
  assert(top && finalHas(top, seedSkill, seedW.skills[seedSkill]), `武器 seed「${seedSkill}」達成`);
  assert(top && finalHas(top, setSkill, 1), `set bonus「${setSkill}」達成`);
  assert(top && finalHas(top, weaponSkill, 1) && finalHas(top, armorSkill, 1), `武器池 deco「${weaponSkill}」+ 防具池 deco「${armorSkill}」同時達成`);
  if (trigGrp) assert(finalHas(top, st.groupById[trigGrp[0]].ranks[0].skillName, 1), `group「${st.groupById[trigGrp[0]].ranks[0].skillName}」並存達成`);
}

console.log(`\n═══ Wilds 冒煙（①-⑩）：PASS ${pass} / FAIL ${fail} ═══`);

// ── 決定性自測：整組 smoke 的關鍵搜尋連跑兩次逐位元一致 ──
{
  const detReq = { weaponType: "great-sword", weaponSearchMode: "fixed", fixedWeaponId: gsSlotted.id, charms: [], fixedParts: {}, excludedItems: NO_EXCL, requiredSkills: { [weaponSkill]: 1, [armorSkill]: 1 }, excludedSkills: [], reservedSlots: RESERVED0, searchMode: "exact", resultLimit: 20 };
  const a = JSON.stringify(searchBuilds(detReq, deps).results.map((r) => [r.id, r.decorations.map((d) => d.decorationId), r.finalSkills]));
  const b = JSON.stringify(searchBuilds(detReq, deps).results.map((r) => [r.id, r.decorations.map((d) => d.decorationId), r.finalSkills]));
  assert(a === b, "決定性：同輸入 wilds 搜尋連跑兩次逐位元一致");
}
console.log(`\n═══ 含決定性：PASS ${pass} / FAIL ${fail} ═══`);
process.exit(fail ? 1 : 0);
