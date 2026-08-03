import type {
  RecommendedBuild,
  RecommendedBuildsFile,
  RecommendedCategory,
} from "@/types/recommended";
import { decorations } from "./data";
import { loadGameData } from "./game-data";
import rampageSkillsData from "@/data/rise/rampage-skills.json";
import rampageDecosData from "@/data/rise/rampage-decorations.json";
import kinsectNamesData from "../../data/kinsect-names.json";
import editorialTranslationsData from "../../data/editorial-translations.json";
import jpNameMapData from "../../data/jp-name-map.json";

/**
 * 推薦配裝資料（data/recommended-builds.json，~2.4MB）的延遲載入與索引。
 *
 * 與 game-data.ts 同策略：動態 import 讓 webpack 拆成獨立 chunk（build 期打包、
 * 非 runtime 外部 fetch），不進首屏 bundle。名稱解析所需的防具/武器資料沿用
 * loadGameData()；珠子用 data.ts 的靜態 decorations。
 */

/** 階段分類的中文標籤。真相來源＝scripts/game8-sources.json 的 categories，
 * 該檔在 scripts/（唯讀、且含來源 URL），故此處僅複製顯示所需的 6 條標籤。 */
export const CATEGORY_LABELS: Record<RecommendedCategory, string> = {
  riseLow: "下位裝",
  riseHigh: "上位過渡裝",
  riseEndgame: "上位畢業裝（本篇）",
  mrEarly: "大師位拓荒裝",
  mrEndgame: "大師位畢業裝",
  weaponRecommend: "推薦武器一覽",
  // World（Game8 MHW）：base-game 上位 + Iceborne 三階
  worldHighRank: "上位裝（HR・本篇）",
  worldEndgame: "畢業旗艦裝（Meta）",
  worldMeta: "畢業 Meta 裝",
  worldProgression: "進度拓荒裝",
  // Wilds（Game8 MHWilds，實測收斂 3 階，見 docs/wilds-game8-audit.md）
  wildsProgression: "進度拓荒裝（HR9–36）",
  wildsHighRank: "上位裝（HR50+）",
  wildsEndgame: "畢業裝（HR100+ Meta）",
};

/** World 分區顯示順序（實力遞增：上位 HR → Iceborne 進度 → Meta → 畢業旗艦）。
 * A2 註：任務原設「下位→上位→進度→meta→畢業」，但 Game8 MHW base-game 無下位全配裝
 * （實測；見 docs/world-game8-audit.md），故無 worldLowRank，序列自上位起。 */
export const WORLD_STAGE_CATEGORY_ORDER: RecommendedCategory[] = [
  "worldHighRank",
  "worldProgression",
  "worldMeta",
  "worldEndgame",
];

/** Wilds 分區顯示順序（HR 遞增：進度 HR9–36 → 上位 HR50 → 畢業 HR100+）。 */
export const WILDS_STAGE_CATEGORY_ORDER: RecommendedCategory[] = [
  "wildsProgression",
  "wildsHighRank",
  "wildsEndgame",
];

/** 分區顯示順序（下位 → 上位過渡 → 上位畢業 → 大師位拓荒 → 大師位畢業）。 */
export const STAGE_CATEGORY_ORDER: RecommendedCategory[] = [
  "riseLow",
  "riseHigh",
  "riseEndgame",
  "mrEarly",
  "mrEndgame",
];

export type RecommendedIndex = {
  /** weaponType → category → 該類配裝（保持原始順序）。 */
  byWeaponType: Map<string, Map<RecommendedCategory, RecommendedBuild[]>>;
};

let cache: RecommendedIndex | null = null;
let inflight: Promise<RecommendedIndex> | null = null;

function buildIndex(builds: RecommendedBuild[]): RecommendedIndex {
  const byWeaponType = new Map<
    string,
    Map<RecommendedCategory, RecommendedBuild[]>
  >();
  for (const b of builds) {
    let byCat = byWeaponType.get(b.weaponType);
    if (!byCat) {
      byCat = new Map();
      byWeaponType.set(b.weaponType, byCat);
    }
    const list = byCat.get(b.category);
    if (list) list.push(b);
    else byCat.set(b.category, [b]);
  }
  return { byWeaponType };
}

