"use client";

import { useEffect, useState } from "react";
import { RecommendedView } from "@/components/recommended/RecommendedView";
import { BuilderView } from "@/components/builder/BuilderView";
import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { builderHasConditions, type BuilderImport } from "@/lib/builder-import";
import type { GameId } from "@/types/build";

/**
 * 雙遊戲 × 雙 Tab 殼：遊戲（破曉 / Iceborne）與分頁（推薦配裝 / 配裝器）。
 *
 * - 遊戲反映在 URL 的 ?game=（world 才寫；rise 省略＝預設）。切換以 key=game 重掛載
 *   BuilderView，讓兩款遊戲的元件狀態與 localStorage（mhsb. / mhwib.）互不污染、
 *   各自由存檔還原（互不遺失）。
 * - 分頁反映在 ?tab=（pushState/popstate/重整還原，沿用既有機制）。**推薦配裝為 Rise 專屬**
 *   （World 推薦配裝為 Phase 6，本次不做），故 World 只有配裝器、不顯示分頁。
 * - 不使用 useSearchParams（避開 App Router 的 Suspense/預渲染限制），不引入新套件。
 */

type Tab = "recommend" | "builder";

const TABS: { key: Tab; label: string }[] = [
  { key: "recommend", label: "推薦配裝" },
  { key: "builder", label: "配裝器" },
];

const GAMES: { key: GameId; label: string }[] = [
  { key: "rise", label: "破曉" },
  { key: "world", label: "Iceborne" },
  { key: "wilds", label: "Wilds" },
];

/** 各遊戲可用分頁：Wilds 推薦配裝為 Phase 6，本輪只有配裝器（推薦 tab 不出現）。 */
function tabsForGame(game: GameId): typeof TABS {
  return game === "wilds" ? TABS.filter((t) => t.key === "builder") : TABS;
}

const GAME_TITLE: Record<GameId, string> = {
  rise: "魔物獵人 Rise：破曉配裝",
  world: "魔物獵人 World：Iceborne 配裝",
  // Wilds：Phase 1 僅為 GameId 型別完整所需（未列入 GAMES 切換、URL parser 不解析 'wilds'，
  // 故此標題永不顯示）；真正 UI 於 Phase 5。
  wilds: "魔物獵人 Wilds 配裝",
};

export default function Home() {
  const [game, setGame] = useState<GameId>("rise");
  const [tab, setTabState] = useState<Tab>("recommend");
  // 配裝器首次被選到才掛載，之後保留於 DOM（hidden）以留住狀態。World 恆掛載（無分頁）。
  const [builderMounted, setBuilderMounted] = useState(false);
  // 推薦配裝→配裝器的待套用匯入指令；BuilderView 套用後回呼清空。（Rise 專屬）
  const [pendingImport, setPendingImport] = useState<BuilderImport | null>(null);

  // 初始化與 popstate（上一頁/分享連結）同步：由 URL ?game= / ?tab= 決定。
  useEffect(() => {
    const apply = () => {
      const p = new URLSearchParams(window.location.search);
      const gp = p.get("game");
      const g: GameId = gp === "world" ? "world" : gp === "wilds" ? "wilds" : "rise";
      // 推薦配裝 + 配裝器分頁；Wilds 無推薦 tab（Phase 6）→ 恆 builder。
      const t: Tab =
        g === "wilds" || p.get("tab") === "builder" ? "builder" : "recommend";
      setGame(g);
      setTabState(t);
      if (t === "builder") setBuilderMounted(true);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  const writeUrl = (g: GameId, t: Tab) => {
    const params = new URLSearchParams(window.location.search);
    if (g === "world" || g === "wilds") params.set("game", g);
    else params.delete("game");
    params.set("tab", t);
    // replace（非 push）：切換不堆歷史，返回鍵直接離站而非在狀態間彈跳。
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const selectGame = (g: GameId) => {
    if (g === game) return;
    // Wilds 無推薦 tab（Phase 6）→ 切到 wilds 時強制 builder。
    const nextTab: Tab = g === "wilds" ? "builder" : tab;
    setGame(g);
    setTabState(nextTab);
    if (nextTab === "builder") setBuilderMounted(true);
    writeUrl(g, nextTab);
  };

  const selectTab = (t: Tab) => {
    setTabState(t);
    if (t === "builder") setBuilderMounted(true);
    writeUrl(game, t);
  };

  /**
   * 推薦配裝卡片觸發的匯出：切到配裝器並交付匯入指令（不自動搜尋）。兩款遊戲共用。
   */
  const exportToBuilder = (payload: BuilderImport) => {
    if (
      (payload.kind === "full-build" || payload.kind === "community-build") &&
      builderHasConditions(game)
    ) {
      const ok = window.confirm(
        "配裝器已有搜尋條件，要以此推薦配裝覆蓋必要技能嗎？（你的護石清單會保留）"
      );
      if (!ok) return;
    }
    setBuilderMounted(true);
    setPendingImport(payload);
    selectTab("builder");
  };

  const showBuilder = builderMounted;
  const builderVisible = tab === "builder";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background lg:h-screen">
      {/* ---- 全域頂部列：品牌 + 遊戲切換 + 分頁 ---- */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <Swords className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-base font-bold leading-tight">{GAME_TITLE[game]}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 遊戲切換 */}
          <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="遊戲">
            {GAMES.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => selectGame(g.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  game === g.key
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={game === g.key}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* 分頁（Wilds 只有配裝器；推薦配裝為 Phase 6，本輪不出現） */}
          <div className="inline-flex rounded-lg bg-muted p-1">
            {tabsForGame(game).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-background text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={tab === t.key}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---- 內容 ---- */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 推薦配裝：key=game 重掛載（per-game 資料源），以 hidden 切換。
            Wilds 無推薦配裝（Phase 6）→ 不渲染 RecommendedView（避免載入不存在的 wilds 推薦資料）。 */}
        {game !== "wilds" && (
          <div
            className={cn(
              tab === "recommend" ? "flex min-h-0 flex-1 flex-col" : "hidden"
            )}
          >
            <RecommendedView key={game} gameId={game} onExport={exportToBuilder} />
          </div>
        )}
        {/* 配裝器：key=game 重掛載，per-game 狀態互不污染 */}
        {showBuilder && (
          <div
            className={cn(builderVisible ? "flex min-h-0 flex-1 flex-col" : "hidden")}
          >
            <BuilderView
              key={game}
              gameId={game}
              pendingImport={pendingImport}
              onConsumeImport={() => setPendingImport(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
