"use client";

import { useEffect, useState, type ReactNode } from "react";
import { weaponTypes } from "@/lib/data";
import {
  CATEGORY_LABELS,
  STAGE_CATEGORY_ORDER,
  WORLD_STAGE_CATEGORY_ORDER,
  WILDS_STAGE_CATEGORY_ORDER,
  createNameResolver,
  createWorldNameResolver,
  createWildsNameResolver,
  loadRecommendedBuilds,
  loadWorldRecommendedBuilds,
  loadWildsRecommendedBuilds,
  type NameResolver,
  type WorldNameResolver,
  type RecommendedIndex,
} from "@/lib/recommended-builds";
import {
  loadCommunityBuilds,
  type CommunityIndex,
} from "@/lib/community-builds";
import { useLocalStorage } from "@/lib/use-local-storage";
import type { GameId } from "@/types/build";
import type { RecommendedBuild, RecommendedCategory } from "@/types/recommended";
import {
  buildWorldFullBuildImport,
  WILDS_CORE_SKILL_COUNT,
  type BuilderImport,
} from "@/lib/builder-import";
import { GameIdProvider } from "@/lib/game-context";
import { WeaponIcon } from "@/components/EquipmentIcon";
import { BuildCard } from "./BuildCard";
import { SimpleBuildCard } from "./SimpleBuildCard";
import { CommunityBuildCard } from "./CommunityBuildCard";
import { WorldBuildCard } from "./WorldBuildCard";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Loader2, Swords, Users } from "lucide-react";

/** Rise 手風琴分區順序：五階段 + 推薦武器一覽收尾。 */
const RISE_SECTION_ORDER: RecommendedCategory[] = [
  ...STAGE_CATEGORY_ORDER,
  "weaponRecommend",
];

/** 依 kind 分派卡片版型。 */
function BuildCardDispatch({
  build,
  resolver,
  onExport,
}: {
  build: RecommendedBuild;
  resolver: NameResolver;
  onExport: (payload: BuilderImport) => void;
}) {
  if (build.kind === "full-build") {
    return <BuildCard build={build} resolver={resolver} onExport={onExport} />;
  }
  return (
    <SimpleBuildCard build={build} resolver={resolver} onExport={onExport} />
  );
}

/**
 * 一個可收合分區（手風琴一員）：標題列（名稱 + 筆數 + chevron）+ 展開時的卡片網格。
 * 五階段與推薦武器一覽共用此版型；收合時不掛載卡片（30~40 張卡的頁面實質省渲染）。
 */
function StageSection({
  title,
  count,
  open,
  onToggle,
  icon,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  /** 展開時的內容（卡片網格）。 */
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-bold"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            ({count})
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{children}</div>
      )}
    </section>
  );
}