/** 載入並快取推薦配裝索引。重複呼叫共用同一個 in-flight promise。 */
export function loadRecommendedBuilds(): Promise<RecommendedIndex> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = import("../../data/recommended-builds.json").then((mod) => {
      const file = mod.default as unknown as RecommendedBuildsFile;
      cache = buildIndex(file.builds);
      return cache;
    });
  }
  return inflight;
}

/** 已載入時同步取得，否則 null。 */
export function getLoadedRecommendedBuilds(): RecommendedIndex | null {
  return cache;
}

// ═══════════════════════ World（Phase 6）推薦資料 ═══════════════════════
// Rise 路徑（上方）完全不動；World 走獨立 lazy chunk + 簡化名稱解析（無百龍/獵蟲/編輯短標記）。

let worldCache: RecommendedIndex | null = null;
let worldInflight: Promise<RecommendedIndex> | null = null;

/** 載入 World 推薦配裝索引（獨立動態 chunk，不進首屏）。 */
export function loadWorldRecommendedBuilds(): Promise<RecommendedIndex> {
  if (worldCache) return Promise.resolve(worldCache);
  if (!worldInflight) {
    worldInflight = import("@/data/world/recommended-builds.json").then((mod) => {
      const file = mod.default as unknown as RecommendedBuildsFile;
      worldCache = buildIndex(file.builds);
      return worldCache;
    });
  }
  return worldInflight;
}

/** World 名稱解析器：armor/weapon/deco/charm id → 繁中；對不上 fallback 到 Game8 英文名。 */
export type WorldNameResolver = {
  armor: (id?: string, rawEn?: string) => ResolvedName;
  weapon: (id?: string, rawEn?: string) => ResolvedName;
  deco: (id?: string, rawEn?: string) => ResolvedName;
  charm: (id?: string, rawEn?: string) => ResolvedName;
};

function worldFallback(rawEn?: string): ResolvedName {
  return { name: rawEn || "（未知）", resolved: false };
}

