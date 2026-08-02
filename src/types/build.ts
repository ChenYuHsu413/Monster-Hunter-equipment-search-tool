/**
 * 核心型別定義。
 *
 * 設計原則：
 * - 不寫死特定武器。所有武器共用同一組結構，武器差異只透過 `weaponType` 字串區分。
 * - 保持可擴充：未來要接 SQLite / Supabase / IndexedDB 時，這些型別即為資料列的 shape。
 */

/**
 * 遊戲識別碼。定義於此共用型別 hub（而非 game-profile.ts），
 * 讓資料層（game-data.ts / data.ts）可引用而不與 game-profile 形成循環依賴；
 * game-profile.ts 直接複用本型別。
 */
export type GameId = "rise" | "world" | "wilds";

export type SkillName = string;

/** 技能名稱 → 等級 的對應表。等級為累計後的實際等級。 */
export type SkillMap = Record<SkillName, number>;

/** 洞的等級。4 級洞為 Sunbreak 傀異鍊成/特定裝備才有。 */
export type SlotLevel = 1 | 2 | 3 | 4;

/** 全部可固定/鎖定的部位（含武器與護石）。 */
export type EquipmentPart =
  | "weapon"
  | "head"
  | "chest"
  | "arms"
  | "waist"
  | "legs"
  | "charm";

/** 只有防具的五個部位。 */
export type ArmorPart = "head" | "chest" | "arms" | "waist" | "legs";

export const ARMOR_PARTS: ArmorPart[] = [
  "head",
  "chest",
  "arms",
  "waist",
  "legs",
];

export const ARMOR_PART_LABELS: Record<ArmorPart, string> = {
  head: "頭部",
  chest: "身體",
  arms: "手部",
  waist: "腰部",
  legs: "腳部",
};

export const EQUIPMENT_PART_LABELS: Record<EquipmentPart, string> = {
  weapon: "武器",
  head: "頭部",
  chest: "身體",
  arms: "手部",
  waist: "腰部",
  legs: "腳部",
  charm: "護石",
};

/** 一件防具。slots 為洞的等級陣列，例如 [3,1,0] 代表一個 3 級洞、一個 1 級洞、一個空位。 */
export type ArmorPiece = {
  id: string;
  nameZh: string;
  nameEn?: string;
  part: ArmorPart;
  rarity?: number;
  /** 每個元素是該洞的等級。0 代表沒有洞（正規化後通常會濾掉 0）。 */
  slots: number[];
  skills: SkillMap;
  defense?: number;
  elementRes?: {
    fire: number;
    water: number;
    thunder: number;
    ice: number;
    dragon: number;
  };
  tags?: string[];
  /** 傀異鍊成產生的自訂版本標記。 */
  isAugmented?: boolean;
  /** 若為鍊成版本，指向原始防具 id。 */
  baseArmorId?: string;
  /** 防具系列名稱（同系列 5 部位共用，例如「冥淵」「原初」）。 */
  seriesName?: string;
  /** 依稀有度推算的階級標籤：村 / HR / MR。為推算值，非精確任務解放條件。 */
  rankLabel?: string;
  /** 推測的主要來源怪物（由生產素材推得，同套 5 部位一致，非官方標註）。 */
  sourceMonster?: string;
  /**
   * 所屬套裝加成 id（World 真髓/加護 set bonus 歸屬；指向 SetBonus.id）。
   * 新增選填欄位；Rise 資料無此欄，skill-calculator 的 set bonus 步驟僅在
   * profile.features.setBonus 為真時執行，故 Rise 行為不變。
   */
  setBonusId?: string;
  /**
   * 所屬群組技能 id（Wilds group skill 歸屬；指向 GroupSkill.id）。與 setBonusId 為
   * 獨立雙軸並存（一件可同時屬 set 與 group，Phase 0 定案 #4）。新增選填欄位；
   * Rise/World 資料無此欄，group 統計僅在 Wilds 引擎（Phase 3）啟用，行為不變。
   */
  groupId?: string;
};

/** 屬性 / 狀態異常類型。none 表示無屬性。 */
export type ElementType =
  | "fire"
  | "water"
  | "thunder"
  | "ice"
  | "dragon"
  | "poison"
  | "paralysis"
  | "sleep"
  | "blast"
  | "none";

