import type {
  Charm,
  GroupSkill,
  SetBonus,
  Skill,
  WildsDataManifest,
} from "@/types/build";
import type { SearchDeps } from "./build-search";

/**
 * Wilds（Monster Hunter Wilds）執行期註冊 — **Phase 1 骨架，尚未接線**。
 *
 * ⚠️ 本檔為 PLAN-wilds Phase 1 的形狀預告：定義 Wilds 註冊/deps 的預期介面，但
 * **刻意不接線**（不 import `@/data/wilds/*`、不註冊 profile、stub 一律拋錯），
 * 避免半成品進 UI。真正實作分階落地：
 *  - Phase 2：`src/data/wilds/*.json` + `manifest.json`（pin 1.041）匯入產出。
 *  - Phase 3：`SearchDeps.wilds` 閘門（珠雙池約束、set/group 雙軌、護石混合池、武器 seed 技能）。
 *  - Phase 4：`efr-wilds.ts`（同介面第三實作，數值機械抽取）。
 *  - Phase 5：profile 註冊 + UI 三遊戲切換（storagePrefix、Artian 簡化輸入、珠池呈現）。
 *
 * 介面比照 `world-registry.ts`。Phase 0 機制定案見 docs/wilds-mechanics-audit.md。
 */

/**
 * Wilds 搜尋擴充的**預期**形狀（Phase 3 落實時併入 build-search 的 SearchDeps.wilds）。
 * 此處僅為型別預告，欄位以 Phase 0 定案為據，Phase 2/3 匯入時若資料形狀不合再調整。
 */
export type WildsStaticPlan = {
  skillByName: Record<string, Skill>;
  /** set bonus（2/4 件門檻，Phase 0 定案全 [2,4]，仍資料驅動）。 */
  setBonusById: Record<string, SetBonus>;
  /** 群組技能（3 件門檻，跨系列；與 set 為獨立雙軸）。 */
  groupById: Record<string, GroupSkill>;
  /** 有 secret 的技能名（動態上限）。 */
  secretSkillNames: string[];
  /** 可生產護石固定清單（craftable-list；RNG 護石走使用者庫輸入，不在此）。 */
  charms: Charm[];
  /** 資料版本 manifest（pin 1.041）。 */
  manifest: WildsDataManifest;
};

const NOT_IMPLEMENTED =
  "wilds-registry：Phase 1 骨架尚未接線（資料 Phase 2、引擎 Phase 3、EFR Phase 4、UI Phase 5）";

/** TODO(Phase 2/5)：載入並註冊 wilds 小資料 + profile。目前拋錯，不靜默退回。 */
export async function ensureWildsRegistered(): Promise<WildsStaticPlan> {
  throw new Error(NOT_IMPLEMENTED);
}

/** TODO(Phase 3)：建 wilds 搜尋相依（含 SearchDeps.wilds 閘門）。目前拋錯。 */
export async function loadWildsSearchDeps(): Promise<SearchDeps> {
  throw new Error(NOT_IMPLEMENTED);
}
