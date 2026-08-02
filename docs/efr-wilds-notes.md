# efr-wilds-notes.md — MH Wilds EFR 模型數值來源與近似（Phase 4）

> 格式比照 `docs/efr-world-notes.md`（誠實揭露），但**數值全部本輪機械抽取，禁沿用前代**。
> efr-wilds.ts 與 efr.ts / efr-world.ts **同介面**（`computeEfr(EfrInput)→EfrResult`）。

## §1 攻擊尺度複核（推翻 Phase 2 裁決）

- **Phase 2 裁決**：attack = `damage.display`（假設「同 World 尺度」）。
- **Phase 4 複核（推翻，點名）**：Kiranico 1.040 顯示 `希望大劍Ⅰ–Ⅴ = 90/100/130/160/190`
  ＝ mhdb `damage.raw`（`display` 432/480/… 為 World 式膨脹，**Wilds 不顯示**）。
  → **attack = damage.raw**（weapons.json 已更新，Phase 4a commit）。efr-wilds 直接以 raw 為攻擊基數
  （不除武器種倍率——Wilds 顯示即 raw，與 World「display 需還原 raw」不同）。

## §2 技能逐級值（機械抽取，硬編禁止）

- 來源：`src/data/wilds/efr-skill-values.json`，由 `scripts/wilds/extract-efr-values.mjs` regex 抽自
  mhdb skills 描述（可重跑驗證）。**與 Rise 多處不同**（點名）：
  - 攻擊：flat `[3,5,7,8,9]` + pct `[0,0,0,.02,.04]`（5 級；Rise 為 7 級不同值）。
  - 看破：`[4,8,12,16,20]%`（Rise `[5,10,15,20,25,30,40]`）。
  - 弱點特效：`[5,10,15,20,30]%`（5 級；Rise 3 級 `[15,30,50]`）。
  - 超會心：會心傷害倍率 `1.28/1.31/1.34/1.37/1.40`（描述 "to N%"；無技能基準 1.25）。
  - 挑戰者：atk `[4,8,12,16,20]` / aff `[3,5,7,10,15]%`。無傷：atk `[3,6,10,15,20]`。
  - 精神抖擻（Max Might）：aff `[10,20,30]%`。匠：sharpness `+10/級`（驗證斬味模型）。
  - 屬性攻擊強化（五屬）：flat `[40,50,60]` + pct `[0,.10,.20]`。
- **定性技能（無數字）**：會心擊【屬性】描述為 slightly/greatly（無 %）→ 採社群傷害公式
  屬性會心倍率 `[1.05,1.10,1.15]`，`$source` 標記；**若後續多源給出 Wilds 確值，機械更新**。

## §3 斬味模型

- base/max 見 `docs/wilds-sharpness-audit.md`（base=匠0、max=handicraft 延展，全 947 把自洽）。
- **色→倍率**：MH 系列社群傷害公式長期穩定值（physical `紅.5/橙.75/黃1/綠1.05/藍1.2/白1.32/紫1.39`；
  屬性另表）。Wilds 未見官方改動證據 → v1 沿用；**與 World 值相同處非「沿用 Rise」，而是同一 MH 系列標準**。
- **期望倍率模型**：頂端 `WILDS_EXPECTED_SHARPNESS_USE=60` 單位加權平均（sharpness audit §5 決策），
  **N=60 待 Wilds 實測校準，禁當定值**。匠：base↔max 線性插值 → 頂端高色段變厚 → 物理 EFR 單調上升
  （手算 test-efr-wilds §C 驗證）。

## §4 近似清單（v1，誠實揭露）

- **條件技觸發率**統一 `CONDITIONAL_UPTIME = 0.75`（挑戰者/無傷/精神抖擻等 × uptime）。
- **弱點特效**假設命中弱點計滿（`assumeWeakpoint` 預設 true）。
- **屬性值上限（elemental cap）不建模** → 高屬強化配裝屬性 EFR 偏高（已知高估，同前代）。
- **斬味打鬥消耗下滑不建模**；**鈍器能手**（低斬味加成）、**達人藝/利刃/剛刃研磨**（消耗抑制）v1 不建模。
- **Wilds 特有機制不建模（明列）**：**傷口（wound）** 攻擊加成、**集中模式（Focus Mode）** 傷口精準傷害、
  武器強化簡化輸入的斬味變動——v1 皆不建模（EFR 為同武器種內相對排序指標，這些對排序影響次要）。
- **會心擊【屬性】** 倍率為社群近似（見 §2）。屬性綜合係數沿用 `total = raw + element×4`（同 Rise 形狀）。

## §5 驗收

- 手算對照 **24 組**（test-efr-wilds.mjs §A–F）+ EFR 冒煙 **8 組**隔離單一變因（§G）+ 決定性，全綠。
- 消費端佈線：searchBuilds top 結果 `efr.raw` 對照 `computeEfr(finalSkills)` 吻合、結果依 efr.total 降冪。
