/**
 * World 搜尋回歸基準（PLAN-wilds Phase 1）。
 *
 * 最高原則：World 現在也是「既有行為」，比照 Rise 建立逐位元基準——之後動 schema／引擎
 * （Wilds 擴充）才有錨點證明「World 零改變」。本腳本以 10 組固定條件呼叫真實
 * searchBuilds（World deps：deps.world 啟用 set bonus／動態上限／護石池／efr-world），
 * 序列化完整結果（build id 序列 + 每套 EFR + finalSkills + 珠子配置 + meta），逐位元比對。
 *
 *   node scripts/regression-world.mjs           # 印出摘要（不寫檔）
 *   node scripts/regression-world.mjs --write    # 建立/更新 world-baseline.json
 *   node scripts/regression-world.mjs --check     # 對比 world-baseline.json，逐位元
 *
 * 決定性：searchBuilds 預設 now=()=>0；武器/防具挑選皆固定條件（資料靜態、順序穩定）。
 * 與 Rise 基準（scripts/regression-baseline.mjs）互為 sibling：Rise harness 一行未動，
 * 單一指令 `node scripts/regression-all.mjs --check` 同時跑兩者（閘門用）。
 */
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
register(
  "./scripts/regression-loader.mjs",
  pathToFileURL(REPO_ROOT + path.sep).href
);

const BASELINE_DIR = path.join(REPO_ROOT, "scripts", ".regression");
const BASELINE_FILE = path.join(BASELINE_DIR, "world-baseline.json");

// ---- 動態載入 app 程式碼（須在 register 之後）----
const { searchBuilds } = await import("@/lib/build-search");
const { loadWorldSearchDeps } = await import("@/lib/world-registry");
const { applyWeaponAugment } = await import("@/lib/world-weapon-augment");

const deps = await loadWorldSearchDeps();

const PARTS = ["head", "chest", "arms", "waist", "legs"];
const RESERVED0 = { 4: 0, 3: 0, 2: 0, 1: 0 };
const NO_EXCL = { armorIds: [], weaponIds: [] };

// ---- 決定性挑選：資料靜態、find/filter 順序穩定 ----
const GS_R12 = deps.weapons.find(
  (w) => w.weaponType === "great-sword" && w.rarity === 12
);
const FATALIS_ARMOR_IDS = deps.armors
  .filter((a) => a.setBonusId === "sb_fatalis-legend")
  .map((a) => a.id);
// Fatalis α+ 五部位（固定用；每部位取第一件）
const FATALIS_AP_BY_PART = (() => {
  const byPart = {};
  for (const a of deps.armors.filter(
    (a) => a.setBonusId === "sb_fatalis-legend" && /α\+$/.test(a.nameEn)
  )) {
    byPart[a.part] ??= a;
  }
  return byPart;
})();

// ---- W08 覺醒/客製 delta：Black Fatalis Blade 淺拷貝 + 虛擬 set bonus ----
const TEOSTRA_SB = "sb_teostra-technique"; // 炎王龍之武技：3 件 → 達人藝
function augmentedWorldDeps() {
  const base = deps.weapons.find((w) => w.nameEn === "Black Fatalis Blade");
  const aug = applyWeaponAugment(base, {
    attack: 10,
    affinity: 5,
    element: 0,
    slot: 4,
    defense: 0,
    setBonusId: TEOSTRA_SB,
  });
  // 同 id 淺拷貝取代（避免 id 碰撞）；虛擬 set bonus +1 件注入 deps.world。
  return {
    fixedWeaponId: base.id,
    deps: {
      ...deps,
      weapons: deps.weapons.map((w) => (w.id === base.id ? aug : w)),
      weaponById: { ...deps.weaponById, [base.id]: aug },
      world: { ...deps.world, virtualSetBonus: { [TEOSTRA_SB]: 1 } },
    },
  };
}
const AUG = augmentedWorldDeps();
// 炎王龍 α 兩件（固定用；虛擬 +1 → 2 件達 3 件門檻）
const TEOSTRA_TWO = deps.armors
  .filter((a) => a.setBonusId === TEOSTRA_SB)
  .slice(0, 2)
  .map((a) => a.id);

