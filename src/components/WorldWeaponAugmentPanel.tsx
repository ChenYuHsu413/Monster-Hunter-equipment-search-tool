"use client";

import type { SetBonus } from "@/types/build";
import type { WorldWeaponAugment } from "@/lib/world-weapon-augment";
import { EMPTY_WORLD_WEAPON_AUGMENT } from "@/lib/world-weapon-augment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";

/**
 * World 武器強化「簡化輸入」面板（覺醒／客製強化）。
 *
 * 比照 Rise 傀異鍊成：**輸入結果值，不模擬取得過程**。僅在固定武器模式顯示（呼叫端控制）。
 * 數值 delta 進搜尋/EFR（武器副本）；防禦為 display-only；虛擬 set bonus 以 +1 件計入。
 */
type Props = {
  augment: WorldWeaponAugment;
  onChange: (a: WorldWeaponAugment) => void;
  /** World set bonus 清單（虛擬 +1 件下拉）。 */
  setBonuses: SetBonus[];
  /** 固定武器是否有既有五屬性（無則屬性 delta 無效果，僅提示）。 */
  weaponHasElement: boolean;
  /** 面板標題（預設 World 覺醒/客製；Wilds Artian 另給）。 */
  title?: string;
  /** 是否顯示「覺醒套裝技（虛擬 set bonus）」區（Wilds Artian 無 set bonus → false）。 */
  showSetBonus?: boolean;
};

const NONE = "none";

export function WorldWeaponAugmentPanel({
  augment,
  onChange,
  setBonuses,
  weaponHasElement,
  title = "武器強化（覺醒／客製強化，輸入結果值）",
  showSetBonus = true,
}: Props) {
  const set = <K extends keyof WorldWeaponAugment>(
    key: K,
    value: WorldWeaponAugment[K]
  ) => onChange({ ...augment, [key]: value });

  const num = (v: string) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? n : 0;
  };

  const dirty =
    augment.attack !== 0 ||
    augment.affinity !== 0 ||
    augment.element !== 0 ||
    augment.slot > 0 ||
    augment.defense !== 0 ||
    !!augment.setBonusId;

  return (
    <div className="space-y-2.5 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {title}
        </Label>
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => onChange({ ...EMPTY_WORLD_WEAPON_AUGMENT })}
          >
            清除強化
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">攻擊 +</span>
          <Input
            type="number"
            value={augment.attack || ""}
            onChange={(e) => set("attack", num(e.target.value))}
            placeholder="0"
            className="h-8 font-mono text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">會心 + (%)</span>
          <Input
            type="number"
            value={augment.affinity || ""}
            onChange={(e) => set("affinity", num(e.target.value))}
            placeholder="0"
            className="h-8 font-mono text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">
            屬性 +{!weaponHasElement && "（此武器無屬性）"}
          </span>
          <Input
            type="number"
            value={augment.element || ""}
            onChange={(e) => set("element", num(e.target.value))}
            placeholder="0"
            disabled={!weaponHasElement}
            className="h-8 font-mono text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">
            防禦 +（僅顯示）
          </span>
          <Input
            type="number"
            value={augment.defense || ""}
            onChange={(e) => set("defense", num(e.target.value))}
            placeholder="0"
            className="h-8 font-mono text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground">追加洞位</span>
          <Select
            value={augment.slot > 0 ? String(augment.slot) : NONE}
            onValueChange={(v) => set("slot", v === NONE ? 0 : Number(v))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>無</SelectItem>
              <SelectItem value="1">① 1 級</SelectItem>
              <SelectItem value="2">② 2 級</SelectItem>
              <SelectItem value="3">③ 3 級</SelectItem>
              <SelectItem value="4">④ 4 級</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showSetBonus && (
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">
              覺醒套裝技（虛擬 +1 件）
            </span>
            <Select
              value={augment.setBonusId || NONE}
              onValueChange={(v) => set("setBonusId", v === NONE ? "" : v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="無" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>無</SelectItem>
                {setBonuses.map((sb) => (
                  <SelectItem key={sb.id} value={sb.id}>
                    {sb.nameZh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {showSetBonus
          ? "數值直接套用到此固定武器（搜尋與 EFR）。防禦僅供參考不進搜尋。覺醒套裝技以「+1 件」併入套裝件數統計，可讓 3 件門檻用 2 件防具達成。"
          : "Artian 隨機強化：直接輸入結果值 delta（攻擊/會心/屬性/追加洞，追加洞為武器＝武器珠池），套用到此固定武器（搜尋與 EFR）。防禦僅供參考不進搜尋。"}
      </p>
    </div>
  );
}