/** 武器屬性篩選（只含五屬性；狀態異常與無屬性不列入）。 */
export type WeaponElementFilter = "fire" | "water" | "thunder" | "ice" | "dragon";

/** 五屬性耐性鍵（防具耐性過濾與總和顯示用）。 */
export type ElementResistanceKey =
  | "fire"
  | "water"
  | "thunder"
  | "ice"
  | "dragon";

export const ELEMENT_RES_KEYS: ElementResistanceKey[] = [
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
];

export type Weapon = {
  id: string;
  nameZh: string;
  nameEn?: string;
  weaponType: string;
  attack: number;
  /** 會心率（%）。 */
  affinity: number;
  slots: number[];
  element?: {
    type: ElementType;
    value: number;
  };
  /**
   * 斬味色帶，各段長度依序為 [紅,橙,黃,綠,藍,白,紫]。
   * base = 匠 0；max = 最大匠。弩/弓等無斬味武器省略此欄。
   */
  sharpness?: {
    base: number[];
    max: number[];
  };
  /** 百龍洞等級（顯示用，不參與裝飾珠洞位計算）。 */
  rampageSlot?: number;
  skills?: SkillMap;
  tags: string[];
  rarity?: number;
  /** 弩槍彈種資訊（輕弩/重弩）。 */
  ammo?: {
    normal?: number[];
    pierce?: number[];
    spread?: number[];
    shrapnel?: number[];
    sticky?: number[];
    slicing?: number[];
    elemental?: string[];
    rapidFire?: string[];
  };
  /** 弓的射法/瓶種資訊。 */
  bow?: {
    shotType?: "rapid" | "pierce" | "spread";
    chargeLevels?: string[];
    coatings?: string[];
  };
  /** 銃槍砲擊資訊。 */
  shelling?: {
    type: "normal" | "long" | "wide";
    level: number;
  };
  /** 斬擊斧/盾斧瓶種。 */
  phial?: {
    type:
      | "power"
      | "element"
      | "impact"
      | "dragon"
      | "poison"
      | "paralysis"
      | "exhaust";
  };
  /** 操蟲棍獵蟲等級。 */
  kinsectLevel?: number;
  /** 武器系列/線（同一把武器的強化前後共用，例如「白兔刃」）。 */
  seriesName?: string;
  /** 依稀有度推算的階級標籤：村 / HR / MR。為推算值，非精確任務解放條件。 */
  rankLabel?: string;
  /** 生產素材（Kiranico 原始資料，含數量，例如「爵銀龍的純淨殼×6」）。 */
  materials?: string[];
  /** 推測的主要來源怪物（由生產素材推得，非官方標註）。 */
  sourceMonster?: string;
};

/**
 * 裝飾珠 / 護石洞的池別歸屬（Wilds 珠雙池）。對應 mhdb-wilds 資料的 `decoration.kind`。
 * Wilds：武器珠只吃武器洞、防具珠只吃防具洞（Phase 0 定案，見 docs/wilds-mechanics-audit.md #2）。
 * Rise/World 無雙池，此欄不提供時消費端視為單一池，行為不變。
 */
export type DecorationPool = "weapon" | "armor";

export type Decoration = {
  id: string;
  nameZh: string;
  slotLevel: SlotLevel;
  /** 主技能名稱（保留：Rise 相容 / 單技能珠主技能；World 複合珠填第一技能，僅相容用途）。 */
  skillName: string;
  /** 主技能等級（保留欄位，語意同上）。 */
  skillLevel: number;
  /**
   * 完整技能表（World Lv4 複合珠：單技能 Lv2，或雙技能各 Lv1）。
   * 新增選填欄位；未提供時消費端由 { [skillName]: skillLevel } 推導，故 Rise 資料行為不變。
   */
  skills?: SkillMap;
  /**
   * 池別（Wilds 珠雙池：weapon | armor）。新增選填欄位；Rise/World 資料無此欄，
   * 洞-珠匹配不加池維度，行為不變（Wilds 引擎 Phase 3 才依此加約束）。
   */
  pool?: DecorationPool;
  craftable: boolean;
};

