/// <reference lib="webworker" />
/**
 * 配裝搜尋 Web Worker。
 *
 * 只做「搬移」：直接 import 現有 build-search 模組，護石剪枝、候選集 limit、MAX_COMBOS
 * 等行為完全沿用，演算法一行未改。worker 有獨立 module cache，故自行 loadGameData()
 * 載入一份防具/武器資料（與主執行緒各一份，互不干擾）。
 *
 * 搬入 worker 的目的：搜尋為同步重運算（50 顆護石可達數秒），放主執行緒會凍結 UI；
 * 移入 worker 後主執行緒在搜尋期間仍可切 Tab、捲動；並支援 terminate 取消。
 */
import type { ArmorPiece, BuildSearchRequest, GameId } from "@/types/build";
import { searchBuilds, createSearchDeps, type SearchDeps, type SearchOutput } from "./build-search";
import { loadGameData } from "./game-data";
import {
  applyWeaponAugment,
  hasNumericDelta,
  type WorldWeaponAugment,
} from "./world-weapon-augment";

export type SearchWorkerRequest = {
  /** 遞增搜尋序號：主執行緒用來忽略已取消/過期的回傳。 */
  id: number;
  request: BuildSearchRequest;
  /** 傀異鍊成自訂防具（主執行緒 state，隨請求序列化帶入）。 */
  augments: ArmorPiece[];
  /** 遊戲（未帶＝rise，向後相容）。World 走 world-registry 的固定護石候選池 deps。 */
  gameId?: GameId;
  /**
   * World 武器強化「簡化輸入」。僅 gameId==="world" 且固定武器模式下套用：
   * 數值 delta 改武器副本、虛擬 set bonus 設 deps.world.virtualSetBonus。
   */
  worldWeaponAugment?: WorldWeaponAugment;
  /**
   * Wilds Artian「簡化輸入」。僅 gameId==="wilds" 且固定武器模式下套用：
   * 數值 delta（攻擊/會心/屬性/追加洞，Artian 為武器→weapon 池）改武器副本；無 set bonus。
   */
  wildsWeaponAugment?: WorldWeaponAugment;
};

export type SearchWorkerResponse =
  | { id: number; ok: true; output: SearchOutput }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/**
 * 把 World 武器強化套進 world deps（僅固定武器模式）。
 * - 數值 delta：對固定 id 的武器建淺拷貝＋改值，重建 weaponById 覆蓋該 id（不 mutate 共享資料）。
 * - 虛擬 set bonus：設 deps.world.virtualSetBonus，供 computeSetBonusSkills 種入 +1 件。
 * 無 augment / 非固定模式 / 找不到武器 → 原 deps 原樣返回。
 */
function applyWorldWeaponAugment(
  deps: SearchDeps,
  request: BuildSearchRequest,
  aug: WorldWeaponAugment | undefined
): SearchDeps {
  if (!aug || request.weaponSearchMode !== "fixed" || !deps.world) return deps;
  const id = request.fixedWeaponId ?? request.fixedParts?.weapon;
  if (!id) return deps;
  let next = deps;
  const base = deps.weaponById[id];
  if (base && hasNumericDelta(aug)) {
    const augmented = applyWeaponAugment(base, aug);
    next = { ...next, weaponById: { ...next.weaponById, [id]: augmented } };
  }
  if (aug.setBonusId) {
    next = {
      ...next,
      world: { ...next.world!, virtualSetBonus: { [aug.setBonusId]: 1 } },
    };
  }
  return next;
}

ctx.onmessage = async (e: MessageEvent<SearchWorkerRequest>) => {
  const { id, request, augments, gameId, worldWeaponAugment, wildsWeaponAugment } = e.data;
  try {
    let deps: SearchDeps;
    if (gameId === "world") {
      // World：固定可生產護石候選池 + set bonus/動態上限 + efr-world（world-registry 內接線）。
      // 動態 import：world 引擎程式只在 worker 實際搜 world 時載入，不進 rise 路徑。
      const { loadWorldSearchDeps } = await import("./world-registry");
      deps = await loadWorldSearchDeps();
      // 武器強化「簡化輸入」（僅固定武器模式）：改武器副本 + 虛擬 set bonus。
      // 只重建 weaponById 覆蓋單一 id，不 mutate 共享的 dynamic-import 快取資料。
      deps = applyWorldWeaponAugment(deps, request, worldWeaponAugment);
    } else if (gameId === "wilds") {
      // Wilds：珠雙池 + set/group 雙軌 + 護石混合池 + efr-wilds（wilds-registry 內接線）。
      // 動態 import → 獨立 lazy chunk，不進 rise/world 路徑。使用者護石庫經 request.charms 帶入
      // （build-search wilds 分支合併可生產池）；Artian 簡化輸入改武器副本（無 set bonus）。
      const { loadWildsSearchDeps } = await import("./wilds-registry");
      deps = await loadWildsSearchDeps();
      if (
        wildsWeaponAugment &&
        request.weaponSearchMode === "fixed" &&
        hasNumericDelta(wildsWeaponAugment)
      ) {
        const wid = request.fixedWeaponId ?? request.fixedParts?.weapon;
        const base = wid ? deps.weaponById[wid] : undefined;
        if (wid && base) {
          deps = {
            ...deps,
            weaponById: { ...deps.weaponById, [wid]: applyWeaponAugment(base, wildsWeaponAugment) },
          };
        }
      }
    } else {
      const gd = await loadGameData();
      deps = createSearchDeps(gd, augments);
    }
    const output = searchBuilds(request, deps, () =>
      typeof performance !== "undefined" ? performance.now() : 0
    );
    ctx.postMessage({ id, ok: true, output } satisfies SearchWorkerResponse);
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies SearchWorkerResponse);
  }
};
