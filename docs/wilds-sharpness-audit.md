# wilds-sharpness-audit.md — MH Wilds 斬味考證（Phase 4）

> **狀態**：Phase 4｜結案版本 `wilds-v1`（@ `40e25c4`）｜考證定案：`sharpness` 單列＝**匠0 base**、`handicraft[]`＝延展（**方向與 World 相反**，§2）；已於 `efr-wilds.ts` 落地（全 947 把自洽）。
> 產出日期：2026-08-02。**方法參照前代（efr-world/world-sharpness-audit）但數字禁沿用**
> （World「CSV 單列＝匠5」二度自我推翻的教訓）。本輪結論全部以 **mhdb-wilds 資料自洽 + 400 bar cap
> 證據 + Kiranico 1.040 攻擊值交叉**支撐，非憑記憶。

## §1 色帶結構

- **7 色**：`{red, orange, yellow, green, blue, white, purple}`（同系列色階，紅<橙<黃<綠<藍<白<紫）。
- **資料表達**：mhdb 每把近戰武器（947/1188，弩/弓 241 無斬味）有 `sharpness`（7 色物件，各色**單位數**）
  + `handicraft[]`（陣列，元素 0–5、和恆 **5**、長度 0–2）。
- **總量 cap = 400**：全 947 把 `sharpness` 總和 ≤ 400（實測最大 400）。

## §2 匠（Handicraft）語意 — **考證定案：`sharpness` ＝匠0 base，handicraft[] ＝延展**

### 決定性證據（mhdb 自洽，非 assume）

1. **400 總和武器全部 `handicraft:[]`（空）**：5 把總和=400（Bequeathed 系 Fatalis 大劍 4 把 + Shatterseal
   Drakesnest），handicraft 皆為 `[]`；且**所有 handicraft 空的武器總和恰為 400**。
   → 已達 400 bar cap 者無延展空間故 handicraft 空 → **`sharpness` 是「未延展」值 ＝匠0 base**
   （若 sharpness 是匠5 maxed，400 者 base 應 <400 且 handicraft 非空，與實測相反）。
2. **handicraft[] 元素和恆 = 5**（[5]、[4,1]、[2,3]、[1,4]…）＝ 匠的 **5 個等級**。

### 匠延展模型（**全 947 把自洽驗證通過**）

> `max`（匠5）＝ `base` + `handicraft[i] × 10` 依序加到 **base 頂色（i=0）與逐級更高色階（i=1,2…）**。

- **每級 +10 單位**；5 級 = **+50**（handicraft 和 × 10）。
- `handicraft[0]` 延展 base 的**最高非零色本身**；`handicraft[1]` 加**上一色階**；依此類推。
- **驗證（`node` 掃全 947 把）**：ok **947/947**、超紫 overflow **0**、max 總和 >400 **0**、
  收支不符（max 總和 ≠ base 總和 + Σhc×10）**0**。
- 範例：
  - `Hope Strongarm I` base 頂綠:50、hc[5] → 綠:50+50=**綠:100**（5 級全延展綠）。
  - `Hope Strongarm V` base 頂白:50、hc[5] → **白:100**。
  - `Bone Strongarm I` base 頂黃:70、hc[4,1] → 黃:70+40=110、綠(上階):10 → maxTop **綠:10**。
- **取證指令**：見本輪回報 (c)（`scripts/wilds/.cache/weapons.en.json` 掃描）。

### 與 World 的差異（點名）

- **World**：MHWorldData `weapon_sharpness` 單列 ＝ **匠5 maxed**，base 由高色端剝 50。
- **Wilds**：mhdb `sharpness` ＝ **匠0 base**，`handicraft[]` 給延展 → max。方向相反，**數字禁沿用**。

## §3 各色帶物理/屬性倍率

- **本輪不重造前代倍率表**：Wilds 斬味色階與前代同名（紅…紫），社群傷害公式的**色→倍率**
  對照（如綠 1.05、藍 1.20、白 1.32、紫 1.39 physical；屬性另表）在 Wilds 尚無「與 World 不同」的
  多源證據。**v1 決策**：efr-wilds 沿用「色→倍率」的**通用形狀**，逐值於 `efr-wilds-notes.md` 標來源；
  **若後續多源證實 Wilds 某色倍率與 World 不同，點名並機械更新**（不硬編憑記憶）。
- 出處：色→倍率為 MH 系列長期穩定值（Fextralife/社群傷害公式），Wilds 未見官方改動證據。

## §4 斬味維持/回復類技能盤點（模型邊界）

- **匠（Handicraft）**：延展斬味（本檔模型）。**達人藝**（會心時抑制消耗）、**利刃**（抑制消耗）、
  **剛刃研磨**（一定時間不消耗）、**心眼/鈍器能手**（低斬味補正 / 不彈開）——皆在 skills.json（kind:weapon）。
- **v1 不建模「打鬥中斬味消耗下滑」**（同 World）：EFR 取**當前匠等級的生效斬味色**（base↔max 插值），
  不模擬砥石/消耗動態。**鈍器能手**（低斬味加成）、**達人藝/利刃**（消耗抑制）v1 不建模，誠實註記。

## §5 期望倍率模型形狀決策

- **決策：沿用 World「頂端 N 單位加權平均倍率」形狀**（非只取最高色），理由：與 efr-world 同介面、
  同一套「頂端使用區」語意，維護一致；且比「只取最高色」更貼近實戰（頂端幾段都會用到）。
- **N 取值**：沿用 World `EXPECTED_SHARPNESS_USE = 60`**作為 v1 起點**——但**標記為待校準**：
  World 的 60 依 World 手感校準，Wilds 未獨立校準，故 efr-wilds 以 `WILDS_EXPECTED_SHARPNESS_USE`
  獨立常數（值暫 60），`efr-wilds-notes.md` 註明「待 Wilds 實測校準，禁當定值」。
- **匠作用**：EFR 依配裝「匠」等級在 base↔max 間**線性插值**生效斬味（比照 Rise efr.ts 的 base/max 插值），
  匠愈高→頂端高色段愈厚→物理 EFR 單調上升（可手算驗證，見 efr-wilds-notes）。