export type Charm = {
  id?: string;
  name?: string;
  skills: SkillMap;
  slots: number[];
  /**
   * Wilds RNG（鑑定）護石的使用者庫輸入補充欄位（Phase 0 定案 #5：mhdb 未結構化其技能池，
   * 走使用者庫輸入）。皆選填，形狀刻意貼齊 Rise 護石庫既有型別（skills + slots 不變），
   * 只加兩欄，故 Rise/World 護石庫行為不受影響：
   * - `rarity`：護石稀有度（Wilds RNG 護石 5–8；選填）。
   * - `slotPools`：與 `slots` 平行的池別陣列（各洞 weapon | armor 歸屬）；Wilds 珠雙池需要，
   *   未提供時視為無池別約束。技能數上限（Wilds RNG ≤3）為資料/UI 層約束，型別不強制。
   */
  rarity?: number;
  slotPools?: DecorationPool[];
};

/** 技能主資料（用於 UI 顯示上限、分類、描述）。 */
export type Skill = {
  name: string;
  nameEn?: string;
  maxLevel: number;
  category?: string;
  description?: string;
  /** 是否為高風險/高價值特殊技能（狂化、業鎧、狂龍症等），影響評分。 */
  special?: boolean;
  /**
   * World 技能解放後的上限（例：挑戰者 5→7）。新增選填欄位。
   * 僅在 profile.features.secretSkills 為真、且對應解放技能已由 set bonus 觸發時生效；
   * Rise 資料無此欄，maxLevel 為唯一上限，行為不變。
   */
  secretMaxLevel?: number;
  /**
   * 解放此技能上限的「○之力解放」技能名（例：攻擊 Attack Boost 的解放不存在；
   * 挑戰者由「Agitator Secret」解放）。新增選填欄位，語意同上。
   */
  secretUnlockedBy?: string;
  /**
   * 全域 secret 解放器（World Fatalis「Inheritance」）：觸發後解除**所有** secret
   * 技能的上限，不限特定技能。新增選填欄位；Rise 無此機制。
   */
  unlocksAllSecrets?: boolean;
  /**
   * 技能分家類別（Wilds）。對應 mhdb-wilds 的 `skill.kind`（Phase 0 定案 #1）：
   * armor＝防具技能、weapon＝武器技能、group＝群組技能（見 GroupSkill）、set＝set bonus 子技能。
   * 新增選填欄位；Rise/World 資料無此欄，珠池／seed 判定不依賴它時行為不變。
   */
  kind?: "armor" | "weapon" | "group" | "set";
};

/**
 * 套裝加成（World 真髓/加護 set bonus）：靠穿戴同 setBonusId 防具達件數門檻觸發技能。
 * Rise 無此機制（套裝技能為逐件技能，見 data.ts SET_SKILLS），故 Rise 資料不含 SetBonus。
 */
export type SetBonus = {
  id: string;
  /** 中文名（例：銀火龍的真髓）。 */
  nameZh: string;
  nameEn?: string;
  /**
   * 各件數門檻觸發的技能。pieces 為門檻（2/3/4/5），達到後 skillName 併入 skillLevel 級。
   * 主源（MHWorldData）每個 set bonus 最多 2 組門檻，映射為此陣列。
   */
  ranks: Array<{
    pieces: number;
    skillName: string;
    skillLevel: number;
  }>;
};

/**
 * 群組技能（Wilds group skill）：跨系列共享，任 3 件觸發（Phase 0 定案 #4：門檻恆 [3]）。
 * 與 SetBonus 為**獨立雙軸**（skill.kind 區分：set vs group），故定為獨立型別而非 SetBonus 別名——
 * 保留型別層的雙軸區分（ArmorPiece.setBonusId vs groupId），避免 group 統計與 set 統計混用。
 * 門檻仍**資料驅動**（沿用 SetBonus 的 ranks 形狀承載 [{pieces:3,...}]），未硬編 3，為未來相容留餘裕。
 * Rise/World 無此機制，資料不含 GroupSkill。
 */
export type GroupSkill = {
  id: string;
  nameZh: string;
  nameEn?: string;
  /** 件數門檻觸發的技能（Wilds 恆為單一 [{pieces:3,...}]，仍資料驅動不硬編）。 */
  ranks: Array<{
    pieces: number;
    skillName: string;
    skillLevel: number;
  }>;
};