/** 建立 World 名稱解析器（動態載入 world 資料）。 */
export async function createWorldNameResolver(): Promise<WorldNameResolver> {
  const [gd, decMod, chMod] = await Promise.all([
    loadGameData("world"),
    import("@/data/world/decorations.json"),
    import("@/data/world/charms.json"),
  ]);
  const decoName: Record<string, string> = Object.fromEntries(
    (decMod.default as unknown as { id: string; nameZh: string }[]).map((d) => [d.id, d.nameZh])
  );
  const charmName: Record<string, string> = Object.fromEntries(
    (chMod.default as unknown as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  return {
    armor: (id, rawEn) => {
      const a = id ? gd.armorById[id] : undefined;
      return a ? { name: a.nameZh, resolved: true } : worldFallback(rawEn);
    },
    weapon: (id, rawEn) => {
      const w = id ? gd.weaponById[id] : undefined;
      return w ? { name: w.nameZh, resolved: true } : worldFallback(rawEn);
    },
    deco: (id, rawEn) => {
      const n = id ? decoName[id] : undefined;
      return n ? { name: n, resolved: true } : worldFallback(rawEn);
    },
    charm: (id, rawEn) => {
      const n = id ? charmName[id] : undefined;
      return n ? { name: n, resolved: true } : worldFallback(rawEn);
    },
  };
}

// ═══════════════════════ Wilds（Phase 6b）推薦資料 ═══════════════════════
// 與 World 同策略：獨立 lazy chunk + 簡化名稱解析（schema 同 World）。

let wildsCache: RecommendedIndex | null = null;
let wildsInflight: Promise<RecommendedIndex> | null = null;

/** 載入 Wilds 推薦配裝索引（獨立動態 chunk，不進首屏）。 */
export function loadWildsRecommendedBuilds(): Promise<RecommendedIndex> {
  if (wildsCache) return Promise.resolve(wildsCache);
  if (!wildsInflight) {
    wildsInflight = import("@/data/wilds/recommended-builds.json").then((mod) => {
      const file = mod.default as unknown as RecommendedBuildsFile;
      wildsCache = buildIndex(file.builds);
      return wildsCache;
    });
  }
  return wildsInflight;
}

/** Wilds 名稱解析器（沿用 WorldNameResolver 型別；珠/護石對 wilds 資料 nameZh/name）。 */
export async function createWildsNameResolver(): Promise<WorldNameResolver> {
  const [gd, decMod, chMod] = await Promise.all([
    loadGameData("wilds"),
    import("@/data/wilds/decorations.json"),
    import("@/data/wilds/charms.json"),
  ]);
  const decoName: Record<string, string> = Object.fromEntries(
    (decMod.default as unknown as { id: string; nameZh: string }[]).map((d) => [d.id, d.nameZh])
  );
  const charmName: Record<string, string> = Object.fromEntries(
    (chMod.default as unknown as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  return {
    armor: (id, rawEn) => {
      const a = id ? gd.armorById[id] : undefined;
      return a ? { name: a.nameZh, resolved: true } : worldFallback(rawEn);
    },
    weapon: (id, rawEn) => {
      const w = id ? gd.weaponById[id] : undefined;
      return w ? { name: w.nameZh, resolved: true } : worldFallback(rawEn);
    },
    deco: (id, rawEn) => {
      const n = id ? decoName[id] : undefined;
      return n ? { name: n, resolved: true } : worldFallback(rawEn);
    },
    charm: (id, rawEn) => {
      const n = id ? charmName[id] : undefined;
      return n ? { name: n, resolved: true } : worldFallback(rawEn);
    },
  };
}

/** deco id → 中文名稱（含手工合成 deco_manual_*）。 */
const decoNameById: Record<string, string> = Object.fromEntries(
  decorations.map((d) => [d.id, d.nameZh])
);

/** 百龍技能／百龍裝飾品 id → 繁中名（Kiranico 官方繁中）。 */
const rampageSkillNameById: Record<string, string> = Object.fromEntries(
  (rampageSkillsData as { id: string; nameZh: string }[]).map((r) => [
    r.id,
    r.nameZh,
  ])
);
const rampageDecoNameById: Record<string, string> = Object.fromEntries(
  (rampageDecosData as { id: string; nameZh: string }[]).map((r) => [
    r.id,
    r.nameZh,
  ])
);

/** 手動對照表（$ 前綴為 meta，null＝待人工）→ 只留已填的繁中對照。 */
function loadManualMap(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("$")) continue;
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}
/** 獵蟲 nameJa → 繁中（手動；未填則缺鍵）。 */
const kinsectNameByJa = loadManualMap(
  kinsectNamesData as Record<string, unknown>
);
/** Game8 編輯短標記 原文 → 繁中（手動；未填則缺鍵）。 */
const editorialByRaw = loadManualMap(
  editorialTranslationsData as Record<string, unknown>
);

/**
 * 編輯標記正規化：NFKC（全半形／OR→or 等統一）+ 去空白 + 小寫。
 * 命中 jp-name-map 即官方名詞、非編輯評述，改查對照表顯示繁中。
 * ★與離線過濾（data/editorial-strings.json 的 resolvedVia 標記）同式，勿改單邊。
 */
const editorialNorm = (s: string): string =>
  s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/** 正規化官方名 → { 類別, 值 }。值：skills 為繁中、其餘為內部 id。 */
const editorialNameMap: Map<string, { cat: string; val: string }> = (() => {
  const m = new Map<string, { cat: string; val: string }>();
  const cats = [
    "skills",
    "armors",
    "decorations",
    "weapons",
    "rampageSkills",
    "rampageDecorations",
  ] as const;
  // 僅取上列 6 類（值皆為 string）；alternatives（值為 string[]）不在其列，故 unknown 轉型安全。
  const data = jpNameMapData as unknown as Record<
    string,
    Record<string, string>
  >;
  for (const cat of cats) {
    const obj = data[cat];
    if (!obj) continue;
    for (const [k, v] of Object.entries(obj)) {
      const n = editorialNorm(k);
      if (!m.has(n)) m.set(n, { cat, val: v });
    }
  }
  return m;
})();

/**
 * 成句判定：含。或、或 ≥22 字＝Game8 編輯評述（非欄位標記），顯示端「不翻譯也不顯示」
 * 直接排除。★與 scripts/build-editorial-strings.mjs 的 isEditorialSentence 同步。
 */
export function isEditorialSentence(raw: string): boolean {
  return /[。、]/.test(raw) || raw.length >= 22;
}

/**
 * 名稱解析：以載入後的 gameData 建立 armor/weapon 中文名對照。
 * 珠子用靜態表。回傳 { name, resolved }：resolved=false 代表對應不到內部資料，
 * 顯示端應以 rawNameJa fallback 並加警告樣式。
 */
export type ResolvedName = { name: string; resolved: boolean };

export type NameResolver = {
  armor: (id?: string, rawNameJa?: string) => ResolvedName;
  weapon: (id?: string, rawNameJa?: string) => ResolvedName;
  deco: (id?: string, rawNameJa?: string) => ResolvedName;
  /** 百龍技能：id 對照 rampage-skills.json 繁中，對不到 fallback 日文。 */
  rampageSkill: (id?: string, rawNameJa?: string) => ResolvedName;
  /** 百龍裝飾品：id 對照 rampage-decorations.json 繁中，對不到 fallback 日文。 */
  rampageDeco: (id?: string, rawNameJa?: string) => ResolvedName;
  /** 獵蟲：nameJa 對照手動 kinsect-names.json，未填 fallback 日文。 */
  kinsect: (rawNameJa?: string) => ResolvedName;
  /** Game8 編輯短標記：對照手動 editorial-translations.json，未填 fallback 原文。 */
  editorial: (raw?: string) => ResolvedName;
};

function fallback(rawNameJa?: string): ResolvedName {
  return { name: rawNameJa || "（未知）", resolved: false };
}

/** 建立名稱解析器（需先 loadGameData()）。 */
export async function createNameResolver(): Promise<NameResolver> {
  const gd = await loadGameData();
  return {
    armor: (id, rawNameJa) => {
      const a = id ? gd.armorById[id] : undefined;
      return a ? { name: a.nameZh, resolved: true } : fallback(rawNameJa);
    },
    weapon: (id, rawNameJa) => {
      const w = id ? gd.weaponById[id] : undefined;
      return w ? { name: w.nameZh, resolved: true } : fallback(rawNameJa);
    },
    deco: (id, rawNameJa) => {
      const name = id ? decoNameById[id] : undefined;
      return name ? { name, resolved: true } : fallback(rawNameJa);
    },
    rampageSkill: (id, rawNameJa) => {
      const name = id ? rampageSkillNameById[id] : undefined;
      return name ? { name, resolved: true } : fallback(rawNameJa);
    },
    rampageDeco: (id, rawNameJa) => {
      const name = id ? rampageDecoNameById[id] : undefined;
      return name ? { name, resolved: true } : fallback(rawNameJa);
    },
    kinsect: (rawNameJa) => {
      const name = rawNameJa ? kinsectNameByJa[rawNameJa] : undefined;
      return name ? { name, resolved: true } : fallback(rawNameJa);
    },
    editorial: (raw) => {
      if (!raw) return fallback(raw);
      // 1) 人工編輯翻譯優先
      const manual = editorialByRaw[raw];
      if (manual) return { name: manual, resolved: true };
      // 2) 官方名詞：查 name-map 對照表（id → 繁中）
      const hit = editorialNameMap.get(editorialNorm(raw));
      if (hit) {
        let name: string | undefined;
        switch (hit.cat) {
          case "skills":
            name = hit.val;
            break;
          case "weapons":
            name = gd.weaponById[hit.val]?.nameZh;
            break;
          case "armors":
            name = gd.armorById[hit.val]?.nameZh;
            break;
          case "decorations":
            name = decoNameById[hit.val];
            break;
          case "rampageSkills":
            name = rampageSkillNameById[hit.val];
            break;
          case "rampageDecorations":
            name = rampageDecoNameById[hit.val];
            break;
        }
        if (name) return { name, resolved: true };
      }
      return fallback(raw);
    },
  };
}
