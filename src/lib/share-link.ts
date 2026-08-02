import type { ExcludedItems, FixedParts, GameId, SkillMap, WeaponSearchMode } from "@/types/build";
import {
  deserializeSearchConditions,
  type SearchConditions,
} from "./search-conditions";
import {
  isNoopAugment,
  sanitizeWeaponAugment,
  type WorldWeaponAugment,
} from "./world-weapon-augment";

/**
 * 配裝器「可分享連結」的編碼／解碼。
 *
 * 刻意只序列化搜尋條件的子集：必要/排除技能、鎖定/排除裝備、武器選擇與「使用護石」
 * 開關。**護石清單不進 URL**——玩家可能有數十顆護石，序列化會撞 URL 長度上限；
 * 且護石是個人倉庫，分享語意上不該帶。打開分享連結者以自己的護石跑同樣條件，
 * 結果因人而異是正確行為。
 *
 * 與 search-conditions.ts 的 serializeSearchConditions（全量、含護石、供 localStorage）
 * 分開：讀取分享連結時用 deserializeSearchConditions 消毒（護石欄缺→[]），再由頁面
 * 合併時保留使用者自己的護石。
 */

/** 分享用的配裝器狀態子集。 */
export type ShareableBuilderState = {
  v: 1;
  /** 遊戲；舊格式連結無此欄，解碼時視為 "rise"（向後相容）。 */
  game?: GameId;
  weaponType?: string;
  weaponSearchMode?: WeaponSearchMode;
  fixedWeaponId?: string;
  elementFilter?: string;
  /** World 武器強化「簡化輸入」；舊連結無此欄，解碼時視為無強化（向後相容）。 */
  worldWeaponAugment?: WorldWeaponAugment;
  /** SearchConditions 去掉護石後的欄位（用 deserialize 還原、消毒）。 */
  conditions: {
    requiredSkills: SkillMap;
    excludedSkills: string[];
    fixedParts: FixedParts;
    excludedItems: ExcludedItems;
    useCharms: boolean;
  };
};

/** 解碼後回傳給頁面的形狀：條件已消毒（charms 為 []），另附武器選擇欄位。 */
export type DecodedShare = {
  /** 遊戲；舊格式連結無 game 欄時恆為 "rise"。 */
  game: GameId;
  conditions: SearchConditions;
  weaponType?: string;
  weaponSearchMode?: WeaponSearchMode;
  fixedWeaponId?: string;
  elementFilter?: string;
  /** World 武器強化；舊連結無 → undefined。 */
  worldWeaponAugment?: WorldWeaponAugment;
};

/** 把配裝器目前狀態編成 URL query 值（不含護石）。 */
export function encodeShareState(input: {
  game?: GameId;
  conditions: SearchConditions;
  weaponType?: string;
  weaponSearchMode?: WeaponSearchMode;
  fixedWeaponId?: string;
  elementFilter?: string;
  worldWeaponAugment?: WorldWeaponAugment;
}): string {
  const payload: ShareableBuilderState = {
    v: 1,
    game: input.game ?? "rise",
    weaponType: input.weaponType,
    weaponSearchMode: input.weaponSearchMode,
    fixedWeaponId: input.fixedWeaponId || undefined,
    elementFilter: input.elementFilter,
    // 只在有實際強化時帶入，避免無謂膨脹連結。
    worldWeaponAugment:
      input.worldWeaponAugment && !isNoopAugment(input.worldWeaponAugment)
        ? input.worldWeaponAugment
        : undefined,
    conditions: {
      requiredSkills: input.conditions.requiredSkills,
      excludedSkills: input.conditions.excludedSkills,
      fixedParts: input.conditions.fixedParts,
      excludedItems: input.conditions.excludedItems,
      useCharms: input.conditions.useCharms,
    },
  };
  return encodeURIComponent(JSON.stringify(payload));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;

/** 解碼 URL query 值。壞資料回傳 null（由頁面忽略，不影響現有狀態）。 */
export function decodeShareState(raw: string): DecodedShare | null {
  let obj: unknown;
  try {
    obj = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!isRecord(obj)) return null;
  // conditions 經 deserialize 消毒（護石缺→[]、畸形欄位退預設）。
  const conditions = deserializeSearchConditions(obj.conditions);
  const mode = asString(obj.weaponSearchMode);
  // 舊格式（無 game 欄）視為 rise；只認識已知遊戲，其餘退回 rise。
  const game: GameId =
    obj.game === "world" ? "world" : obj.game === "wilds" ? "wilds" : "rise";
  // World 武器強化：缺欄（舊連結）→ undefined；有欄則消毒。只在 world 生效。
  const worldWeaponAugment =
    game === "world" && obj.worldWeaponAugment !== undefined
      ? sanitizeWeaponAugment(obj.worldWeaponAugment)
      : undefined;
  return {
    game,
    conditions,
    weaponType: asString(obj.weaponType),
    weaponSearchMode:
      mode === "fixed" || mode === "search" ? mode : undefined,
    fixedWeaponId: asString(obj.fixedWeaponId),
    elementFilter: asString(obj.elementFilter),
    worldWeaponAugment,
  };
}