/**
 * Wilds 資料版本 manifest（Phase 0 版本策略定案：集中 manifest，資料檔保持 bare-array）。
 * 落點＝`src/data/wilds/manifest.json`（Phase 2 產出）。集中而非每檔頂層的理由：現行
 * Rise/World 大資料檔為 bare array（loader 直接 import 陣列），若改物件包裹會動到所有 loader；
 * 集中 manifest 保資料檔形狀不變、版本/pin 單點可稽核、diff 報告單一入口讀取。
 * 本輪只定型別，不建資料檔（Phase 2 才產出）。
 */
export type WildsDataManifest = {
  /** 資料版本（pin 1.041）。 */
  dataVersion: string;
  /** 各上游源的 pin 資訊。 */
  sources: {
    /** 主源 mhdb-wilds：snapshot 日期 +（若有）data_version 端點值。 */
    mhdb?: { snapshotDate?: string; dataVersion?: string };
    /** 交叉源 Kiranico Wilds：頁首版號字串。 */
    kiranico?: { ver?: string };
  };
};

/** 武器類型定義。`supported: false` 的武器為佔位，將陸續開放。 */
export type WeaponType = {
  id: string;
  nameZh: string;
  nameEn?: string;
  supported: boolean;
};

/**
 * 依武器屬性自動加入條件技能的規則（○屬性攻擊強化）。
 * 流派 preset 移除後已無 UI caller，但屬搜尋引擎（build-search.ts）通用能力，
 * 由 BuildSearchRequest.autoRules 攜入、preset-resolver 解析；屬禁區（見 CLAUDE.md §0）
 * 保留，勿因 grep 無 caller 誤判為死碼。
 */
export type PresetAutoRules = {
  /** 依武器屬性（五屬性）自動加入對應「○屬性攻擊強化」。 */
  addElementAttackSkill?: boolean;
  /** 自動加入的屬性強化等級，預設 5。 */
  elementAttackLevel?: number;
};

/** 固定部位。字串為裝備 id（護石為清單制，不在固定範圍）。 */
export type FixedParts = {
  weapon?: string;
  head?: string;
  chest?: string;
  arms?: string;
  waist?: string;
  legs?: string;
};

export type ExcludedItems = {
  armorIds: string[];
  weaponIds: string[];
  /** 排除的護石 id（World craftable-list 模式；Rise 護石為使用者庫，不用此欄）。 */
  charmIds?: string[];
};

/** 保留洞位：每個等級要留幾個。第一版為硬性條件。 */
export type ReservedSlots = {
  4: number;
  3: number;
  2: number;
  1: number;
};

/**
 * 玩家遊戲進度（解放條件篩選用）。各軸獨立，未填＝該軸為 0。
 * 對應 unlocks.json 條目的多軸語意：任一軸達標即視為可製作。
 */
export type PlayerProgress = {
  /** 村莊任務進度（已解放的最高★，0-6）。 */
  village?: number;
  /** 集會所任務進度（已解放的最高★，1-3 初階＝低位、4-8 進階＝上位）。 */
  hub?: number;
  /** Master 集會所任務進度（MR 劇情章節★，0-6）。 */
  mrChapter?: number;
  /** MR 等級（通關後的數字等級，TU 魔物解放門檻用）。 */
  mrLevel?: number;
};

export type SearchMode = "fast" | "exact" | "greedy";

/** 武器搜尋模式：fixed = 固定指定武器；search = 從同類型武器中搜尋。 */
export type WeaponSearchMode = "fixed" | "search";