// ---- 10 組固定情境（覆蓋 PLAN Phase 1 要求的各 World 路徑）----
// 每組 deps 預設共用 World deps；W08 用 augmentedWorldDeps 的 deps 覆寫。
const SCENARIOS = [
  {
    // set bonus 門檻觸發 + secret 全域解放（Inheritance）：挑戰者原生 5，要求 7 → Fatalis ≥2 件。
    name: "W01_inheritance_challenger7_gs_exact",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {},
      excludedItems: NO_EXCL,
      requiredSkills: { 挑戰者: 7 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 30,
    },
  },
  {
    // secret 專屬極意路徑：排除 Fatalis，力量解放原生 5→7 → 雷狼龍‧極意（Zinogre ≥3）。
    name: "W02_zinogre-essence_might7_excl-fatalis_exact",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {},
      excludedItems: { armorIds: FATALIS_ARMOR_IDS, weaponIds: [] },
      requiredSkills: { 力量解放: 7 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 30,
    },
  },
  {
    // 複合珠參與求解：固定 Fatalis α+，4 技能 > 護石可涵蓋 → 自然選複合珠。
    name: "W03_compound-deco_free4skills_exact",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: Object.fromEntries(
        PARTS.map((p) => [p, FATALIS_AP_BY_PART[p].id])
      ),
      excludedItems: NO_EXCL,
      requiredSkills: { 攻擊: 1, 奪取耐力: 1, 無傷: 1, 超會心: 1 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 20,
    },
  },
  {
    // 複合珠有界修復（尾巴 D）張力場景：自由防具搜尋、奪氣‧攻擊珠（攻擊+奪取耐力,slot4）相關。
    name: "W04_repair-tension_atk2-stamina1-nohit1_exact",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {},
      excludedItems: NO_EXCL,
      requiredSkills: { 攻擊: 2, 奪取耐力: 1, 無傷: 1 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 50,
    },
  },
  {
    // World 護石固定清單進池（craftable-list，wcharm_ 前綴）。
    name: "W05_charmpool-craftable_atk5_gs_fast",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {},
      excludedItems: NO_EXCL,
      requiredSkills: { 攻擊: 5 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "fast",
      resultLimit: 20,
    },
  },
  {
    // 固定護石：攻擊護石Ⅲ（wcharm_6）→ 全部結果護石皆為它。
    name: "W06_fixed-charm_atk5_gs_fast",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      fixedCharmId: "wcharm_6",
      charms: [],
      fixedParts: {},
      excludedItems: NO_EXCL,
      requiredSkills: { 攻擊: 5 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "fast",
      resultLimit: 20,
    },
  },
  {
    // 排除護石：wcharm_6 / wcharm_235 不得出現。
    name: "W07_excluded-charm_atk5_gs_fast",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {},
      excludedItems: { armorIds: [], weaponIds: [], charmIds: ["wcharm_6", "wcharm_235"] },
      requiredSkills: { 攻擊: 5 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "fast",
      resultLimit: 20,
    },
  },
  {
    // 覺醒/客製 delta 輸入 + 虛擬 set bonus：Black Fatalis Blade（+10 攻擊/+5% 會心/+4級洞）、
    // 炎王龍虛擬 +1 件 → 固定 2 件炎王龍 α 即達 3 件門檻（達人藝觸發）。
    name: "W08_weapon-augment_delta+virtual-setbonus_exact",
    deps: AUG.deps,
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: AUG.fixedWeaponId,
      charms: [],
      fixedParts: { head: TEOSTRA_TWO[0], chest: TEOSTRA_TWO[1] },
      excludedItems: NO_EXCL,
      requiredSkills: { 達人藝: 1, 攻擊: 1 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 20,
    },
  },
  {
    // EFR 排序（efr-world 含斬味期望倍率）：寬搜攻擊+超會心，捕捉 efr.total 序列與數值。
    name: "W09_efr-ordering_atk4-critboost3_gs_exact",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {},
      excludedItems: NO_EXCL,
      requiredSkills: { 攻擊: 4, 超會心: 3 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 20,
    },
  },
  {
    // 武器搜尋模式（非固定）+ 防禦下限過濾：長劍全類型搜尋、minDefense 濾防具組合。
    name: "W10_search-ls_atk4_mindef_fast",
    req: {
      weaponType: "long-sword",
      weaponSearchMode: "search",
      minDefense: 400,
      charms: [],
      fixedParts: {},
      excludedItems: NO_EXCL,
      requiredSkills: { 攻擊: 4 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "fast",
      resultLimit: 20,
    },
  },
  {
    // 複合珠有界修復（尾巴 D）**實際觸發**：釘死 find-repair-combo 掃出的 (E) 案例
    // （貪婪過度搶 slot4 給奪氣‧攻擊珠、餓死只能用 slot2 的無傷 → 貪婪失敗；修復偏好單珠救活）。
    // 洞池 [4,1,1]；block 12 顆覆蓋 req 的護石逼 NO_CHARM（重現無護石掃描場景）。決定性釘死修復分支。
    name: "W11_repair-trigger_fixed-combo_exact",
    req: {
      weaponType: "great-sword",
      weaponSearchMode: "fixed",
      fixedWeaponId: GS_R12.id,
      charms: [],
      fixedParts: {
        head: "warmor_542",
        chest: "warmor_843",
        arms: "warmor_70",
        waist: "warmor_1170",
        legs: "warmor_252",
      },
      excludedItems: {
        armorIds: [],
        weaponIds: [],
        charmIds: [
          "wcharm_4", "wcharm_5", "wcharm_6", "wcharm_235", "wcharm_58", "wcharm_59",
          "wcharm_60", "wcharm_208", "wcharm_209", "wcharm_234", "wcharm_304", "wcharm_315",
        ],
      },
      requiredSkills: { 攻擊: 2, 奪取耐力: 1, 無傷: 1 },
      excludedSkills: [],
      reservedSlots: RESERVED0,
      searchMode: "exact",
      resultLimit: 5,
    },
  },
];

// ---- 每套結果的精簡序列化（保留所有影響行為的欄位；含 World 複合珠 decorationName）----
function serializeResult(r) {
  return {
    id: r.id,
    efr: r.efr, // { raw, element, total }（已 Math.round）
    finalSkills: r.finalSkills,
    remainingSlots: r.remainingSlots,
    totalDefense: r.totalDefense,
    charmId: r.charm?.id ?? null,
    decorations: r.decorations.map((d) => ({
      decorationId: d.decorationId ?? null,
      decorationName: d.decorationName ?? null,
      skillName: d.skillName ?? null,
      skillLevel: d.skillLevel ?? null,
      slotLevel: d.slotLevel ?? null,
      placedInSlotLevel: d.placedInSlotLevel ?? null,
      source: d.source ?? null,
    })),
  };
}

function runAll() {
  const out = {};
  for (const sc of SCENARIOS) {
    const scDeps = sc.deps ?? deps;
    const { results, meta } = searchBuilds(sc.req, scDeps);
    out[sc.name] = {
      fixedWeaponId: sc.req.fixedWeaponId ?? null,
      meta: {
        combosEvaluated: meta.combosEvaluated,
        validBuilds: meta.validBuilds,
        truncated: meta.truncated,
        mode: meta.mode,
        candidatesPerPart: meta.candidatesPerPart,
        weaponsTried: meta.weaponsTried,
        charmsTried: meta.charmsTried,
      },
      resultCount: results.length,
      results: results.map(serializeResult),
    };
  }
  return out;
}

// ---- 逐位元比對（與 Rise harness 同演算法）----
function deepFindDiff(a, b, pathStr = "") {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) return null;
  if (
    a && b && typeof a === "object" && typeof b === "object" &&
    !Array.isArray(a) && !Array.isArray(b)
  ) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      const d = deepFindDiff(a[k], b[k], pathStr ? `${pathStr}.${k}` : k);
      if (d) return d;
    }
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return `${pathStr}: array length ${a.length} → ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = deepFindDiff(a[i], b[i], `${pathStr}[${i}]`);
      if (d) return d;
    }
  }
  return `${pathStr}: ${sa?.slice(0, 120)} → ${sb?.slice(0, 120)}`;
}

function summarize(data) {
  const lines = [];
  for (const [name, v] of Object.entries(data)) {
    lines.push(
      `  ${name}: results=${v.resultCount} valid=${v.meta.validBuilds} combos=${v.meta.combosEvaluated} weaponsTried=${v.meta.weaponsTried} charmsTried=${v.meta.charmsTried} topEFR=${v.results[0]?.efr.total ?? "-"}`
    );
  }
  return lines.join("\n");
}

const mode = process.argv.includes("--write")
  ? "write"
  : process.argv.includes("--check")
    ? "check"
    : "print";

const current = runAll();

if (mode === "write") {
  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + "\n", "utf8");
  console.log("[regression-world] baseline WRITTEN:", path.relative(REPO_ROOT, BASELINE_FILE));
  console.log(summarize(current));
} else if (mode === "check") {
  if (!existsSync(BASELINE_FILE)) {
    console.error("[regression-world] no world-baseline.json — run --write first");
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const names = [...new Set([...Object.keys(baseline), ...Object.keys(current)])];
  let failed = 0;
  for (const name of names) {
    const diff = deepFindDiff(baseline[name], current[name], name);
    if (diff) {
      failed++;
      console.error(`[regression-world] MISMATCH ${name}\n    ${diff}`);
    } else {
      console.log(`[regression-world] OK       ${name}`);
    }
  }
  if (failed) {
    console.error(`\n[regression-world] FAILED: ${failed}/${names.length} scenario(s) differ from baseline.`);
    process.exit(1);
  }
  console.log(`\n[regression-world] PASS: all ${names.length} scenarios bit-for-bit identical to baseline.`);
} else {
  console.log("[regression-world] print mode (no baseline written). Summary:");
  console.log(summarize(current));
}
