import type { GameId, SkillMap } from "@/types/build";
import * as riseEfr from "./efr";
import type { EfrInput, EfrResult } from "./efr";
import { getGameStaticData } from "./data";

/**
 * Game Profile 抽象層（PLAN-iceborne Phase 1d）。
 *
 * 把兩款遊戲的差異收斂成一個 profile 物件：EFR 模組、護石模式、功能開關、
 * 儲存前綴、動態技能上限解析。搜尋演算法本體（searchBuilds）不得因遊戲而分支，
 * World 專屬邏輯一律經由 profile 注入或資料層差異表達。
 *
 * 本檔在 Phase 1 只完整接上 Rise。World profile 依賴 Phase 2 資料與 Phase 4 的
 * efr-world.ts，屆時以 registerGameProfile() 完成註冊；其已知設定先記於
 * WORLD_PROFILE_PLAN（型別受 `satisfies` 檢查）。
 */

export type { GameId };

/** EFR 模組介面：efr.ts（Rise）與 efr-world.ts（World，Phase 4）須同介面。 */
export type EfrModule = {
  computeEfr: (input: EfrInput) => EfrResult;
  EFR_RELEVANT_SKILLS: ReadonlySet<string>;
};

export type GameFeatureFlags = {
  /** 百龍孔/百龍技能（Rise 有、World 無）。 */
  rampage: boolean;
  /** 傀異鍊成（Rise 有、World 無）。 */
  qurioAugment: boolean;
  /** 護石支配剪枝（Rise 對隨機護石有意義；World 無隨機護石，停用）。 */
  charmDominancePruning: boolean;
  /** 套裝加成 set bonus（Rise 無、World 有）。 */
  setBonus: boolean;
  /** 技能解放上限（Rise 無、World 有）。 */
  secretSkills: boolean;
};

export type GameProfile = {
  id: GameId;
  /** UI 標籤（破曉 / Iceborne）。 */
  labelZh: string;
  /** EFR 模組（efr-rise / efr-world，同介面）。 */
  efr: EfrModule;
  /** 護石模式：Rise 使用者護石庫；World 固定可生產清單；Wilds 混合（可生產 + 使用者庫）。 */
  charmMode: "talisman-library" | "craftable-list" | "mixed";
  features: GameFeatureFlags;
  /** localStorage 前綴（Rise "mhsb."、World "mhwib."，兩款狀態互不污染）。 */
  storagePrefix: string;
  /**
   * 動態解析技能上限：World 在對應「○之力解放」set bonus 技能觸發後提升上限
   * （例：挑戰者 5→7）。Rise 無此機制，恆回傳靜態上限。
   * activeSetBonusSkills 為當前已觸發的 set bonus 技能表（Rise 恆為空）。
   */
  resolveSkillMax(skill: string, activeSetBonusSkills: SkillMap): number;
};

// ---- Rise profile（每個值使現有路徑等價於今日行為）----
const riseSkillMax = getGameStaticData("rise").skillMax;

export const riseProfile: GameProfile = {
  id: "rise",
  labelZh: "破曉",
  efr: {
    computeEfr: riseEfr.computeEfr,
    EFR_RELEVANT_SKILLS: riseEfr.EFR_RELEVANT_SKILLS,
  },
  charmMode: "talisman-library",
  features: {
    rampage: true,
    qurioAugment: true,
    charmDominancePruning: true,
    setBonus: false,
    secretSkills: false,
  },
  storagePrefix: "mhsb.",
  // Rise 無 set bonus / 解放：恆回傳靜態上限；未列出技能回傳 Infinity（＝不截斷，
  // 與現行 clampSkillsToMax 對未知技能不設上限的語意等價）。activeSetBonusSkills 忽略。
  resolveSkillMax(skill: string): number {
    return riseSkillMax[skill] ?? Infinity;
  },
};

/**
 * World profile 的已知設定（PLAN Phase 1d 決定的所有非資料相依欄位）。
 * efr（efr-world.ts，Phase 4）與 resolveSkillMax（需 Phase 2 的 world skills
 * secretMaxLevel/secretUnlockedBy）補齊後，以 registerGameProfile() 註冊完整 profile。
 */
export const WORLD_PROFILE_PLAN = {
  id: "world",
  labelZh: "Iceborne",
  charmMode: "craftable-list",
  features: {
    rampage: false,
    qurioAugment: false,
    charmDominancePruning: false,
    setBonus: true,
    secretSkills: true,
  },
  storagePrefix: "mhwib.",
} satisfies Omit<GameProfile, "efr" | "resolveSkillMax">;

// ---- Profile 註冊表（Phase 1 只註冊 Rise；World 於 Phase 4/5 註冊）----
const profiles = new Map<GameId, GameProfile>([["rise", riseProfile]]);

/** 取得指定遊戲的 profile。未註冊（如 Phase 1 的 World）拋錯，不靜默退回 Rise。 */
export function getGameProfile(gameId: GameId): GameProfile {
  const p = profiles.get(gameId);
  if (!p) {
    throw new Error(
      `game profile not registered for "${gameId}" (World 於 Phase 4/5 註冊)`
    );
  }
  return p;
}

/** 註冊/覆寫一款遊戲的 profile（Phase 4/5 接上 World 用）。 */
export function registerGameProfile(profile: GameProfile) {
  profiles.set(profile.id, profile);
}
