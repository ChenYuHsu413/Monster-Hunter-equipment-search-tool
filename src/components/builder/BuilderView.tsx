"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ArmorPart,
  ArmorPiece,
  BuildResult,
  BuildSearchRequest,
  Charm,
  ElementResistanceKey,
  FixedParts,
  ExcludedItems,
  GameId,
  ReservedSlots,
  SetBonus,
  SearchMode,
  SkillMap,
  WeaponSearchMode,
} from "@/types/build";
import { getGameStaticData, type GameStaticData } from "@/lib/data";
import { loadGameData, type GameData } from "@/lib/game-data";
import { type SearchMeta } from "@/lib/build-search";
import { getGameProfile, type GameProfile } from "@/lib/game-profile";
import { GameIdProvider } from "@/lib/game-context";
import type {
  SearchWorkerRequest,
  SearchWorkerResponse,
} from "@/lib/search.worker";
import { slotValue } from "@/lib/slot-utils";
import { useLocalStorage } from "@/lib/use-local-storage";
import {
  EMPTY_SEARCH_CONDITIONS,
  migrateLegacyConditions,
  ownedCharmToCharm,
  type OwnedCharm,
  type SearchConditions,
} from "@/lib/search-conditions";
import { decodeShareState, encodeShareState } from "@/lib/share-link";
import type { BuilderImport } from "@/lib/builder-import";
import {
  EMPTY_WORLD_WEAPON_AUGMENT,
  isNoopAugment,
  type WorldWeaponAugment,
} from "@/lib/world-weapon-augment";

import { WeaponSelector } from "@/components/WeaponSelector";
import { WeaponPicker, type ElementFilterValue } from "@/components/WeaponPicker";
import { SearchModeSelector } from "@/components/SearchModeSelector";
import { SkillRequirementEditor } from "@/components/SkillRequirementEditor";
import { CharmListPanel } from "@/components/CharmListPanel";
import { WorldCharmPanel } from "@/components/WorldCharmPanel";
import { WorldWeaponAugmentPanel } from "@/components/WorldWeaponAugmentPanel";
import { ReservedSlotsInput } from "@/components/ReservedSlotsInput";
import { DefenseResInput } from "@/components/DefenseResInput";
import { FixedPartsPanel } from "@/components/FixedPartsPanel";
import { ArmorLockPanel } from "@/components/ArmorLockPanel";
import { AugmentedArmorEditor } from "@/components/AugmentedArmorEditor";
import { BuildResultCard } from "@/components/BuildResultCard";
import { EmptyState } from "@/components/EmptyState";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Search,
  Share2,
  Loader2,
  Check,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

/** 結果排序鍵：EFR / 防禦 / 孔位餘裕。 */
type SortKey = "efr" | "defense" | "slots";

const SORT_OPTIONS: { key: SortKey; label: string; hint: string }[] = [
  { key: "efr", label: "EFR", hint: "期望攻擊值（含屬性）由高到低" },
  { key: "defense", label: "防禦", hint: "5 件防具基礎防禦總和由高到低" },
  { key: "slots", label: "孔位餘裕", hint: "剩餘洞位價值由高到低" },
];

type BuilderViewProps = {
  /** 目前遊戲（PLAN Phase 5）。預設 rise；page.tsx 以 key=gameId 重掛載切換。 */
  gameId?: GameId;
  /** 由推薦配裝頁交付的待套用匯入指令（切到配裝器時帶入）。 */
  pendingImport?: BuilderImport | null;
  /** 套用完成後通知外層清空 pendingImport。 */
  onConsumeImport?: () => void;
};

/** 匯入完成後在條件區顯示的一行提示。 */
type ImportNotice =
  | {
      source: "game8";
      importedCount: number;
      totalCount: number;
      droppedAugment: boolean;
      /** 被排除的 special（錬成衍生）技能名，供點名說明為何未匯入。 */
      excludedSpecial: string[];
    }
  | {
      source: "community";
      /** 匯入的目標技能項數。 */
      skillCount: number;
      /** 實際鎖定的防具件數。 */
      lockedArmorCount: number;
      /** 配裝原本的防具件數（恆 5）。 */
      totalArmorCount: number;
      /** 被排除的 special 技能名。 */
      excludedSpecial: string[];
    }
  | {
      source: "world";
      importedCount: number;
      totalCount: number;
      /** 此配裝依賴的未模擬系統中文標籤（點名警告）。 */
      unmodeledSystems: string[];
    };

