/**
 * 推薦配裝（Game8 爬蟲產物 data/recommended-builds.json）的顯示端型別。
 *
 * 唯一真相來源＝scripts/scrape-game8.js 的 SCHEMA_DOC（見該檔 meta.schemaDoc）。
 * 這裡只覆蓋「顯示端會讀到」的欄位；純除錯欄位（game8Id 等）以選用型別帶過。
 *
 * ID 慣例：armors/weapons/decorations 存專案內部 id（armor_* / weapon_* / deco_*，
 * 少數為手工合成 deco_manual_*）；skills 直接存中文名稱字串。對應不到時 id 省略，
 * 顯示端 fallback 到 rawNameJa 並加警告樣式。
 */

/** 階段分類：Rise 五階 + 推薦武器一覽；World（Phase 6）三階。 */
export type RecommendedCategory =
  | "riseLow"
  | "riseHigh"
  | "riseEndgame"
  | "mrEarly"
  | "mrEndgame"
  | "weaponRecommend"
  // World（Game8 MHW，實測收斂 3 階，見 docs/world-game8-audit.md）
  | "worldEndgame"
  | "worldMeta"
  | "worldProgression"
  | "worldHighRank"
  // Wilds（Game8 MHWilds，實測收斂 3 階，見 docs/wilds-game8-audit.md）
  | "wildsEndgame"
  | "wildsHighRank"
  | "wildsProgression";

export type RecommendedKind =
  | "full-build"
  | "armor-pieces"
  | "weapon-list"
  | "kinsect-list";

/** 一顆裝飾珠引用。placeholder=true 時為屬性佔位符（無 id，顯示「對應屬性珠」）。 */
export type RecoDecoration = {
  /** 內部 deco id（deco_* / deco_manual_* / World wdeco_*）。placeholder 珠無此欄。 */
  id?: string;
  rawNameJa?: string;
  /** World：Game8 英文原名（對不上 id 時 fallback 顯示）。 */
  rawNameEn?: string;
  count?: number;
  game8Id?: number;
  /** 屬性佔位符：依武器屬性自選對應珠，非單一珠、無 id。 */
  placeholder?: boolean;
  /** 空洞佔位（Game8 標明留空的洞）。 */
  free?: boolean;
  /** free 洞的等級。 */
  slotSize?: number;
};

/** 技能引用。id＝中文名稱（技能無獨立 id）。 */
export type RecoSkill = {
  id?: string;
  rawNameJa?: string;
  /** World：Game8 英文原名。 */
  rawNameEn?: string;
  level: number;
  /** World：對不上 skills.json（多為 set bonus 名/防禦技名差），非可匯入必要技能。 */
  setBonusOrUnknown?: boolean;
};

/** 發動技能總表的一列（僅 full-build，來源提供時）。 */
export type RecoSkillTotal = RecoSkill & {
  /** 紅字必要技能。 */
  required?: boolean;
  /** 傀異錬成後的實際等級（有加成時）。 */
  augmentedLevel?: number;
};

/** 武器引用。 */
export type RecoWeapon = {
  id?: string;
  rawNameJa?: string;
  /** World：Game8 英文原名（fallback 顯示）。 */
  rawNameEn?: string;
  game8Id?: number;
  /** 洞位等級陣列（weapon-list 有）。 */
  slots?: number[];
  /** 百龍洞等級（weapon-list 有）。 */
  rampageSlot?: number;
  /** Game8 原樣規格字串（攻擊/屬性/會心）。 */
  statsRaw?: string;
  /** weapon-list：H3 標題原文（含時期標註）。 */
  noteRaw?: string;
  /** full-build：武器上的裝飾珠。 */
  decorations?: RecoDecoration[];
  /**
   * full-build：武器百龍裝飾珠。id 對照 src/data/rampage-decorations.json
   * （複合鍵 rdeco_{skillNumId}_{slot}）；○系欄位簡稱對不到→id 省略。
   * id 僅供顯示查繁中，不進匯出 payload。
   */
  rampageDecos?: { id?: string; rawNameJa: string; count?: number }[];
};

