"use client";

import type { RecommendedBuild } from "@/types/recommended";
import type { WorldNameResolver } from "@/lib/recommended-builds";
import { WORLD_UNMODELED_LABELS } from "@/lib/builder-import";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WeaponIcon, ArmorIcon } from "@/components/EquipmentIcon";
import { AlertTriangle, ExternalLink, Gem, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const ARMOR_SLOTS = ["head", "chest", "arms", "waist", "legs"] as const;

/**
 * World 推薦配裝卡（Phase 6）。比 Rise BuildCard 精簡：無百龍/獵蟲/傀異；護石為資料裝備、
 * 顯示 set bonus 觸發（由防具帶出）與**未模擬系統旗標**（含覺醒/Kjarr/客製強化時明顯標示
 * 「匯入時將略過其能力」）。「以此為基礎修改」走 World 匯入規則（onUse）。
 */
export function WorldBuildCard({
  build,
  resolver,
  onUse,
}: {
  build: RecommendedBuild;
  resolver: WorldNameResolver;
  onUse: (build: RecommendedBuild) => void;
}) {
  const weapon = build.weapons?.[0];
  const armorBySlot = new Map((build.armor ?? []).map((a) => [a.slot, a]));
  const unmodeled = Object.entries(build.unmodeled ?? {})
    .filter(([, on]) => on)
    .map(([k]) => WORLD_UNMODELED_LABELS[k] ?? k);
  const skillRows = (build.skillTotals ?? []).filter((s) => s.id);

  // 顯示名走 id→zh-Hant；對不上時 fallback 原名（World=rawNameEn／Wilds 尾巴 W-F=rawNameJa）。
  const renderDecos = (decos?: { id?: string; rawNameEn?: string; rawNameJa?: string; count?: number }[]) => {
    if (!decos || decos.length === 0) return null;
    return (
      <div className="truncate text-[11px] text-muted-foreground">
        {decos
          .map((d) => {
            const r = resolver.deco(d.id, d.rawNameJa ?? d.rawNameEn);
            return `${r.name}${d.count && d.count > 1 ? `×${d.count}` : ""}`;
          })
          .join("・")}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 border-b bg-muted/30 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-bold">{build.buildName}</div>
            {build.metaVersion && (
              <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px] font-normal">
                Ver {build.metaVersion}
              </Badge>
            )}
          </div>
          <a
            href={build.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          >
            Game8 出處 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => onUse(build)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          以此為基礎修改
        </Button>
      </CardHeader>

      <CardContent className="space-y-2.5 p-3">
        {/* 未模擬系統旗標 */}
        {unmodeled.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              此配裝依賴 <b>{unmodeled.join("、")}</b>，引擎不模擬——匯入時將略過其能力，
              搜尋結果的 EFR 會低於 Game8 實際值。
            </span>
          </div>
        )}

        {/* 武器 */}
        <div className="flex items-center gap-2">
          {weapon && <WeaponIcon type={build.weaponType} className="h-7 w-7 text-foreground/80" title="武器" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px]">
              {resolver.weapon(weapon?.id, weapon?.rawNameJa ?? weapon?.rawNameEn).name}
            </div>
            {renderDecos(weapon?.decorations)}
          </div>
        </div>

        {/* 5 防具 */}
        <div className="divide-y divide-border/50">
          {ARMOR_SLOTS.map((slot) => {
            const a = armorBySlot.get(slot);
            if (!a) return null;
            const r = resolver.armor(a.id, a.rawNameJa ?? a.rawNameEn);
            return (
              <div key={slot} className="flex items-center gap-2 py-1">
                <ArmorIcon part={slot} className="h-6 w-6" />
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-[13px]", !r.resolved && "text-amber-300")}>
                    {r.name}
                  </div>
                  {renderDecos(a.decorations)}
                </div>
              </div>
            );
          })}
          {/* 護石 */}
          <div className="flex items-center gap-2 py-1">
            <Badge variant="secondary" className="w-11 shrink-0 justify-center px-1 py-0 text-[11px]">
              護石
            </Badge>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {build.charm ? resolver.charm(build.charm.id, build.charm.rawNameJa ?? build.charm.rawNameEn).name : "無"}
            </span>
          </div>
        </div>

        {/* 防具珠總表（Wilds：珠不逐部位標，統一列此，同 Rise buildDecorations 慣例）。 */}
        {build.buildDecorations && build.buildDecorations.length > 0 && (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Gem className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              防具珠：
              {build.buildDecorations
                .map((d) => {
                  const r = resolver.deco(d.id, d.rawNameJa ?? d.rawNameEn);
                  return `${r.name}${d.count && d.count > 1 ? `×${d.count}` : ""}`;
                })
                .join("・")}
            </span>
          </div>
        )}

        <Separator />

        {/* 技能總表 */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Gem className="h-3.5 w-3.5" /> 技能（Game8 宣稱總表）
          </div>
          <div className="flex flex-wrap gap-1">
            {skillRows.map((s, i) => (
              <Badge key={s.id! + i} variant="outline" className="px-1.5 py-0 text-[11px]">
                {s.id} {s.level}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
