"use client";

import { useMemo } from "react";
import type {
  ArmorPart,
  ArmorPiece,
  BuildResult,
  Decoration,
  DecorationPool,
  ElementResistanceKey,
  FixedParts,
  GroupSkill,
  SetBonus,
  Skill,
  SkillMap,
  WeaponType,
} from "@/types/build";
import {
  ARMOR_PARTS,
  ARMOR_PART_LABELS,
  ELEMENT_RES_KEYS,
} from "@/types/build";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SkillSummary } from "./SkillSummary";
import { DecorationSummary } from "./DecorationSummary";
import { ProvenanceHint } from "./ProvenanceHint";
import { WeaponIcon, ArmorIcon } from "./EquipmentIcon";
import { formatSlots } from "@/lib/slot-utils";
import {
  formatWeaponSource,
  formatWeaponSpecial,
  formatWeaponStats,
  weaponSeriesLabel,
} from "@/lib/weapon-utils";
import {
  weaponTypes as riseWeaponTypes,
  decorationsBySkill as riseDecosBySkill,
  skillMax as riseSkillMax,
} from "@/lib/data";
import { mergeMaxSkills } from "@/lib/preset-resolver";
import { suggestAddableSkills } from "@/lib/suggest-skills";
import {
  Lock,
  Ban,
  Star,
  GitCompare,
  Copy,
  CheckCircle2,
  Gem,
  Sparkles,
  Plus,
  Layers,
  Swords,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * World 結果卡專屬顯示資料（PLAN Phase 5）。Rise 為 undefined，不渲染任何 World 區塊。
 * 以純資料 + 輕量內聯運算呈現，不 import skill-calculator/efr-world（維持首屏 bundle 乾淨）。
 */
export type WorldResultInfo = {
  setBonusById: Record<string, SetBonus>;
  skillByName: Record<string, Skill>;
  /** profile.resolveSkillMax：依當前 set bonus 觸發技能動態解析上限（secret 分母）。 */
  resolveSkillMax: (skill: string, active: SkillMap) => number;
  /**
   * 武器覺醒賦予的「虛擬 set bonus +1 件」（setBonusId → 額外件數）。件數統計種入，
   * 使 3 件門檻可用 2 件防具達成。undefined＝無（一般搜尋）。
   */
  virtualSetBonus?: Record<string, number>;
  /** Wilds group skill：groupId → GroupSkill（3 件門檻獨立軌）。World 為 undefined。 */
  groupById?: Record<string, GroupSkill>;
  /** Wilds 旗標：啟用珠雙池視覺分組 + group 觸發區塊。World/Rise 為 undefined。 */
  isWilds?: boolean;
};

const SHARP_COLOR_ZH = ["紅", "橙", "黃", "綠", "藍", "白", "紫"];
const SHARP_HEX = [
  "#d24d4d", "#e08a3c", "#e0c93c", "#4fae54",
  "#4f7fd2", "#e8e8e8", "#b47ff0",
];

/** 生效斬味色索引（在 base↔max 間依匠等級插值；與 efr-world.activeSharpIndex 同邏輯）。 */
function activeSharpIndex(
  sharpness: { base: number[]; max: number[] } | undefined,
  handicraftLv: number
): number {
  if (!sharpness) return 2;
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const baseTotal = sum(sharpness.base);
  const maxTotal = sum(sharpness.max);
  const reach = baseTotal + (Math.min(handicraftLv, 5) / 5) * (maxTotal - baseTotal);
  let cum = 0;
  let last = 2;
  for (let i = 0; i < 7; i++) {
    if (sharpness.max[i] > 0) {
      cum += sharpness.max[i];
      last = i;
      if (reach <= cum + 1e-6) return i;
    }
  }
  return last;
}

/**
 * 統計防具的 setBonusId 件數（可種入武器覺醒的虛擬 +1 件），回傳觸發達門檻的 rank。
 * virtual＝該 set bonus 的虛擬件數，供顯示「含武器覺醒 +N」標註。
 */
function worldSetBonusRows(
  pieces: ArmorPiece[],
  setBonusById: Record<string, SetBonus>,
  virtualSetBonus?: Record<string, number>
): {
  name: string;
  count: number;
  virtual: number;
  triggered: { skill: string; pieces: number }[];
}[] {
  const counts: Record<string, number> = virtualSetBonus ? { ...virtualSetBonus } : {};
  for (const p of pieces) {
    if (p.setBonusId) counts[p.setBonusId] = (counts[p.setBonusId] ?? 0) + 1;
    // Wilds Gogmazios 借用件：件數吃 setBonusId ∪ extraSetBonusIds 聯集（與引擎 computeSetBonusSkills
    // 同一規則，skill-calculator.ts）。Rise/World 無 extraSetBonusIds → 零迭代、行為不變。
    for (const e of p.extraSetBonusIds ?? []) counts[e] = (counts[e] ?? 0) + 1;
  }
  const rows: {
    name: string;
    count: number;
    virtual: number;
    triggered: { skill: string; pieces: number }[];
  }[] = [];
  for (const [id, count] of Object.entries(counts)) {
    const sb = setBonusById[id];
    if (!sb) continue;
    const triggered = sb.ranks
      .filter((r) => count >= r.pieces)
      .map((r) => ({ skill: r.skillName, pieces: r.pieces }));
    if (triggered.length)
      rows.push({ name: sb.nameZh, count, virtual: virtualSetBonus?.[id] ?? 0, triggered });
  }
  return rows;
}

/**
 * Wilds group skill：統計防具 groupId 件數（門檻恆 3，見 computeGroupSkills），回傳達門檻的 rank。
 * 與 set bonus 為獨立雙軌；件數/門檻直接由引擎選出的裝備 groupId 導出（同 computeGroupSkills 規則）。
 */
function wildsGroupRows(
  pieces: ArmorPiece[],
  groupById: Record<string, GroupSkill>
): { name: string; count: number; triggered: { skill: string; pieces: number }[] }[] {
  const counts: Record<string, number> = {};
  for (const p of pieces) if (p.groupId) counts[p.groupId] = (counts[p.groupId] ?? 0) + 1;
  const rows: { name: string; count: number; triggered: { skill: string; pieces: number }[] }[] = [];
  for (const [id, count] of Object.entries(counts)) {
    const g = groupById[id];
    if (!g) continue;
    const triggered = g.ranks
      .filter((r) => count >= r.pieces)
      .map((r) => ({ skill: r.skillName, pieces: r.pieces }));
    if (triggered.length) rows.push({ name: g.nameZh, count, triggered });
  }
  return rows;
}

/** 觸發的 set bonus 技能表（供 resolveSkillMax 動態上限判定；可種入虛擬 +1 件）。 */
function activeSetBonusSkills(
  pieces: ArmorPiece[],
  setBonusById: Record<string, SetBonus>,
  virtualSetBonus?: Record<string, number>
): SkillMap {
  const counts: Record<string, number> = virtualSetBonus ? { ...virtualSetBonus } : {};
  for (const p of pieces) {
    if (p.setBonusId) counts[p.setBonusId] = (counts[p.setBonusId] ?? 0) + 1;
  }
  const skills: SkillMap = {};
  for (const [id, cnt] of Object.entries(counts)) {
    const sb = setBonusById[id];
    if (!sb) continue;
    for (const r of sb.ranks) if (cnt >= r.pieces) skills[r.skillName] = (skills[r.skillName] ?? 0) + r.skillLevel;
  }
  return skills;
}

type Props = {
  result: BuildResult;
  rank: number;
  weaponSlotsLabel: string;
  /** 使用者指定的必要技能（不含 autoSkills，卡片內會合併）。 */
  requiredSkills: SkillMap;
  fixedParts: FixedParts;
  /** 已排除的裝備/武器 id 集合（用於卡片上顯示排除狀態）。 */
  excludedIds: Set<string>;
  isFavorite: boolean;
  isCompared: boolean;
  onFixArmor: (part: ArmorPart, id: string) => void;
  onExcludeArmor: (id: string) => void;
  onFixWeapon: (id: string) => void;
  onExcludeWeapon: (id: string) => void;
  onCopy: (summary: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleCompare: (id: string) => void;
  /** per-game 小資料（預設 Rise；World 由 BuilderView 傳入對應資料）。 */
  weaponTypes?: WeaponType[];
  decorationsBySkill?: Record<string, Decoration[]>;
  skillMax?: Record<string, number>;
  /** World 專屬顯示（set bonus / secret 分母 / 斬味色）；Rise 為 undefined。 */
  world?: WorldResultInfo;
};

const RES_LABELS: Record<ElementResistanceKey, string> = {
  fire: "火",
  water: "水",
  thunder: "雷",
  ice: "冰",
  dragon: "龍",
};

function PartRow({
  part,
  label,
  piece,
  fixed,
  excluded,
  onFix,
  onExclude,
}: {
  part: ArmorPart;
  label: string;
  piece: ArmorPiece;
  fixed: boolean;
  excluded: boolean;
  onFix: () => void;
  onExclude: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-2 py-1", excluded && "opacity-50")}>
      <ArmorIcon
        part={part}
        rarity={piece.rarity}
        className="h-8 w-8"
        title={label}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onFix}
            title={fixed ? "已固定此部位" : "點擊以固定此部位"}
            className={cn(
              "truncate text-left text-[15px] hover:text-primary",
              excluded && "line-through"
            )}
          >
            {piece.nameZh}
          </button>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {formatSlots(piece.slots)}
          </span>
          {piece.isAugmented && (
            <Badge variant="accent" className="px-1 py-0 text-[11px]">
              鍊成
            </Badge>
          )}
          {excluded && (
            <Badge variant="destructive" className="px-1 py-0 text-[10px]">
              已排除
            </Badge>
          )}
        </div>
        <ProvenanceHint
          seriesName={piece.seriesName}
          rankLabel={piece.rankLabel}
          rarity={piece.rarity}
          source={piece.sourceMonster}
        />
        {Object.keys(piece.skills).length > 0 && (
          <div className="truncate text-xs text-muted-foreground">
            {Object.entries(piece.skills)
              .map(([n, l]) => `${n} ${l}`)
              .join("・")}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant={fixed ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onFix}
          title={fixed ? "已固定此部位" : "固定此部位"}
        >
          <Lock className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={excluded ? "destructive" : "ghost"}
          size="icon"
          className={cn(
            "h-7 w-7",
            !excluded && "text-muted-foreground hover:text-destructive"
          )}
          onClick={onExclude}
          title={excluded ? "已排除（重新搜尋後生效）" : "排除此裝備"}
        >
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function BuildResultCard({
  result,
  rank,
  weaponSlotsLabel,
  requiredSkills,
  fixedParts,
  excludedIds,
  isFavorite,
  isCompared,
  onFixArmor,
  onExcludeArmor,
  onFixWeapon,
  onExcludeWeapon,
  onCopy,
  onToggleFavorite,
  onToggleCompare,
  weaponTypes = riseWeaponTypes,
  decorationsBySkill = riseDecosBySkill,
  skillMax = riseSkillMax,
  world,
}: Props) {
  const missing = Object.entries(result.missingRequiredSkills);
  const weapon = result.weapon;
  const weaponExcluded = weapon ? excludedIds.has(weapon.id) : false;
  const weaponTypeLabel = weapon
    ? weaponTypes.find((t) => t.id === weapon.weaponType)?.nameZh
    : undefined;

  // ---- World 顯示：set bonus 觸發、secret 解放後分母、生效斬味色 ----
  const armorPieces = ARMOR_PARTS.map((p) => result.armor[p]);
  const setBonusRows = world
    ? worldSetBonusRows(armorPieces, world.setBonusById, world.virtualSetBonus)
    : [];
  // Wilds group skill 觸發（3 件門檻；獨立雙軌）。World/Rise 無 groupById → 空。
  const groupRows = world?.groupById ? wildsGroupRows(armorPieces, world.groupById) : [];
  // Wilds 珠雙池：decorationId → pool（供 DecorationSummary 分組）。Rise/World 無 pool → undefined（攤平）。
  const decoPoolById = useMemo(() => {
    if (!world?.isWilds) return undefined;
    const m: Record<string, DecorationPool> = {};
    for (const list of Object.values(decorationsBySkill))
      for (const d of list) if (d.pool) m[d.id] = d.pool;
    return m;
  }, [world?.isWilds, decorationsBySkill]);
  const secretRows = useMemo(() => {
    if (!world) return [];
    const active = activeSetBonusSkills(
      armorPieces,
      world.setBonusById,
      world.virtualSetBonus
    );
    const out: { name: string; level: number; cap: number; unlocked: boolean }[] = [];
    for (const [name, level] of Object.entries(result.finalSkills)) {
      const s = world.skillByName[name];
      if (s?.secretMaxLevel == null) continue; // 只列有 secret 的技能
      const cap = world.resolveSkillMax(name, active);
      out.push({ name, level, cap, unlocked: cap > s.maxLevel });
    }
    return out.sort((a, b) => b.level - a.level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, result.finalSkills, result.armor]);
  const sharpIdx =
    world && weapon?.sharpness
      ? activeSharpIndex(weapon.sharpness, result.finalSkills["匠"] ?? 0)
      : -1;
  const autoEntries = Object.entries(result.autoSkills ?? {});
  // 技能摘要的「使用者指定」集合 = 必要技能 + 自動技能（兩者都不算額外賺到）
  const effectiveRequired = useMemo(
    () => mergeMaxSkills(requiredSkills, result.autoSkills ?? {}),
    [requiredSkills, result.autoSkills]
  );
  // 追加技能建議：用此配裝的剩餘洞位推算還能塞哪些珠（擇一）。
  const addable = useMemo(
    () =>
      suggestAddableSkills(
        result.remainingSlots,
        result.finalSkills,
        decorationsBySkill,
        skillMax,
        6
      ),
    [result.remainingSlots, result.finalSkills]
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b bg-muted/30 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 font-mono text-sm font-bold text-primary">
            #{rank}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono text-lg font-bold text-orange-400"
                title="EFR：期望攻擊值（同武器種類內可比較的參考指標）"
              >
                {result.efr.raw}
              </span>
              <span className="text-[11px] text-muted-foreground">EFR</span>
            </div>
            <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
              {result.efr.element > 0 && (
                <span title="期望屬性值（EFR 屬性部分）" className="text-sky-400">
                  屬性 {result.efr.element}
                </span>
              )}
              <span title="5 件防具基礎防禦總和">防禦 {result.totalDefense}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isFavorite && "text-primary")}
            onClick={() => onToggleFavorite(result.id)}
            title="收藏"
          >
            <Star
              className={cn("h-4 w-4", isFavorite && "fill-primary")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isCompared && "text-accent")}
            onClick={() => onToggleCompare(result.id)}
            title="加入比較"
          >
            <GitCompare className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onCopy(result.summary)}
            title="複製配裝摘要"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        {/* 裝備部位 */}
        <div className="divide-y divide-border/50">
          <div className="flex items-center gap-2 py-1">
            {weapon ? (
              <WeaponIcon
                type={weapon.weaponType}
                className="h-8 w-8 text-foreground/80"
                title="武器"
              />
            ) : (
              <Badge
                variant="secondary"
                className="w-11 shrink-0 justify-center px-1 py-0 text-[11px]"
              >
                武器
              </Badge>
            )}
            {weapon ? (
              <>
                <div className={cn("min-w-0 flex-1", weaponExcluded && "opacity-50")}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        weaponExcluded && "line-through"
                      )}
                    >
                      {weapon.nameZh}
                    </span>
                    {weaponExcluded && (
                      <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                        已排除
                      </Badge>
                    )}
                    {weaponTypeLabel && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {weaponTypeLabel}
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {formatSlots(weapon.slots)}
                    </span>
                    <Badge
                      variant={result.weaponFixed ? "default" : "accent"}
                      className="shrink-0 px-1 py-0 text-[11px]"
                    >
                      {result.weaponFixed ? "固定" : "搜尋"}
                    </Badge>
                  </div>
                  <ProvenanceHint
                    seriesName={weaponSeriesLabel(weapon)}
                    rankLabel={weapon.rankLabel}
                    rarity={weapon.rarity}
                  />
                  <div className="truncate text-xs text-muted-foreground">
                    {[formatWeaponStats(weapon), ...formatWeaponSpecial(weapon)].join(
                      "　"
                    )}
                  </div>
                  {formatWeaponSource(weapon) && (
                    <div className="truncate text-xs text-muted-foreground/70">
                      {formatWeaponSource(weapon)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant={result.weaponFixed ? "default" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onFixWeapon(weapon.id)}
                    title={result.weaponFixed ? "已固定此武器" : "固定此武器"}
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={weaponExcluded ? "destructive" : "ghost"}
                    size="icon"
                    className={cn(
                      "h-7 w-7",
                      !weaponExcluded &&
                        "text-muted-foreground hover:text-destructive"
                    )}
                    onClick={() => onExcludeWeapon(weapon.id)}
                    title={
                      weaponExcluded ? "已排除（重新搜尋後生效）" : "排除此武器"
                    }
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-muted-foreground">
                  （自訂洞數）
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {weaponSlotsLabel}
                </span>
              </>
            )}
          </div>
          {ARMOR_PARTS.map((part) => (
            <PartRow
              key={part}
              part={part}
              label={ARMOR_PART_LABELS[part]}
              piece={result.armor[part]}
              fixed={fixedParts[part] === result.armor[part].id}
              excluded={excludedIds.has(result.armor[part].id)}
              onFix={() => onFixArmor(part, result.armor[part].id)}
              onExclude={() => onExcludeArmor(result.armor[part].id)}
            />
          ))}
          <div className="flex items-center gap-2 py-1">
            <Badge
              variant="secondary"
              className="w-11 shrink-0 justify-center px-1 py-0 text-[11px]"
            >
              護石
            </Badge>
            {result.charm.id ? (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {result.charm.name}
                </span>
                <Badge variant="accent" className="shrink-0 px-1 py-0 text-[11px]">
                  {world ? "可生產" : "我的護石"}
                </Badge>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                未使用護石
              </span>
            )}
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatSlots(result.charm.slots)}
            </span>
          </div>
        </div>

        {/* World：set bonus 觸發、secret 解放後分母、生效斬味色。Wilds：另加 group skill 觸發雙軌。 */}
        {world && (setBonusRows.length > 0 || groupRows.length > 0 || secretRows.length > 0 || sharpIdx >= 0) && (
          <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
            {sharpIdx >= 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Swords className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">生效斬味</span>
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                  style={{
                    backgroundColor: SHARP_HEX[sharpIdx] + "33",
                    color: SHARP_HEX[sharpIdx],
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: SHARP_HEX[sharpIdx] }}
                  />
                  {SHARP_COLOR_ZH[sharpIdx]}斬
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  （含匠 {result.finalSkills["匠"] ?? 0}）
                </span>
              </div>
            )}
            {setBonusRows.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs">
                <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {setBonusRows.map((r) => (
                    <div key={r.name} className="flex flex-wrap items-center gap-x-1.5">
                      <span className="font-medium text-foreground">
                        {r.name} ×{r.count}
                      </span>
                      {r.virtual > 0 && (
                        <span
                          className="text-[11px] text-primary"
                          title="含武器覺醒賦予的虛擬件數"
                        >
                          （含武器覺醒 +{r.virtual}）
                        </span>
                      )}
                      <span className="text-muted-foreground">→</span>
                      {r.triggered.map((t) => (
                        <Badge
                          key={t.skill + t.pieces}
                          variant="secondary"
                          className="px-1.5 py-0 text-[11px]"
                        >
                          {t.skill}（{t.pieces} 件）
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {groupRows.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs">
                <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {groupRows.map((r) => (
                    <div key={r.name} className="flex flex-wrap items-center gap-x-1.5">
                      <span className="font-medium text-foreground">{r.name}</span>
                      {r.triggered.map((t) => (
                        <Badge
                          key={t.skill + t.pieces}
                          variant="outline"
                          className="border-emerald-500/40 px-1.5 py-0 text-[11px] text-emerald-500"
                        >
                          群組技能：{t.skill}（{r.count}/{t.pieces} 件）
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {secretRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className="text-muted-foreground">解放上限</span>
                {secretRows.map((s) => (
                  <span
                    key={s.name}
                    className={cn(
                      "font-mono",
                      s.unlocked ? "text-emerald-400" : "text-muted-foreground"
                    )}
                    title={
                      s.unlocked
                        ? `${s.name} 已由 set bonus 解放上限至 ${s.cap}`
                        : `${s.name} 原生上限 ${s.cap}`
                    }
                  >
                    {s.name} {s.level}/{s.cap}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* 裝飾珠 */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Gem className="h-3.5 w-3.5" /> 裝飾珠配置
          </div>
          <DecorationSummary decorations={result.decorations} poolByDecoId={decoPoolById} />
        </div>

        {/* 自動技能（依武器屬性加入，由搜尋引擎 autoRules 產生）。
            流派 preset／guide 移除後配裝器不再送 autoRules，此分支目前恆不觸發；
            屬引擎通用能力顯示位（禁區保留，見 CLAUDE.md §0），勿因無觸發誤判為死碼刪除。 */}
        {autoEntries.length > 0 && (
          <p className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1 text-[11px] text-accent">
            <Sparkles className="h-3 w-3 shrink-0" />
            自動技能：
            {autoEntries.map(([n, l]) => `${n} Lv${l}`).join("、")}
          </p>
        )}

        {/* 技能摘要 */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            技能摘要
          </div>
          <SkillSummary
            skills={result.finalSkills}
            required={effectiveRequired}
          />
        </div>

        {/* 未達成必要技能（一般不會有） */}
        {missing.length > 0 && (
          <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            未達成：
            {missing.map(([n, l]) => `${n} 缺 ${l}`).join("、")}
          </div>
        )}

        {/* 防禦 / 屬性耐性（5 件防具總和） */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            防禦{" "}
            <span className="font-mono text-foreground">
              {result.totalDefense}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-mono">
            {ELEMENT_RES_KEYS.map((k) => {
              const v = result.totalResistances[k];
              return (
                <span
                  key={k}
                  className={cn(
                    v < 0 && "text-destructive",
                    v > 0 && "text-emerald-400"
                  )}
                >
                  {RES_LABELS[k]}
                  {v >= 0 ? `+${v}` : v}
                </span>
              );
            })}
          </span>
        </div>

        {/* 洞位狀態 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            剩餘洞位：
            <span className="font-mono text-foreground">
              {formatSlots(result.remainingSlots)}
            </span>
          </span>
          <span
            className={cn(
              "flex items-center gap-1",
              result.meetsReservedSlots
                ? "text-emerald-400"
                : "text-destructive"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {result.meetsReservedSlots ? "符合保留洞位" : "不符保留洞位"}
          </span>
        </div>

        {/* 追加技能建議（用剩餘洞，擇一） */}
        {addable.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Plus className="h-3.5 w-3.5" /> 可追加技能（擇一，用剩餘洞）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {addable.map((a) => (
                <Badge
                  key={a.skillName}
                  variant="outline"
                  className="gap-1 px-2 py-0.5 text-[12px]"
                >
                  <span>{a.skillName}</span>
                  <span className="font-mono opacity-70">+{a.addLevels}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