/** 一件防具引用（full-build slot 恆為部位；armor-pieces slot=null）。 */
export type RecoArmor = {
  slot: "head" | "chest" | "arms" | "waist" | "legs" | null;
  id?: string;
  rawNameJa?: string;
  /** World：Game8 英文原名（fallback 顯示）。 */
  rawNameEn?: string;
  game8Id?: number;
  /** A/B 二擇一：存在時 id=alternatives[0].id，全部可選件列此。 */
  alternatives?: { id?: string; rawNameJa?: string }[];
  /** 傀異錬成內容（日文原樣）。 */
  augmentRaw?: string;
  /** full-build：該部位裝飾珠。 */
  decorations?: RecoDecoration[];
  /** armor-pieces：該件洞位。 */
  slots?: number[];
  /** armor-pieces：該件自帶技能。 */
  skills?: RecoSkill[];
};

/** 護石（full-build 選用）。 */
export type RecoTalisman = {
  skills?: RecoSkill[];
  slots?: number[];
  decorations?: RecoDecoration[];
};

/** 獵蟲（kinsect-list / weapon-list 選用；僅 rawNameJa，無 id 解析）。 */
export type RecoKinsect = {
  rawNameJa: string;
  game8Id?: number | null;
  statsRaw?: string;
};

/** 一筆推薦配裝。欄位依 kind 而異，顯示端須分別處理。 */
export type RecommendedBuild = {
  id: string;
  weaponType: string;
  category: RecommendedCategory;
  kind: RecommendedKind;
  buildName: string;
  /** Wilds（尾巴 W-G）：JP buildName 無譯名 → 機械合成 zh 顯示標題（主要顯示，buildName 降為小字）。 */
  synthName?: string;
  stageName?: string;
  /** Wilds：來源資料版本（Game8 Ver，如 "1.041"）。 */
  metaVersion?: string;
  weapons?: RecoWeapon[];
  armor?: RecoArmor[];
  talisman?: RecoTalisman | null;
  /** World：護石（資料裝備，直接對 id）。Rise 用 talisman。Wilds（尾巴 W-F）用 rawNameJa；
   *  RNG 鑑定護石無 id，rawNameZh 為 mhdb zh-Hant 顯示名（尾巴 W-G）。 */
  charm?: { id?: string; rawNameEn?: string; rawNameJa?: string; rawNameZh?: string } | null;
  /** World：此配裝依賴的未模擬系統旗標（引擎不模擬，UI 標示＋匯入點名）。 */
  unmodeled?: {
    awakened?: boolean;
    kjarr?: boolean;
    customAugment?: boolean;
    /** Wilds：Artian 武器（隨機強化 roll 不在資料，引擎不模擬）。 */
    artian?: boolean;
  };
  /** 全裝珠總計（僅上位畢業格式；該格式不逐部位標珠）。 */
  buildDecorations?: RecoDecoration[] | null;
  /** 發動技能總表（null＝來源未提供）。 */
  skillTotals?: RecoSkillTotal[] | null;
  /**
   * 百龍技能。id 對照 src/data/rampage-skills.json（Kiranico 官方繁中）；
   * 對不到→id 省略，顯示端 fallback 日文。id 僅供顯示，不進匯出 payload。
   * placeholder＝屬性付與簡寫（Game8 略屬性），依武器屬性自選，不對單一 ID。
   */
  rampageSkills?:
    | { id?: string; rawNameJa: string; placeholder?: boolean }[]
    | null;
  kinsect?: RecoKinsect[];
  sourceUrl: string;
};

/** recommended-builds.json 頂層結構。 */
export type RecommendedBuildsFile = {
  meta: {
    source: string;
    attribution: string;
    scrapedAt: string;
    [k: string]: unknown;
  };
  builds: RecommendedBuild[];
  errors: unknown[];
  unresolved: unknown[];
};
