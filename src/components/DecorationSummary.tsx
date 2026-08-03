"use client";

import type { DecorationAssignment, DecorationPool } from "@/types/build";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  decorations: DecorationAssignment[];
  /**
   * Wilds 珠雙池：decorationId → 池別（weapon | armor）。提供時按池分組顯示（武器珠/防具珠）。
   * 未提供（Rise/World）時攤平顯示，DOM 與改動前逐一致（零變化）。
   */
  poolByDecoId?: Record<string, DecorationPool>;
};

const POOL_LABEL: Record<DecorationPool, string> = { weapon: "武器珠", armor: "防具珠" };
// 池別視覺區分（邊框色）：武器珠 琥珀、防具珠 天藍。
const POOL_CLASS: Record<DecorationPool, string> = {
  weapon: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  armor: "border-sky-500/50 text-sky-600 dark:text-sky-400",
};

type Agg = { name: string; count: number; slotLevel: number; pool?: DecorationPool };

function aggregate(decorations: DecorationAssignment[], poolByDecoId?: Record<string, DecorationPool>) {
  const m = new Map<string, Agg>();
  for (const d of decorations) {
    const cur = m.get(d.decorationName);
    if (cur) cur.count += 1;
    else m.set(d.decorationName, {
      name: d.decorationName,
      count: 1,
      slotLevel: d.slotLevel,
      pool: poolByDecoId?.[d.decorationId],
    });
  }
  return [...m.values()];
}

function DecoBadge({ agg, pool }: { agg: Agg; pool?: DecorationPool }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 px-2 py-0.5 text-[13px] font-normal", pool && POOL_CLASS[pool])}
    >
      <span className="font-mono text-[11px] text-muted-foreground">[{agg.slotLevel}]</span>
      <span>{agg.name}</span>
      {agg.count > 1 && <span className="text-primary">×{agg.count}</span>}
    </Badge>
  );
}

/** 彙整珠子（同名合併計數）並顯示放入的洞等級；Wilds 另按珠雙池分組。 */
export function DecorationSummary({ decorations, poolByDecoId }: Props) {
  if (decorations.length === 0) {
    return <span className="text-xs text-muted-foreground">未使用裝飾珠</span>;
  }
  const aggs = aggregate(decorations, poolByDecoId);

  // Rise/World（無 pool）：攤平顯示，行為不變。
  if (!poolByDecoId) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {aggs.map((a) => (
          <DecoBadge key={a.name} agg={a} />
        ))}
      </div>
    );
  }

  // Wilds：按池分組（武器珠 / 防具珠 / 未知）。
  const groups: { pool: DecorationPool | "unknown"; items: Agg[] }[] = [
    { pool: "weapon", items: aggs.filter((a) => a.pool === "weapon") },
    { pool: "armor", items: aggs.filter((a) => a.pool === "armor") },
    { pool: "unknown", items: aggs.filter((a) => !a.pool) },
  ];
  return (
    <div className="space-y-1.5">
      {groups.map(({ pool, items }) =>
        items.length === 0 ? null : (
          <div key={pool} className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium",
                pool === "weapon" && "text-amber-600 dark:text-amber-400",
                pool === "armor" && "text-sky-600 dark:text-sky-400",
                pool === "unknown" && "text-muted-foreground"
              )}
            >
              {pool === "unknown" ? "其他" : POOL_LABEL[pool]}
            </span>
            {items.map((a) => (
              <DecoBadge key={a.name} agg={a} pool={pool === "unknown" ? undefined : pool} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