export type BuildSearchRequest = {
  weaponType: string;
  weaponSearchMode: WeaponSearchMode;
  /** weaponSearchMode 為 fixed 時使用的武器 id（與 fixedParts.weapon 相容，此欄優先）。 */
  fixedWeaponId?: string;
  /**
   * 依武器屬性逐武器套用的自動技能規則（search 模式）。
   * 流派 preset／guide 移除後已無 caller；引擎通用能力，屬禁區保留，勿因 grep 誤判為死碼。
   */
  autoRules?: PresetAutoRules;
  /** 武器屬性篩選（僅五屬性；search 模式縮小候選池，未指定＝不限）。 */
  elementFilter?: WeaponElementFilter;
  /** 最低防禦力（5 件防具基礎防禦總和）。未指定或 ≤0＝不限。 */
  minDefense?: number;
  /** 各屬性耐性下限（5 件防具總和）。只檢查有指定的屬性；未指定的屬性＝不限。 */
  minResistances?: Partial<Record<ElementResistanceKey, number>>;
  /**
   * 裝備 rarity 上限（同時套用於防具與 search 模式武器；未指定＝不限）。固定部位/武器不受限。
   * 流派 preset／guide 移除後已無 caller；引擎通用能力，屬禁區保留，勿因 grep 誤判為死碼。
   */
  maxRarity?: number;
  /**
   * 玩家遊戲進度（解放條件精確篩選，rarity 限裝的精確化替代）。
   * 指定且 deps 帶有 unlocks 資料時，候選池濾除進度尚未解放的裝備；
   * 未指定＝行為與既有搜尋完全相同。固定部位/武器不受限。
   */
  progress?: PlayerProgress;
  /**
   * 候選武器評分以屬性值優先。未指定時退回依 autoRules 推斷。
   * 流派 preset／guide 移除後已無 caller；引擎通用能力，屬禁區保留，勿因 grep 誤判為死碼。
   */
  preferElement?: boolean;
  /** @deprecated 舊版手動武器洞數。僅在武器候選池為空時作為後援。 */
  weaponSlots?: number[];
  /** 護石清單：每顆都會納入組合計算。空陣列＝不使用護石。 */
  charms: Charm[];
  /** 固定護石 id（World craftable-list 模式：只用此護石；Rise 不用此欄）。 */
  fixedCharmId?: string;
  fixedParts: FixedParts;
  excludedItems: ExcludedItems;
  requiredSkills: SkillMap;
  /** 排除技能（硬條件：最終配裝不得出現這些技能）。 */
  excludedSkills: string[];
  reservedSlots: ReservedSlots;
  searchMode: SearchMode;
  resultLimit: number;
};

/** 一顆被放入某個洞的珠子紀錄。 */
export type DecorationAssignment = {
  decorationId: string;
  decorationName: string;
  skillName: string;
  skillLevel: number;
  /** 珠子本身需要的洞等級。 */
  slotLevel: number;
  /** 實際被放進去的洞等級（可能比 slotLevel 高）。 */
  placedInSlotLevel: number;
  /** 洞來源部位。 */
  source: EquipmentPart;
};

/** 配裝的 EFR 參考值（同武器種類內可比較的期望傷害指標）。 */
export type BuildEfr = {
  /** 物理期望攻擊值。 */
  raw: number;
  /** 期望屬性值（無屬性武器為 0）。 */
  element: number;
  /** 綜合排序鍵（raw + element × 係數，見 efr.ts）。 */
  total: number;
};

export type BuildResult = {
  id: string;
  weapon?: Weapon;
  armor: {
    head: ArmorPiece;
    chest: ArmorPiece;
    arms: ArmorPiece;
    waist: ArmorPiece;
    legs: ArmorPiece;
  };
  charm: Charm;
  decorations: DecorationAssignment[];
  finalSkills: SkillMap;
  /** 補完珠子後仍剩下的洞（依等級展開，例如 [3,1]）。 */
  remainingSlots: number[];
  /** 5 件防具基礎防禦總和（顯示用；不含武器/護石）。 */
  totalDefense: number;
  /** 5 件防具各屬性耐性總和（顯示用，可為負）。 */
  totalResistances: Record<ElementResistanceKey, number>;
  /** EFR 參考值（預設排序鍵）。無武器（手動洞數後援）時全為 0。 */
  efr: BuildEfr;
  /** 未能補滿的必要技能（技能 → 還缺幾級）。理論上搜尋結果不含缺口，但保留欄位供 debug/greedy。 */
  missingRequiredSkills: SkillMap;
  /** 是否符合保留洞位需求。 */
  meetsReservedSlots: boolean;
  /** 由 autoRules 依武器屬性自動加入的技能（顯示用）。 */
  autoSkills?: SkillMap;
  /** 武器是否為使用者固定（false = 系統搜尋選出）。 */
  weaponFixed?: boolean;
  summary: string;
};

/** decoration-solver 的回傳結構。 */
export type DecorationSolveResult = {
  success: boolean;
  assignments: DecorationAssignment[];
  achievedSkills: SkillMap;
  remainingSlots: number[];
  /** 未補滿的必要技能缺口。 */
  missingRequired: SkillMap;
};

/** 候選池：每個部位對應一組候選裝備。 */
export type EquipmentPools = Record<ArmorPart, ArmorPiece[]>;
