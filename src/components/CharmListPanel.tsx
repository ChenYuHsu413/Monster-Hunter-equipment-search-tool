"use client";

import { useState } from "react";
import type { Skill } from "@/types/build";
import { ownedCharmLabel, type OwnedCharm } from "@/lib/search-conditions";
import { parseSlotString } from "@/lib/slot-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** 護石洞數所有組合（3 洞，各 0~4 級，非遞增），例如 "2-1-0"、"4-4-4"。 */
const CHARM_SLOT_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let a = 0; a <= 4; a++)
    for (let b = 0; b <= a; b++)
      for (let c = 0; c <= b; c++) opts.push(`${a}-${b}-${c}`);
  return opts;
})();

const NONE = "__none__";

type FormRow = { name: string; level: number };

type Pool = "weapon" | "armor";

type FormState = {
  /** 編輯中的護石 id；null = 新增。 */
  id: string | null;
  rows: [FormRow, FormRow];
  slotsStr: string;
  /** Wilds 逐洞池別（3 位置，對齊 slotsStr 的 a-b-c；預設 armor）。 */
  slotPools: [Pool, Pool, Pool];
};

const EMPTY_FORM: FormState = {
  id: null,
  rows: [
    { name: "", level: 1 },
    { name: "", level: 1 },
  ],
  slotsStr: "0-0-0",
  slotPools: ["armor", "armor", "armor"],
};

function charmToForm(c: OwnedCharm): FormState {
  const rows: [FormRow, FormRow] = [
    { name: "", level: 1 },
    { name: "", level: 1 },
  ];
  c.skills.slice(0, 2).forEach((s, i) => {
    rows[i] = { name: s.name, level: s.level };
  });
  const slots = [...c.slots];
  while (slots.length < 3) slots.push(0);
  const pools: [Pool, Pool, Pool] = ["armor", "armor", "armor"];
  (c.slotPools ?? []).slice(0, 3).forEach((p, i) => {
    pools[i] = p === "weapon" ? "weapon" : "armor";
  });
  return { id: c.id, rows, slotsStr: slots.slice(0, 3).join("-"), slotPools: pools };
}

type Props = {
  charms: OwnedCharm[];
  /** false = 搜尋不使用護石。 */
  useCharms: boolean;
  onChangeCharms: (charms: OwnedCharm[]) => void;
  onChangeUseCharms: (v: boolean) => void;
  allSkills: Skill[];
  /** Wilds 模式：每個洞位加池別（weapon/armor）選擇，寫入 slotPools。 */
  wildsMode?: boolean;
};

/**
 * 「我的護石」管理面板：登錄多顆護石（技能1+等級、技能2+等級、孔位），
 * 可編輯、刪除；搜尋時清單中所有護石都納入組合計算。
 */