export function RecommendedView({
  gameId = "rise",
  onExport,
}: {
  gameId?: GameId;
  onExport: (payload: BuilderImport) => void;
}) {
  const isWorld = gameId === "world";
  const isWilds = gameId === "wilds";
  // World 與 Wilds schema 相同（charm/buildDecorations/skillTotals/WorldBuildCard），共用「world-like」路徑。
  const isWorldLike = isWorld || isWilds;
  const prefix = isWilds ? "mhwd." : isWorld ? "mhwib." : "mhsb.";
  const [index, setIndex] = useState<RecommendedIndex | null>(null);
  const [resolver, setResolver] = useState<NameResolver | null>(null);
  const [worldResolver, setWorldResolver] = useState<WorldNameResolver | null>(null);
  const [community, setCommunity] = useState<CommunityIndex | null>(null);
  // World 匯入所需 context（profile.resolveSkillMax + setBonusById + armorById）。
  const [worldImportCtx, setWorldImportCtx] = useState<{
    resolveSkillMax: (s: string, a: Record<string, number>) => number;
    setBonusById: Record<string, { ranks: { pieces: number; skillName: string; skillLevel: number }[] }>;
    armorById: Record<string, { setBonusId?: string }>;
  } | null>(null);
  // 選定的武器種類（persist；空字串＝尚未選）。
  const [weaponType, setWeaponType] = useLocalStorage(`${prefix}recoWeaponType`, "");
  // 展開過的分區（全域記憶、不分武器；預設全收合）。存 category 值陣列。
  const [openStages, setOpenStages] = useLocalStorage<string[]>(
    `${prefix}recoStagesOpen`,
    []
  );

  useEffect(() => {
    let alive = true;
    if (isWorldLike) {
      const loadBuilds = isWilds ? loadWildsRecommendedBuilds : loadWorldRecommendedBuilds;
      const makeResolver = isWilds ? createWildsNameResolver : createWorldNameResolver;
      Promise.all([loadBuilds(), makeResolver()]).then(([idx, res]) => {
        if (!alive) return;
        setIndex(idx);
        setWorldResolver(res);
      });
      // 匯入 context（動態 import 對應 registry，維持 lazy）。Wilds resolveSkillMax 為靜態上限。
      (async () => {
        const { getGameProfile } = await import("@/lib/game-profile");
        const { loadGameData } = await import("@/lib/game-data");
        if (isWilds) {
          const { ensureWildsRegistered } = await import("@/lib/wilds-registry");
          const ws = await ensureWildsRegistered();
          const profile = getGameProfile("wilds");
          const gd = await loadGameData("wilds");
          if (!alive) return;
          setWorldImportCtx({
            resolveSkillMax: profile.resolveSkillMax,
            setBonusById: ws.setBonusById as never,
            armorById: gd.armorById as never,
          });
        } else {
          const { ensureWorldRegistered } = await import("@/lib/world-registry");
          const ws = await ensureWorldRegistered();
          const profile = getGameProfile("world");
          const gd = await loadGameData("world");
          if (!alive) return;
          setWorldImportCtx({
            resolveSkillMax: profile.resolveSkillMax,
            setBonusById: ws.setBonusById as never,
            armorById: gd.armorById as never,
          });
        }
      })();
      return () => {
        alive = false;
      };
    }
    Promise.all([loadRecommendedBuilds(), createNameResolver()]).then(
      ([idx, res]) => {
        if (!alive) return;
        setIndex(idx);
        setResolver(res);
      }
    );
    // 社群配裝獨立載入（失敗不影響 Game8 分區）。Rise 專屬。
    loadCommunityBuilds().then((c) => {
      if (alive) setCommunity(c);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  /** World/Wilds「以此為基礎修改」：算該套 set bonus 動態上限（Wilds 為靜態，active 被忽略），
   *  走 buildWorldFullBuildImport（gameId 與 N 依遊戲）。 */
  const useWorldBuild = (build: RecommendedBuild) => {
    if (!worldImportCtx) return;
    const { resolveSkillMax, setBonusById, armorById } = worldImportCtx;
    const counts: Record<string, number> = {};
    for (const a of build.armor ?? []) {
      const ar = a.id ? armorById[a.id] : undefined;
      if (ar?.setBonusId) counts[ar.setBonusId] = (counts[ar.setBonusId] ?? 0) + 1;
    }
    const active: Record<string, number> = {};
    for (const [id, cnt] of Object.entries(counts)) {
      const sb = setBonusById[id];
      if (!sb) continue;
      for (const r of sb.ranks) if (cnt >= r.pieces) active[r.skillName] = (active[r.skillName] ?? 0) + r.skillLevel;
    }
    const n = isWilds ? WILDS_CORE_SKILL_COUNT : undefined;
    onExport(buildWorldFullBuildImport(build, (name) => resolveSkillMax(name, active), n, gameId));
  };

  const isOpen = (cat: string) => openStages.includes(cat);
  const toggleStage = (cat: string) =>
    setOpenStages((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const byCat = weaponType ? index?.byWeaponType.get(weaponType) : undefined;
  const sectionOrder = isWilds ? WILDS_STAGE_CATEGORY_ORDER : isWorld ? WORLD_STAGE_CATEGORY_ORDER : RISE_SECTION_ORDER;
  const sections = sectionOrder
    .map((cat) => ({ cat, builds: byCat?.get(cat) ?? [] }))
    .filter((s) => s.builds.length > 0);

  // 社群配裝：Rise 專屬（World 無）。
  const communityBuilds =
    !isWorldLike && weaponType
      ? [
          ...(community?.byWeaponType.get(weaponType) ?? []),
          ...(community?.unbound ?? []),
        ]
      : [];

  // 資料就緒判定：rise 看 resolver、world 看 worldResolver。
  const ready = isWorldLike ? !!worldResolver && !!index : !!resolver && !!index;
  // community 只在 rise 有意義；world 直接視為「已載入」以免卡零結果分支。
  const communityLoaded = isWorldLike ? true : community !== null;

  return (
    <GameIdProvider value={gameId}>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
        {/* 武器種類網格選擇 */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            選擇武器種類
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {weaponTypes.map((wt) => {
              const active = wt.id === weaponType;
              return (
                <button
                  key={wt.id}
                  type="button"
                  onClick={() => setWeaponType(wt.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors",
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                  aria-pressed={active}
                >
                  <WeaponIcon type={wt.id} className="h-7 w-7" />
                  <span className="text-[11px] leading-tight">{wt.nameZh}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 內容 */}
        {!ready ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm">載入推薦配裝資料…</p>
          </div>
        ) : !weaponType ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
            <Swords className="h-8 w-8 text-primary/60" />
            <p className="text-sm">選擇上方武器種類以檢視各階段推薦配裝</p>
          </div>
        ) : sections.length === 0 &&
          communityBuilds.length === 0 &&
          communityLoaded ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            此武器種類尚無推薦配裝資料。
          </p>
        ) : (
          <>
            {/* 分區手風琴 */}
            <div className="space-y-4">
              {sections.map(({ cat, builds }) => (
                <StageSection
                  key={cat}
                  title={CATEGORY_LABELS[cat]}
                  count={builds.length}
                  open={isOpen(cat)}
                  onToggle={() => toggleStage(cat)}
                >
                  {builds.map((b) =>
                    isWorldLike ? (
                      <WorldBuildCard
                        key={b.id}
                        build={b}
                        resolver={worldResolver!}
                        onUse={useWorldBuild}
                      />
                    ) : (
                      <BuildCardDispatch
                        key={b.id}
                        build={b}
                        resolver={resolver!}
                        onExport={onExport}
                      />
                    )
                  )}
                </StageSection>
              ))}

              {/* 第六分區：社群配裝（獨立於五階段＋推薦武器）。 */}
              {communityBuilds.length > 0 && (
                <StageSection
                  title="社群配裝"
                  icon={<Users className="h-4 w-4 text-primary" />}
                  count={communityBuilds.length}
                  open={isOpen("community")}
                  onToggle={() => toggleStage("community")}
                >
                  {communityBuilds.map((b) => (
                    <CommunityBuildCard
                      key={b.raw.slug}
                      build={b}
                      onExport={onExport}
                    />
                  ))}
                </StageSection>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </GameIdProvider>
  );
}