export function BuilderView({
  gameId = "rise",
  pendingImport,
  onConsumeImport,
}: BuilderViewProps = {}) {
  // localStorage 前綴：rise "mhsb." / world "mhwib." / wilds "mhwd."（三款狀態互不污染）。
  // gameId 於本元件生命週期恆定（page.tsx 以 key=gameId 重掛載切換），故可直接由 gameId 導出。
  const prefix =
    gameId === "world" ? "mhwib." : gameId === "wilds" ? "mhwd." : "mhsb.";
  const isWorld = gameId === "world";
  const isWilds = gameId === "wilds";
  // rise 小資料模組載入時同步註冊；world/wilds 需動態 import registry 註冊（引擎維持 lazy chunk）。
  const needsRegistry = isWorld || isWilds;

  // ---- 小資料（技能/武器類型/珠子索引/set bonus）與 profile：per-game ----
  const [gameStatic, setGameStatic] = useState<GameStaticData | null>(
    needsRegistry ? null : getGameStaticData("rise")
  );
  const [profile, setProfile] = useState<GameProfile | null>(
    needsRegistry ? null : getGameProfile("rise")
  );
  const [worldCharmPool, setWorldCharmPool] = useState<Charm[]>([]);
  useEffect(() => {
    if (!needsRegistry) return;
    let alive = true;
    (async () => {
      if (isWorld) {
        const { ensureWorldRegistered } = await import("@/lib/world-registry");
        const ws = await ensureWorldRegistered();
        if (!alive) return;
        setGameStatic(getGameStaticData("world"));
        setProfile(getGameProfile("world"));
        setWorldCharmPool(ws.charms);
      } else if (isWilds) {
        const { ensureWildsRegistered } = await import("@/lib/wilds-registry");
        await ensureWildsRegistered();
        if (!alive) return;
        setGameStatic(getGameStaticData("wilds"));
        setProfile(getGameProfile("wilds"));
        // 可生產護石自動進候選池（引擎 build-search wilds 分支）；UI 護石庫收 RNG 護石，故不設 worldCharmPool。
      }
    })();
    return () => {
      alive = false;
    };
  }, [needsRegistry, isWorld, isWilds]);

  const weaponTypes = gameStatic?.weaponTypes ?? [];
  const allSkills = gameStatic?.skills ?? [];

  // ---- 延遲載入的防具 / 武器資料（不進首屏 bundle）----
  const [gameData, setGameData] = useState<GameData | null>(null);
  useEffect(() => {
    let alive = true;
    loadGameData(gameId).then((gd) => {
      if (alive) setGameData(gd);
    });
    return () => {
      alive = false;
    };
  }, [gameId]);

  // 資料就緒：rise 的小資料同步可用（初始 state 即非空），故此旗標對 rise 恆等於 !gameData
  // （行為不變）；world 另需 gameStatic/profile 由 world-registry 非同步註冊完成。
  const dataLoading = !gameData || !gameStatic || !profile;

  // World 結果卡顯示所需（set bonus / secret 分母）。Rise 為 undefined，結果卡不渲染 World 區塊。
  const worldSetBonusById = useMemo(() => {
    const m: Record<string, SetBonus> = {};
    for (const b of gameStatic?.setBonuses ?? []) m[b.id] = b;
    return m;
  }, [gameStatic]);
  // ---- 基礎設定（persist 到 localStorage）----
  const [weaponType, setWeaponType] = useLocalStorage(`${prefix}weaponType`, "long-sword");
  const [searchMode, setSearchMode] = useLocalStorage<SearchMode>(`${prefix}searchMode`, "fast");

  // ---- 武器設定 ----
  const [weaponSearchMode, setWeaponSearchMode] = useLocalStorage<WeaponSearchMode>(
    `${prefix}weaponSearchMode`,
    "search"
  );
  // 固定武器 id，"" 表示未選（localStorage 不便存 undefined）。
  const [fixedWeaponId, setFixedWeaponId] = useLocalStorage(`${prefix}fixedWeaponId`, "");
  // 武器屬性篩選。"all" 代表不限。
  const [elementFilter, setElementFilter] = useLocalStorage<ElementFilterValue>(
    `${prefix}elementFilter`,
    "all"
  );

  // ---- World 武器強化「簡化輸入」（覺醒／客製強化；僅固定武器模式）。Rise 不用。 ----
  const [worldWeaponAugment, setWorldWeaponAugment] =
    useLocalStorage<WorldWeaponAugment>(
      `${prefix}worldWeaponAugment`,
      EMPTY_WORLD_WEAPON_AUGMENT
    );
  // 實際會送進搜尋的強化：僅 World + 固定武器 + 有選武器 + 非空強化時才帶。
  const activeWeaponAugment =
    isWorld &&
    weaponSearchMode === "fixed" &&
    !!fixedWeaponId &&
    !isNoopAugment(worldWeaponAugment)
      ? worldWeaponAugment
      : undefined;
  // Wilds Artian 簡化輸入（復用同一 delta state；無 set bonus）：僅 wilds + 固定武器 + 非空。
  const activeWildsAugment =
    isWilds &&
    weaponSearchMode === "fixed" &&
    !!fixedWeaponId &&
    !isNoopAugment(worldWeaponAugment)
      ? worldWeaponAugment
      : undefined;

  // World 結果卡顯示所需（set bonus / secret 分母 / 虛擬件數）。Rise 為 undefined。
  const worldResultInfo = useMemo(
    () =>
      isWorld && profile && gameStatic
        ? {
            setBonusById: worldSetBonusById,
            skillByName: gameStatic.skillByName,
            resolveSkillMax: profile.resolveSkillMax,
            // 武器覺醒賦予的虛擬 set bonus（+1 件）：結果卡件數統計種入。
            virtualSetBonus: activeWeaponAugment?.setBonusId
              ? { [activeWeaponAugment.setBonusId]: 1 }
              : undefined,
          }
        : undefined,
    [isWorld, profile, gameStatic, worldSetBonusById, activeWeaponAugment]
  );

  // ---- World 護石選擇（craftable-list）：固定一顆 / 排除若干顆。Rise 不用。 ----
  const [worldFixedCharmId, setWorldFixedCharmId] = useLocalStorage(
    `${prefix}worldFixedCharmId`,
    ""
  );
  const [worldExcludedCharmIds, setWorldExcludedCharmIds] = useLocalStorage<string[]>(
    `${prefix}worldExcludedCharmIds`,
    []
  );

  // ---- 搜尋條件（單一 state 物件；「推薦配裝匯入」可經 deserialize 整包帶入）----
  const [conditions, setConditions] = useLocalStorage<SearchConditions>(
    `${prefix}searchConditions`,
    EMPTY_SEARCH_CONDITIONS
  );
  const {
    requiredSkills: required,
    excludedSkills,
    fixedParts,
    excludedItems,
    charms,
    useCharms,
  } = conditions;

  // 一次性遷移：改版前的零散 key（必要/排除技能、固定/排除裝備、護石庫）。
  // 僅 rise（舊版只有 Rise 資料，mhwib.* 無舊格式可遷移）。
  useEffect(() => {
    if (isWorld) return;
    if (window.localStorage.getItem("mhsb.searchConditions") != null) return;
    const migrated = migrateLegacyConditions();
    if (migrated) setConditions(migrated);
    // 只在掛載時檢查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 開啟帶條件的分享連結（?c=）：還原搜尋條件與武器選擇，但**保留使用者自己的護石**
  // （分享連結不帶護石）；還原後清掉 c 參數，避免污染網址列。此 effect 宣告在
  // useLocalStorage 的 hydration effect 之後，故能覆蓋 localStorage 還原值。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c) {
      const decoded = decodeShareState(c);
      // 只套用與本遊戲相符的分享條件（page.tsx 依 ?game= 已切到對應 BuilderView）。
      if (decoded && decoded.game === gameId) {
        setConditions((prev) => ({
          ...prev,
          requiredSkills: decoded.conditions.requiredSkills,
          excludedSkills: decoded.conditions.excludedSkills,
          fixedParts: decoded.conditions.fixedParts,
          excludedItems: decoded.conditions.excludedItems,
          useCharms: decoded.conditions.useCharms,
        }));
        if (decoded.weaponType) setWeaponType(decoded.weaponType);
        if (decoded.weaponSearchMode) setWeaponSearchMode(decoded.weaponSearchMode);
        if (decoded.fixedWeaponId !== undefined)
          setFixedWeaponId(decoded.fixedWeaponId);
        if (decoded.elementFilter)
          setElementFilter(decoded.elementFilter as ElementFilterValue);
        // World 武器強化：連結有帶則套用，無帶（舊連結）維持既有（不覆寫成空）。
        if (decoded.worldWeaponAugment)
          setWorldWeaponAugment(decoded.worldWeaponAugment);
        setSharedNotice(true);
      }
      params.delete("c");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : "")
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRequired = (v: SkillMap | ((prev: SkillMap) => SkillMap)) =>
    setConditions((prev) => ({
      ...prev,
      requiredSkills: typeof v === "function" ? v(prev.requiredSkills) : v,
    }));
  const setExcludedSkills = (v: string[]) =>
    setConditions((prev) => ({ ...prev, excludedSkills: v }));
  const setFixedParts = (v: FixedParts | ((prev: FixedParts) => FixedParts)) =>
    setConditions((prev) => ({
      ...prev,
      fixedParts: typeof v === "function" ? v(prev.fixedParts) : v,
    }));
  const setExcludedItems = (
    v: ExcludedItems | ((prev: ExcludedItems) => ExcludedItems)
  ) =>
    setConditions((prev) => ({
      ...prev,
      excludedItems: typeof v === "function" ? v(prev.excludedItems) : v,
    }));
  const setCharms = (v: OwnedCharm[]) =>
    setConditions((prev) => ({ ...prev, charms: v }));
  const setUseCharms = (v: boolean) =>
    setConditions((prev) => ({ ...prev, useCharms: v }));

  // ---- 保留洞位 ----
  const [reservedSlots, setReservedSlots] = useLocalStorage<ReservedSlots>(`${prefix}reserved`, {
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  });

  // ---- 防禦 / 屬性耐性下限（硬性條件；空＝不限）----
  const [minDefense, setMinDefense] = useLocalStorage(`${prefix}minDefense`, 0);
  const [minResistances, setMinResistances] = useLocalStorage<
    Partial<Record<ElementResistanceKey, number>>
  >(`${prefix}minResistances`, {});

  // ---- 傀異鍊成自訂防具（Rise 專屬；World features.qurioAugment=false 不顯示）----
  const [augments, setAugments] = useLocalStorage<ArmorPiece[]>(`${prefix}augments`, []);

  // ---- 結果（不 persist）----
  const [results, setResults] = useState<BuildResult[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // 搜尋 Worker（延遲建立、跨搜尋重用；取消時 terminate 後置 null 重建）。
  const workerRef = useRef<Worker | null>(null);
  // 遞增搜尋序號：忽略已取消/過期的 worker 回傳。
  const searchIdRef = useRef(0);
  // 搜尋中經過毫秒（不確定進度提示；searchBuilds 為整段同步、無增量進度）。
  const [searchElapsed, setSearchElapsed] = useState(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const searchStartRef = useRef(0);
  // 最近一次送出的搜尋請求（gated parity 對照用）。
  const lastRequestRef = useRef<BuildSearchRequest | null>(null);
  const [sortKey, setSortKey] = useLocalStorage<SortKey>(`${prefix}sortKey`, "efr");
  // 顯示上限：手機首訪預設 20、桌機 100；有存過就沿用。（讀 effect 先於寫 effect）
  const [resultLimit, setResultLimit] = useState(100);
  useEffect(() => {
    const stored = window.localStorage.getItem(`${prefix}resultLimit`);
    if (stored != null) {
      setResultLimit(Math.max(1, Math.min(100, Number(stored) || 100)));
    } else if (window.innerWidth < 1024) {
      setResultLimit(20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    window.localStorage.setItem(`${prefix}resultLimit`, String(resultLimit));
  }, [prefix, resultLimit]);

  // 收藏 / 比較（存為陣列以利序列化）
  const [favorites, setFavorites] = useLocalStorage<string[]>(`${prefix}favorites`, []);
  const [compared, setCompared] = useLocalStorage<string[]>(`${prefix}compared`, []);
  const [toast, setToast] = useState<string | null>(null);
  // 開啟帶條件的分享連結時顯示的一行提示（護石以使用者自己的清單計算）。
  const [sharedNotice, setSharedNotice] = useState(false);

  // 手機版：搜尋條件面板是否展開（桌機恆顯示，此狀態只影響 <lg）。
  const [conditionsOpen, setConditionsOpen] = useState(true);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // 條件區容器（匯入/鎖定後捲動對齊）。
  const asideRef = useRef<HTMLElement>(null);
  // 由推薦配裝匯入後顯示的一行提示；null＝不顯示。
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  // 最近一次匯入是否為社群配裝（鎖 5 件＋目標技能）。用於零結果時的脈絡提示。
  const [fromCommunityImport, setFromCommunityImport] = useState(false);
  // 搜尋後條件是否又被更動（顯示「條件已變更，重新搜尋」提示；不自動觸發）。
  const [dirtySinceSearch, setDirtySinceSearch] = useState(false);

  const weaponById = gameData?.weaponById ?? {};
  const allArmors = gameData?.armors ?? [];
  const typeWeapons = useMemo(
    () => (gameData ? gameData.weapons.filter((w) => w.weaponType === weaponType) : []),
    [gameData, weaponType]
  );
  // 來源怪兩層下拉：全武器類型皆啟用。
  // 屬性篩選：弩槍（輕弩/重弩）非屬性武器（無五屬性資料），故排除；其餘 12 類啟用。
  const elementFilterEnabled =
    weaponType !== "light-bowgun" && weaponType !== "heavy-bowgun";
  const activeElementFilter: ElementFilterValue = elementFilterEnabled
    ? elementFilter
    : "all";

  // 已排除的裝備/武器 id 集合（供結果卡片標示排除狀態）
  const excludedIds = useMemo(
    () => new Set([...excludedItems.armorIds, ...excludedItems.weaponIds]),
    [excludedItems]
  );

  // 合併鍊成防具的 armorById（供固定面板顯示名稱）
  const armorById = useMemo(() => {
    const m: Record<string, ArmorPiece> = { ...(gameData?.armorById ?? {}) };
    for (const a of augments) m[a.id] = a;
    return m;
  }, [gameData, augments]);

  // 依排序鍵重排目前結果（client 端重排，不需重新搜尋）
  const sortedResults = useMemo(() => {
    const arr = [...results];
    if (sortKey === "defense") {
      arr.sort(
        (a, b) => b.totalDefense - a.totalDefense || b.efr.total - a.efr.total
      );
    } else if (sortKey === "slots") {
      arr.sort(
        (a, b) =>
          slotValue(b.remainingSlots) - slotValue(a.remainingSlots) ||
          b.efr.total - a.efr.total
      );
    } else {
      arr.sort((a, b) => b.efr.total - a.efr.total);
    }
    return arr;
  }, [results, sortKey]);

  /** 屬性篩選變更：更新篩選（縮小候選武器候選池）。 */
  const changeElementFilter = (v: ElementFilterValue) => {
    setElementFilter(v);
  };

  const changeWeapon = (w: string) => {
    setWeaponType(w);
    setElementFilter("all");
    setFixedWeaponId("");
    // 武器強化與特定武器綁定，換武器種類時清掉（避免舊 delta 靜默套到新武器）。
    if (isWorld) setWorldWeaponAugment({ ...EMPTY_WORLD_WEAPON_AUGMENT });
    setFixedParts((prev) => {
      const next = { ...prev };
      delete next.weapon;
      return next;
    });
  };

  const changeWeaponSearchMode = (m: WeaponSearchMode) => {
    setWeaponSearchMode(m);
    if (m === "search") {
      setFixedParts((prev) => {
        const next = { ...prev };
        delete next.weapon;
        return next;
      });
    } else {
      const w = fixedWeaponId ? weaponById[fixedWeaponId] : undefined;
      if (w) {
        setFixedParts((prev) => ({ ...prev, weapon: w.id }));
      }
    }
  };

  const pickWeapon = (id: string) => {
    setFixedWeaponId(id);
    setFixedParts((prev) => ({ ...prev, weapon: id }));
  };

  // ---- 搜尋期間的經過毫秒計時（不確定進度提示）----
  const startElapsed = () => {
    searchStartRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
    setSearchElapsed(0);
    elapsedTimerRef.current = window.setInterval(() => {
      setSearchElapsed(
        (typeof performance !== "undefined" ? performance.now() : 0) -
          searchStartRef.current
      );
    }, 100);
  };
  const stopElapsed = () => {
    if (elapsedTimerRef.current != null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  /** 套用搜尋結果（全寬度搜尋後自動收合條件區；手機版另捲動對齊收合列）。 */
  const applySearchOutput = (out: SearchWorkerResponse & { ok: true }) => {
    setResults(out.output.results);
    setMeta(out.output.meta);
    setDirtySinceSearch(false);
    setConditionsOpen(false);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setTimeout(
        () =>
          toggleRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        140
      );
    }
  };

  /**
   * gated 一致性對照（?workerParity=1）：worker 回傳後，在主執行緒以同一 request 同步
   * 再算一次，比對「有序」id 列表。有序比對是刻意的——順序差異代表 EFR 計算在 worker
   * 環境有偏移，也要抓出。結果印到 console（PARITY OK / MISMATCH）。
   */
  const runParityCheck = async (workerOut: SearchWorkerResponse & { ok: true }) => {
    const req = lastRequestRef.current;
    if (!req) return;
    if (isWorld) return; // parity 對照僅 Rise（world deps 由 world-registry 提供，非本路徑）
    // 動態 import：搜尋引擎只在此開發用對照路徑載入，故不進首屏 bundle（Phase 5 lazy 化）。
    const { searchBuilds, createSearchDeps } = await import("@/lib/build-search");
    const gd = gameData ?? (await loadGameData(gameId));
    const inline = searchBuilds(req, createSearchDeps(gd, augments), () => 0);
    const a = workerOut.output.results.map((r) => r.id);
    const b = inline.results.map((r) => r.id);
    const same = a.length === b.length && a.every((id, i) => id === b[i]);
    if (same) {
      // eslint-disable-next-line no-console
      console.log(
        `[workerParity] OK — worker 與主執行緒有序 id 完全一致（${a.length} 套；有效組合 worker=${workerOut.output.meta.validBuilds} inline=${inline.meta.validBuilds}；護石 ${req.charms.length}）`
      );
    } else {
      const diffAt = a.findIndex((id, i) => id !== b[i]);
      // eslint-disable-next-line no-console
      console.warn(
        `[workerParity] MISMATCH — worker=${a.length} inline=${b.length}，首個相異位置 #${diffAt}`,
        { worker: a.slice(0, 5), inline: b.slice(0, 5) }
      );
    }
  };

  /** 延遲建立 / 重用搜尋 Worker；onmessage 以 searchId 忽略過期回傳。 */
  const ensureWorker = (): Worker => {
    if (!workerRef.current) {
      const w = new Worker(
        new URL("../../lib/search.worker.ts", import.meta.url)
      );
      w.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
        const msg = e.data;
        if (msg.id !== searchIdRef.current) return; // 已取消/過期
        stopElapsed();
        setLoading(false);
        if (msg.ok) {
          applySearchOutput(msg);
          if (
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("workerParity") ===
              "1"
          ) {
            runParityCheck(msg);
          }
        } else showToast(`搜尋發生錯誤：${msg.error}`);
      };
      workerRef.current = w;
    }
    return workerRef.current;
  };

  const runSearch = () => {
    const id = ++searchIdRef.current;
    setHasSearched(true);
    setLoading(true);
    startElapsed();
    const request: BuildSearchRequest = {
      weaponType,
      weaponSearchMode,
      fixedWeaponId:
        weaponSearchMode === "fixed" ? fixedWeaponId || undefined : undefined,
      elementFilter:
        activeElementFilter !== "all" ? activeElementFilter : undefined,
      minDefense: minDefense > 0 ? minDefense : undefined,
      minResistances:
        Object.keys(minResistances).length > 0 ? minResistances : undefined,
      // World：護石走固定候選池（worker 的 world deps），非使用者護石庫；
      // 固定/排除以 fixedCharmId + excludedItems.charmIds 表達（引擎既有能力）。
      charms: isWorld ? [] : useCharms ? charms.map(ownedCharmToCharm) : [],
      fixedParts,
      excludedItems: isWorld
        ? { ...excludedItems, charmIds: worldExcludedCharmIds }
        : excludedItems,
      ...(isWorld && worldFixedCharmId ? { fixedCharmId: worldFixedCharmId } : {}),
      requiredSkills: required,
      excludedSkills,
      reservedSlots,
      searchMode,
      resultLimit,
    };
    lastRequestRef.current = request;
    ensureWorker().postMessage({
      id,
      request,
      augments,
      gameId,
      worldWeaponAugment: activeWeaponAugment,
      wildsWeaponAugment: activeWildsAugment,
    } satisfies SearchWorkerRequest);
  };

  /** 取消搜尋：terminate worker（下次搜尋重建）並復原 UI；序號遞增作廢在途回傳。 */
  const cancelSearch = () => {
    searchIdRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    stopElapsed();
    setLoading(false);
  };

  // 卸載時清理 worker 與計時器。
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (elapsedTimerRef.current != null)
        window.clearInterval(elapsedTimerRef.current);
    },
    []
  );

  // ---- 結果卡片操作 ----
  const fixArmor = (part: ArmorPart, id: string) =>
    setFixedParts((prev) => ({ ...prev, [part]: id }));

  const excludeArmor = (id: string) => {
    const already = excludedItems.armorIds.includes(id);
    setExcludedItems((prev) =>
      prev.armorIds.includes(id)
        ? prev
        : { ...prev, armorIds: [...prev.armorIds, id] }
    );
    // 若該裝備正被固定，一併解除
    setFixedParts((prev) => {
      const next = { ...prev };
      for (const k of ["head", "chest", "arms", "waist", "legs"] as ArmorPart[]) {
        if (next[k] === id) delete next[k];
      }
      return next;
    });
    if (!already) {
      const name = armorById[id]?.nameZh ?? "此裝備";
      showToast(`已排除「${name}」，重新搜尋後生效`);
    }
  };

  const clearFixed = (key: ArmorPart | "weapon") => {
    setFixedParts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === "weapon") {
      setFixedWeaponId("");
      setWeaponSearchMode("search");
    }
  };

  // ---- 武器固定 / 排除（結果卡片操作）----
  const fixWeapon = (id: string) => {
    setWeaponSearchMode("fixed");
    setFixedWeaponId(id);
    setFixedParts((prev) => ({ ...prev, weapon: id }));
  };

  const excludeWeapon = (id: string) => {
    const already = excludedItems.weaponIds.includes(id);
    setExcludedItems((prev) =>
      prev.weaponIds.includes(id)
        ? prev
        : { ...prev, weaponIds: [...prev.weaponIds, id] }
    );
    if (fixedWeaponId === id) {
      clearFixed("weapon");
    }
    if (!already) {
      const name = weaponById[id]?.nameZh ?? "此武器";
      showToast(`已排除「${name}」，重新搜尋後生效`);
    }
  };

  const removeExcluded = (id: string) =>
    setExcludedItems((prev) => ({
      armorIds: prev.armorIds.filter((x) => x !== id),
      weaponIds: prev.weaponIds.filter((x) => x !== id),
    }));

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  // ---- 全部清除（條件區 chip 操作）----
  const clearAllFixed = () => {
    const hadWeapon = !!fixedParts.weapon;
    setFixedParts({});
    if (hadWeapon) {
      setFixedWeaponId("");
      setWeaponSearchMode("search");
    }
  };
  const clearAllExcluded = () =>
    setExcludedItems({ armorIds: [], weaponIds: [] });
  const removeRecoCharm = (id: string) =>
    setCharms(charms.filter((c) => c.id !== id));
  const recoCharms = charms.filter((c) => c.source === "reco");

  // ---- 推薦配裝匯入的套用 ----
  const applyImport = async (payload: BuilderImport) => {
    // 確保資料已載入：lock-armor 需查部位、lock-weapon 需查屬性
    const gd = gameData ?? (await loadGameData(gameId));
    if (!gameData) setGameData(gd);

    // World full-build：走 World 匯入規則（護石對 id 固定、未模擬系統點名；不走 reco 護石）。
    if (payload.kind === "full-build" && payload.gameId === "world") {
      const importedNames = new Set(Object.keys(payload.requiredSkills));
      if (payload.weaponType !== weaponType) {
        setWeaponType(payload.weaponType);
        setElementFilter("all");
      }
      setConditions((prev) => ({
        ...prev,
        requiredSkills: payload.requiredSkills,
        excludedSkills: prev.excludedSkills.filter((s) => !importedNames.has(s)),
      }));
      // 護石：直接對 id 固定（World 資料裝備）。
      setWorldFixedCharmId(payload.fixedCharmId ?? "");
      setImportNotice({
        source: "world",
        importedCount: payload.importedCount,
        totalCount: payload.totalCount,
        unmodeledSystems: payload.unmodeledSystems ?? [],
      });
      setFromCommunityImport(false);
      setConditionsOpen(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
          else asideRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
        })
      );
      return;
    }

    if (payload.kind === "full-build") {
      const importedNames = new Set(Object.keys(payload.requiredSkills));
      // 切到該配裝的武器種類（直接設，不走 changeWeapon 以免副作用清掉匯入的技能）。
      const switchType = payload.weaponType !== weaponType;
      if (switchType) {
        setWeaponType(payload.weaponType);
        setElementFilter("all");
        setFixedWeaponId("");
        setWeaponSearchMode("search");
      }
      setConditions((prev) => {
        const fixedParts = { ...prev.fixedParts };
        if (switchType) delete fixedParts.weapon;
        return {
          ...prev,
          requiredSkills: payload.requiredSkills,
          // 匯入技能若在排除清單中會互斥導致無解，一併移除
          excludedSkills: prev.excludedSkills.filter(
            (s) => !importedNames.has(s)
          ),
          fixedParts,
          // 「以此為基礎修改」＝從這套重新開始：保留使用者自有護石，取代所有舊的推薦來源護石。
          charms: [
            ...prev.charms.filter((c) => c.source !== "reco"),
            ...(payload.charm ? [payload.charm] : []),
          ],
        };
      });
      setImportNotice({
        source: "game8",
        importedCount: payload.importedCount,
        totalCount: payload.totalCount,
        droppedAugment: payload.droppedAugment,
        excludedSpecial: payload.excludedSpecial,
      });
      setFromCommunityImport(false);
    } else if (payload.kind === "community-build") {
      const importedNames = new Set(Object.keys(payload.requiredSkills));
      const switchType =
        !!payload.weaponType && payload.weaponType !== weaponType;
      if (switchType) {
        setWeaponType(payload.weaponType!);
        setElementFilter("all");
        setFixedWeaponId("");
        setWeaponSearchMode("search");
      }
      setConditions((prev) => {
        // 鎖定防具骨架：社群配裝完整定義五防具，先清掉所有防具部位再套用——解析不到的
        // 部位留空（不沿用上一次匯入的舊鎖，否則會與「未鎖定」提示矛盾、靜默多鎖）。
        const fixedParts = { ...prev.fixedParts };
        for (const p of ["head", "chest", "arms", "waist", "legs"] as const)
          delete fixedParts[p];
        Object.assign(fixedParts, payload.fixedArmor);
        if (switchType) delete fixedParts.weapon;
        return {
          ...prev,
          requiredSkills: payload.requiredSkills,
          excludedSkills: prev.excludedSkills.filter(
            (s) => !importedNames.has(s)
          ),
          fixedParts,
          // 比照 full-build：保留自有護石，取代所有舊 reco 護石。
          charms: [
            ...prev.charms.filter((c) => c.source !== "reco"),
            ...(payload.charm ? [payload.charm] : []),
          ],
        };
      });
      setImportNotice({
        source: "community",
        skillCount: payload.skillCount,
        lockedArmorCount: payload.lockedArmorCount,
        totalArmorCount: payload.totalArmorCount,
        excludedSpecial: payload.excludedSpecial,
      });
      setFromCommunityImport(true);
    } else if (payload.kind === "lock-armor") {
      const part = gd.armorById[payload.id]?.part;
      if (part) fixArmor(part, payload.id);
      setImportNotice(null);
      setFromCommunityImport(false);
    } else if (payload.kind === "lock-weapon") {
      if (payload.weaponType !== weaponType) changeWeapon(payload.weaponType);
      fixWeapon(payload.id);
      setImportNotice(null);
      setFromCommunityImport(false);
    }

    // 展開條件區並捲動對齊（不自動搜尋）
    setConditionsOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (typeof window !== "undefined" && window.innerWidth < 1024) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          asideRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
        }
      })
    );
  };

  // 收到 pendingImport → 套用後通知外層清空（同一指令只套一次）。
  useEffect(() => {
    if (!pendingImport) return;
    applyImport(pendingImport);
    onConsumeImport?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport]);

  // 搜尋後條件又被更動 → 標記需重新搜尋（含 B 的鎖定/排除；不自動觸發）。
  useEffect(() => {
    if (hasSearched) setDirtySinceSearch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    conditions,
    reservedSlots,
    minDefense,
    minResistances,
    weaponType,
    weaponSearchMode,
    fixedWeaponId,
    elementFilter,
    searchMode,
    augments,
    worldFixedCharmId,
    worldExcludedCharmIds,
    worldWeaponAugment,
  ]);

  const copySummary = async (summary: string) => {
    try {
      await navigator.clipboard.writeText(summary);
      showToast("已複製配裝摘要");
    } catch {
      showToast("複製失敗，請手動選取");
    }
  };

  // 產生可分享連結：序列化搜尋條件子集（不含護石）到 ?c=，複製到剪貼簿並更新網址列。
  const shareLink = async () => {
    const c = encodeShareState({
      game: gameId,
      conditions,
      weaponType,
      weaponSearchMode,
      fixedWeaponId,
      elementFilter,
      worldWeaponAugment: activeWeaponAugment,
    });
    // 帶 ?game=：開啟者由 page.tsx 先切到對應遊戲，再由該 BuilderView 套用 ?c=。
    const gameQ = isWorld ? "game=world&" : isWilds ? "game=wilds&" : "";
    const query = `?${gameQ}tab=builder&c=${c}`;
    window.history.replaceState(null, "", query);
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("已複製分享連結（不含護石清單）");
    } catch {
      showToast("已更新網址列，請手動複製");
    }
  };

  const toggleInList = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    id: string
  ) =>
    setter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // 手機版：切換條件面板。展開時捲回頂端，否則條件展開在上方但使用者仍停在結果處，等於沒展開。
  const toggleConditions = () => {
    const opening = !conditionsOpen;
    setConditionsOpen(opening);
    if (opening && typeof window !== "undefined" && window.innerWidth < 1024) {
      // 等展開的版面重排完成（double rAF）後再捲到頂，讓條件面板進入視野。
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          window.scrollTo({ top: 0, behavior: "smooth" })
        )
      );
    }
  };

  return (
    <GameIdProvider value={gameId}>
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* ---- 配裝器工具列（App 標題與分頁在外層殼）---- */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-b border-border px-4 py-2.5">
        <div className="w-[260px]">
          <SearchModeSelector value={searchMode} onChange={setSearchMode} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={shareLink}
          className="gap-1.5"
          title="複製包含目前搜尋條件的連結（不含護石清單）"
        >
          <Share2 className="h-4 w-4" />
          分享連結
        </Button>
        {loading ? (
          <>
            <Button size="lg" disabled className="gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              搜尋中…{Math.round(searchElapsed)}ms
            </Button>
            <Button
              size="lg"
              variant="destructive"
              onClick={cancelSearch}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              取消
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            onClick={runSearch}
            disabled={Object.keys(required).length === 0}
            className="gap-2"
          >
            <Search className="h-4 w-4" />
            {dataLoading ? "資料載入中…" : "搜尋配裝"}
          </Button>
        )}
      </div>

      {/* ---- 搜尋條件收合列（全寬度可收合；收合時顯示目前條件摘要）---- */}
      <div className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-background px-4 py-2">
        <button
          ref={toggleRef}
          type="button"
          onClick={toggleConditions}
          className="flex shrink-0 items-center gap-2 text-sm font-medium"
        >
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          搜尋條件
          {conditionsOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              展開修改
              <ChevronDown className="h-4 w-4" />
            </span>
          )}
        </button>
        {!conditionsOpen && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {Object.keys(required).length === 0 ? (
              <span>尚未設定必要技能</span>
            ) : (
              Object.entries(required).map(([n, l]) => (
                <span
                  key={n}
                  className="rounded bg-muted px-1.5 py-0.5 text-foreground"
                >
                  {n} {l}
                </span>
              ))
            )}
            {excludedSkills.length > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                排除 {excludedSkills.length}
              </span>
            )}
            {Object.keys(fixedParts).length > 0 && (
              <span>· 鎖定 {Object.keys(fixedParts).length}</span>
            )}
          </div>
        )}
      </div>

      {/* ---- 主體：條件橫向置頂、結果全寬在下 ---- */}
      <div className="flex flex-1 flex-col lg:min-h-0">
        {/* 條件區：橫向排列、可收合（預設展開）；內容多換行、不橫向卷軸 */}
        <section
          ref={asideRef}
          className={`${
            conditionsOpen ? "flex" : "hidden"
          } shrink-0 flex-col gap-3 border-b border-border p-3 scrollbar-thin lg:max-h-[48vh] lg:overflow-y-auto`}
        >
          {importNotice && (
            <div className="flex items-start justify-between gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              <div className="space-y-0.5">
                {importNotice.source === "game8" && (
                  <p>
                    已從推薦配裝匯入核心技能 {importNotice.importedCount} 項
                    {importNotice.totalCount > importNotice.importedCount && (
                      <span className="text-primary/70">
                        （共 {importNotice.totalCount} 項，其餘為附帶技能未匯入）
                      </span>
                    )}
                    ，請確認後搜尋。
                  </p>
                )}
                {importNotice.source === "world" && (
                  <p>
                    已從推薦配裝匯入核心技能 {importNotice.importedCount} 項
                    {importNotice.totalCount > importNotice.importedCount && (
                      <span className="text-primary/70">
                        （共 {importNotice.totalCount} 項，其餘為附帶技能未匯入）
                      </span>
                    )}
                    ，護石已固定，請確認後搜尋。
                  </p>
                )}
                {importNotice.source === "community" && (
                  <p>
                    已從社群配裝鎖定 {importNotice.lockedArmorCount} 件防具並匯入
                    目標技能 {importNotice.skillCount} 項，孔位珠子將以你的護石計算，
                    請確認後搜尋。
                  </p>
                )}
                {importNotice.source === "community" &&
                  importNotice.lockedArmorCount < importNotice.totalArmorCount && (
                    <p className="text-amber-400">
                      {importNotice.totalArmorCount - importNotice.lockedArmorCount}{" "}
                      件防具無法解析為專案資料，未鎖定（其餘部位維持空白）。
                    </p>
                  )}
                {importNotice.source === "game8" && importNotice.droppedAugment && (
                  <p className="text-amber-400">已排除傀異錬成加成的等級。</p>
                )}
                {(importNotice.source === "game8" || importNotice.source === "community") &&
                  importNotice.excludedSpecial.length > 0 && (
                    <p className="text-amber-400">
                      已略過 {importNotice.excludedSpecial.slice(0, 3).join("、")}
                      {importNotice.excludedSpecial.length > 3
                        ? `等 ${importNotice.excludedSpecial.length} 項`
                        : ""}
                      錬成／狂竜化衍生技能（無法以基礎裝備重現）。
                    </p>
                  )}
                {importNotice.source === "world" && importNotice.unmodeledSystems.length > 0 && (
                  <p className="text-amber-400">
                    ⚠ 原配裝依賴 {importNotice.unmodeledSystems.join("、")}，引擎不模擬——
                    已略過其能力，搜尋結果 EFR 會低於 Game8 實際值。
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                className="shrink-0 text-primary/70 hover:text-primary"
                title="關閉提示"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-start gap-3">
            {/* 武器 */}
            <Card className="min-w-[260px] flex-1">
              <CardContent className="space-y-3 p-3">
                <WeaponSelector
                  weaponTypes={weaponTypes}
                  value={weaponType}
                  onChange={changeWeapon}
                />
                <WeaponPicker
                  weapons={typeWeapons}
                  loading={!gameData}
                  mode={weaponSearchMode}
                  onModeChange={changeWeaponSearchMode}
                  fixedWeaponId={fixedWeaponId}
                  onPickWeapon={pickWeapon}
                  enableElementFilter={elementFilterEnabled}
                  elementFilter={activeElementFilter}
                  onElementFilterChange={changeElementFilter}
                  groupBySource
                />
                {/* World 武器強化「簡化輸入」：僅固定武器模式且已選武器時顯示。 */}
                {isWorld &&
                  weaponSearchMode === "fixed" &&
                  !!fixedWeaponId &&
                  weaponById[fixedWeaponId] && (
                    <WorldWeaponAugmentPanel
                      augment={worldWeaponAugment}
                      onChange={setWorldWeaponAugment}
                      setBonuses={gameStatic?.setBonuses ?? []}
                      weaponHasElement={
                        !!weaponById[fixedWeaponId].element &&
                        (weaponById[fixedWeaponId].element?.value ?? 0) > 0
                      }
                    />
                  )}
                {/* Wilds Artian 簡化輸入：復用強化面板，無 set bonus（Artian 是武器→武器珠池）。 */}
                {isWilds &&
                  weaponSearchMode === "fixed" &&
                  !!fixedWeaponId &&
                  weaponById[fixedWeaponId] && (
                    <WorldWeaponAugmentPanel
                      augment={worldWeaponAugment}
                      onChange={setWorldWeaponAugment}
                      setBonuses={[]}
                      showSetBonus={false}
                      title="Artian 武器強化（隨機強化，輸入結果值）"
                      weaponHasElement={
                        !!weaponById[fixedWeaponId].element &&
                        (weaponById[fixedWeaponId].element?.value ?? 0) > 0
                      }
                    />
                  )}
              </CardContent>
            </Card>

            {/* 技能｜護石｜鎖定：單一 tab 面板 */}
            <Card className="min-w-[280px] flex-[1.6]">
              <CardContent className="p-3">
                <Tabs defaultValue="skills">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="skills">技能</TabsTrigger>
                    <TabsTrigger value="charms">護石</TabsTrigger>
                    <TabsTrigger value="locks">鎖定</TabsTrigger>
                  </TabsList>

                  <TabsContent value="skills" className="pt-2">
                    <SkillRequirementEditor
                      required={required}
                      excluded={excludedSkills}
                      onChangeRequired={setRequired}
                      onChangeExcluded={setExcludedSkills}
                      allSkills={allSkills}
                    />
                  </TabsContent>

                  <TabsContent value="charms" className="space-y-4 pt-2">
                    {isWilds && (
                      <p className="rounded-md bg-muted/60 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        Wilds 護石為<b>混合制</b>：可生產護石已<b>自動</b>納入候選池，此處輸入
                        <b>鑑定（RNG）護石</b>（稀有度 5–8、最多 3 技能）。
                        <span className="opacity-80">登錄時可為每個洞位指定武器珠池／防具珠池。</span>
                      </p>
                    )}
                    {profile?.charmMode === "craftable-list" ? (
                      // World：固定可生產護石清單（資料選單，可固定/排除）。
                      <WorldCharmPanel
                        charms={worldCharmPool}
                        fixedCharmId={worldFixedCharmId}
                        excludedCharmIds={worldExcludedCharmIds}
                        onChangeFixed={setWorldFixedCharmId}
                        onChangeExcluded={setWorldExcludedCharmIds}
                      />
                    ) : (
                      // Rise：使用者護石庫（自由登錄）。
                      <CharmListPanel
                        charms={charms}
                        useCharms={useCharms}
                        onChangeCharms={setCharms}
                        onChangeUseCharms={setUseCharms}
                        allSkills={allSkills}
                        wildsMode={isWilds}
                      />
                    )}
                    {/* 傀異鍊成：Rise 專屬（profile.features.qurioAugment）；World 隱藏。 */}
                    {profile?.features.qurioAugment && (
                      <div className="space-y-1.5 border-t border-border pt-3">
                        <Label className="text-xs text-muted-foreground">
                          傀異鍊成（自訂防具）
                        </Label>
                        <AugmentedArmorEditor
                          allArmors={allArmors}
                          allSkills={allSkills}
                          augments={augments}
                          onAdd={(p) => setAugments((prev) => [...prev, p])}
                          onRemove={(id) =>
                            setAugments((prev) => prev.filter((a) => a.id !== id))
                          }
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="locks" className="space-y-4 pt-2">
                    <ArmorLockPanel
                      allArmors={allArmors}
                      loading={!gameData}
                      fixedParts={fixedParts}
                      onFix={fixArmor}
                      onClear={clearFixed}
                    />
                    <div className="border-t border-border pt-3">
                      <FixedPartsPanel
                        fixedParts={fixedParts}
                        excludedItems={excludedItems}
                        recoCharms={recoCharms}
                        armorById={armorById}
                        weaponById={weaponById}
                        onClearFixed={clearFixed}
                        onRemoveExcluded={removeExcluded}
                        onClearAllFixed={clearAllFixed}
                        onClearAllExcluded={clearAllExcluded}
                        onRemoveRecoCharm={removeRecoCharm}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* 進階限制：保留洞位 + 防禦／屬性耐性 */}
            <Card className="min-w-[240px] flex-1">
              <CardContent className="space-y-4 p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    保留洞位
                  </Label>
                  <ReservedSlotsInput
                    value={reservedSlots}
                    onChange={setReservedSlots}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    防禦 / 屬性耐性
                  </Label>
                  <DefenseResInput
                    minDefense={minDefense}
                    minResistances={minResistances}
                    onChangeMinDefense={setMinDefense}
                    onChangeMinResistances={setMinResistances}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 右側結果 */}
        <main className="flex flex-1 flex-col lg:min-h-0">
          {/* 結果工具列 */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">搜尋結果</span>
              {meta && (
                <span className="text-xs text-muted-foreground">
                  顯示前 {results.length} 套 · 有效組合 {meta.validBuilds} ·
                  評估 {meta.combosEvaluated} 組 · {Math.round(meta.elapsedMs)}ms
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Label className="text-[11px] text-muted-foreground">
                  排序
                </Label>
                {SORT_OPTIONS.map((o) => (
                  <Button
                    key={o.key}
                    variant={sortKey === o.key ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSortKey(o.key)}
                    title={o.hint}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              {(favorites.length > 0 || compared.length > 0) && (
                <span className="text-xs text-muted-foreground">
                  收藏 {favorites.length} · 比較 {compared.length}
                </span>
              )}
              <Label className="text-[11px] text-muted-foreground">
                顯示上限
              </Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={resultLimit}
                onChange={(e) =>
                  setResultLimit(
                    Math.max(1, Math.min(100, Number(e.target.value) || 1))
                  )
                }
                className="h-7 w-16 font-mono"
              />
            </div>
          </div>

          {/* 結果列表 */}
          <div className="flex-1 p-4 scrollbar-thin lg:min-h-0 lg:overflow-y-auto">
            {sharedNotice && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
                <span>此連結包含搜尋條件，將以你自己的護石清單計算。</span>
                <button
                  type="button"
                  onClick={() => setSharedNotice(false)}
                  className="shrink-0 text-sky-200/70 hover:text-sky-100"
                >
                  關閉
                </button>
              </div>
            )}
            {dirtySinceSearch && hasSearched && !loading && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  條件已變更，目前結果為上次搜尋所得。
                </span>
                <Button
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-xs"
                  onClick={runSearch}
                  disabled={loading || Object.keys(required).length === 0}
                >
                  <Search className="h-3.5 w-3.5" />
                  重新搜尋
                </Button>
              </div>
            )}
            {searchMode === "exact" && !loading && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                完整搜尋會枚舉所有裝備，組合數量大時可能較慢。
              </div>
            )}
            {searchMode === "greedy" && !loading && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                推薦模式速度最快，優先補足必要技能，但結果可能不是最佳解。
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">
                  搜尋配裝中…{" "}
                  <span className="font-mono">{Math.round(searchElapsed)}ms</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelSearch}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  取消搜尋
                </Button>
              </div>
            ) : !hasSearched ? (
              <EmptyState
                icon="swords"
                title="尚未搜尋配裝"
                description={`你可以先完成：
1. 選擇武器（固定一把，或從同類型武器中搜尋）
2. 選擇必要技能與排除技能
3. 到「護石」頁登錄你的護石
4. 視需要固定部位或排除裝備
5. 按下搜尋配裝

搜尋後會顯示前 100 套符合硬條件的配裝，預設依 EFR 排序。`}
              />
            ) : results.length === 0 ? (
              <EmptyState
                title="找不到符合條件的配裝"
                description={
                  fromCommunityImport
                    ? "以目前護石無法達成全部目標技能，可嘗試解除部分防具鎖定或調降技能等級。"
                    : "試著放寬必要技能、減少保留洞位，或解除部分固定／排除設定。"
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {sortedResults.map((r, i) => (
                  <BuildResultCard
                    key={r.id}
                    result={r}
                    rank={i + 1}
                    weaponSlotsLabel="—"
                    requiredSkills={required}
                    fixedParts={fixedParts}
                    excludedIds={excludedIds}
                    isFavorite={favorites.includes(r.id)}
                    isCompared={compared.includes(r.id)}
                    onFixArmor={fixArmor}
                    onExcludeArmor={excludeArmor}
                    onFixWeapon={fixWeapon}
                    onExcludeWeapon={excludeWeapon}
                    onCopy={copySummary}
                    onToggleFavorite={(id) => toggleInList(setFavorites, id)}
                    onToggleCompare={(id) => toggleInList(setCompared, id)}
                    weaponTypes={weaponTypes}
                    decorationsBySkill={gameStatic?.decorationsBySkill}
                    skillMax={gameStatic?.skillMax}
                    world={worldResultInfo}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
    </GameIdProvider>
  );
}