export function CharmListPanel({
  charms,
  useCharms,
  onChangeCharms,
  onChangeUseCharms,
  allSkills,
  wildsMode = false,
}: Props) {
  const [form, setForm] = useState<FormState | null>(null);

  const setRow = (i: number, patch: Partial<FormRow>) =>
    setForm((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r
      ) as [FormRow, FormRow];
      return { ...prev, rows };
    });

  const save = () => {
    if (!form) return;
    // slotsStr 為 a-b-c（非遞增）；逐位置去零，並在 wilds 模式帶對齊的池別。
    const parsed = parseSlotString(form.slotsStr);
    const slots: number[] = [];
    const slotPools: Pool[] = [];
    parsed.forEach((v, i) => {
      if (v > 0) {
        slots.push(v);
        slotPools.push(form.slotPools[i] ?? "armor");
      }
    });
    const charm: OwnedCharm = {
      id: form.id ?? `charm_${Date.now()}`,
      skills: form.rows
        .filter((r) => r.name)
        .map((r) => ({ name: r.name, level: r.level })),
      slots,
      ...(wildsMode && slots.length ? { slotPools } : {}),
    };
    onChangeCharms(
      form.id
        ? charms.map((c) => (c.id === form.id ? charm : c))
        : [...charms, charm]
    );
    setForm(null);
  };

  const formValid =
    form != null &&
    (form.rows.some((r) => r.name) ||
      parseSlotString(form.slotsStr).some((s) => s > 0));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          我的護石（{charms.length}）
        </span>
        {!form && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setForm(EMPTY_FORM)}
          >
            <Plus className="h-3.5 w-3.5" /> 登錄護石
          </Button>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={!useCharms}
          onCheckedChange={(v) => onChangeUseCharms(v !== true)}
        />
        不使用護石（搜尋時忽略清單）
      </label>

      {/* ---- 清單 ---- */}
      {charms.length === 0 && !form ? (
        <p className="text-[11px] text-muted-foreground">
          尚未登錄護石。登錄後搜尋會把每顆護石納入組合計算。
        </p>
      ) : (
        <ul className={cn("space-y-1", !useCharms && "opacity-50")}>
          {charms.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate rounded-md border border-border px-2 py-1 text-xs">
                {ownedCharmLabel(c)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setForm(charmToForm(c))}
                title="編輯"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onChangeCharms(charms.filter((x) => x.id !== c.id))
                }
                title="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* ---- 新增 / 編輯表單 ---- */}
      {form && (
        <div className="space-y-2 rounded-md border border-border p-2">
          {form.rows.map((row, i) => {
            const max =
              allSkills.find((s) => s.name === row.name)?.maxLevel ?? 3;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[11px] text-muted-foreground">
                  技能{i + 1}
                </span>
                <Select
                  value={row.name || NONE}
                  onValueChange={(v) =>
                    setRow(i, {
                      name: v === NONE ? "" : v,
                      level: v === NONE ? 1 : row.level || 1,
                    })
                  }
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue placeholder="（無）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>（無）</SelectItem>
                    {allSkills.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(row.level || 1)}
                  onValueChange={(v) => setRow(i, { level: Number(v) })}
                  disabled={!row.name}
                >
                  <SelectTrigger className="h-8 w-[68px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: max }, (_, n) => n + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Lv{n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[11px] text-muted-foreground">
              洞數
            </span>
            <Select
              value={form.slotsStr}
              onValueChange={(v) =>
                setForm((prev) => (prev ? { ...prev, slotsStr: v } : prev))
              }
            >
              <SelectTrigger className="h-8 flex-1 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHARM_SLOT_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o} className="font-mono">
                    {o === "0-0-0" ? "無洞（0-0-0）" : o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Wilds：逐洞池別（weapon/armor）。武器洞只接武器珠、防具洞只接防具珠。 */}
          {wildsMode &&
            parseSlotString(form.slotsStr).some((s) => s > 0) && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground">
                  逐洞池別（武器洞只接武器珠、防具洞只接防具珠）
                </span>
                {parseSlotString(form.slotsStr).map((lvl, i) =>
                  lvl > 0 ? (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                        {lvl} 級洞
                      </span>
                      <Select
                        value={form.slotPools[i]}
                        onValueChange={(v) =>
                          setForm((prev) => {
                            if (!prev) return prev;
                            const sp = [...prev.slotPools] as [Pool, Pool, Pool];
                            sp[i] = v as Pool;
                            return { ...prev, slotPools: sp };
                          })
                        }
                      >
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="armor">防具珠池</SelectItem>
                          <SelectItem value="weapon">武器珠池</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null
                )}
              </div>
            )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setForm(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={save}
              disabled={!formValid}
              title={formValid ? undefined : "至少輸入一個技能或洞數"}
            >
              {form.id ? "儲存變更" : "加入清單"}
            </Button>
          </div>
          <Label className="block text-[11px] text-muted-foreground">
            護石最多 2 個技能；沒有技能的洞石只選洞數即可。
          </Label>
        </div>
      )}
    </div>
  );
}
