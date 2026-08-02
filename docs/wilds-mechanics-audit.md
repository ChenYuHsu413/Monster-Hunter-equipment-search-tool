# wilds-mechanics-audit.md — MH Wilds 機制定案（Phase 0）

> 產出日期：2026-08-02。對 PLAN-wilds §A 的 9 條先驗逐條以 **mhdb-wilds 實抓資料**定案。
> 每條格式：先驗 → 證據（實抓片段）→ 定案 → 引擎影響。所有證據為本日 API 實抓，非訓練記憶。
> 取證主指令（locale 可換 zh-Hant）：`curl -s 'https://wilds.mhdb.io/en/<category>?limit=N&q=<json>'`

## 1. 技能分家（武器技能 / 防具技能）

- **先驗**：武器技能掛武器/武器珠，防具技能掛防具/防具珠；武器本體自帶技能。
- **證據**：`skills` 端點每技能有 `kind`。179 技能分佈 **armor 71 / weapon 66 / group 17 / set 25**。
  防具件 `Conga Helm α` 帶 `Free Meal(kind:armor)`、`Intimidator(kind:armor)`。
- **定案**：技能分家為**資料驅動**（`skill.kind ∈ {armor,weapon,group,set}`），非靠命名硬判。
- **引擎影響**：珠池二維約束以 `skill.kind` + `decoration.kind` 交叉；武器 seed 技能見 #2/#9 佈線。

## 2. 裝飾珠雙池

- **先驗**：武器珠/防具珠兩池，洞位有歸屬。
- **證據**：`decorations` 每珠有 `kind`：`Venom Jewel[1] kind:weapon`、`Handicraft Jewel II[2] kind:weapon`、
  `Flayer Jewel[3] kind:armor`。全 361 珠 **weapon 295 / armor 66**。珠 `slot` 為**單值**（1–3，非陣列）。
  **複合珠 173/361**（`skills.length>1`，雙技能各 Lv1，比照 World）。
- **定案**：池別欄位＝**`decoration.kind`**（weapon|armor）。無跨池枚舉；洞歸屬由武器洞/防具洞決定
  （防具 `slots` 與武器 `slots` 分屬各自池）。**無 lv4 珠洞**（slot 上限 3）。
- **引擎影響**：`Decoration.pool = kind`；solver 洞-珠匹配加 pool 一維；複合珠沿用尾巴 D solver
  （雙池下交換合法性 = 交換不得跨池，Phase 3 探測後修）。

## 3. Set bonus 門檻（含 1 件特例查證）

- **先驗**：同系列 2/4 件觸發；**有 1 件效果特例（Mizutsune/Zoh Shia 系）→ 門檻須資料驅動禁硬編 2/4**。
- **證據**：set 技能 `ranks[].setPiecesRequired`。**全 25 條掃描：無一非 [2,4]**。含
  `Mizutsune's Prowess=[2,4]`、`Zoh Shia's Pulse=[2,4]`、`Gogmapocalypse=[2,4]` 等。
- **定案**：門檻**資料驅動**（每 rank 帶 `setPiecesRequired`），但 **1.041 資料中無任何 1 件（或 3/5 件）特例，
  全部 2/4**。⚠️ **先驗「Mizutsune/Zoh Shia 有 1 件效果特例」未獲 1.041 資料證實，點名**（Mizutsune's Prowess
  與 Zoh Shia's Pulse 實測皆 2/4）。
- **引擎影響**：`computeSetBonusSkills` 沿用門檻表模式、**讀 `setPiecesRequired` 不硬編 2/4**
  （Ascendance-proof 且成本為零）；不需為不存在的 1 件特例預建特殊分支。

## 4. 群組技能

- **先驗**：跨系列共享 group，任 3 件觸發；與 set bonus 並存互不干擾；一件防具可同時屬 set 與 group。
- **證據**：group 技能 17 條，`setPiecesRequired` **全 [3]** 恆定（`Guardian's Protection/Lord's Favor/
  Scale Layering/Flexible Leathercraft/Imparted Wisdom`）。防具件 `Conga Helm α` 同時帶 armor 技能
  + `Fortifying Pelt(kind:group, setPiecesRequired:3)` → **一件同時屬防具技能 + group** 實例成立。
- **定案**：group 門檻恆 3；與 set 為**獨立軸**（skill.kind 區分）。
- **引擎影響**：雙軌統計（`setBonusId` + `groupId`）；equipment-pools 相關度裁切須給 group 價值件虛擬技能
  評分（比照 Phase 3 教訓防裁切剪掉）。

## 5. 護石（混合制）

- **先驗**：可生產清單（可升級）+ RNG 鑑定護石（稀有度 5–8、最多 3 技能、洞位帶池歸屬、僅出現有對應珠的技能）。
- **證據**：`charms` 端點兩型——
  - **可生產**（`random:false`，64 系列）：`ranks[]` 升級鏈（如 `Windproof Charm I/II/III`）、每 rank
    `skills[]`(固定) + `crafting.materials`。
  - **RNG**（`random:true`，4 筆）：`Unknown Charm(r5)/Historical(r6)/Secret(r7)/Golden Age(r8)`，
    `skills:[]`（鑑定時隨機、資料不列技能池）。
- **定案**：混合制成立。**RNG 護石的技能池在 mhdb 未結構化**（skills 空）→ app 走**使用者護石庫輸入**
  （Rise 式）。使用者護石項最小欄位集：`{ skills:[{skillId, level}], slots:[{level, pool:'weapon'|'armor'}], rarity }`
  （洞位帶池歸屬，因 Wilds 護石洞也分武/防池）。
- **引擎影響**：`charmMode` 新混合模式＝固定可生產清單進池（資料選單）+ 使用者護石庫（含池別洞位）；
  buildCharmPool = 清單 + 使用者庫。

## 6. 雙武器攜行

- **先驗**：主/副武器（Seikret 切換）；v1 只搜主武器。
- **證據**：`weapons` 每把為獨立條目，無主/副綁定欄位；搜尋起點為單一選定武器。
- **定案**：**v1 只搜主武器無資料層障礙**（裁決維持，避免搜尋空間平方化）。不深挖。

## 7. Artian 武器

- **先驗**：終盤隨機強化；照慣例簡化輸入結果值。
- **證據**：`name like %Artian%` → 28 把（`Artian Sight I/II`(bow)、`Artian Defender I/II`(CB)、`Artian Edges`(DB)…），
  rarity 6–7、`slots[2,2,2]`、`skills:[]`。隨機強化槽/賦予值**不在資料**。
- **定案**：Artian 以基礎形態收錄；隨機強化不建模 → **簡化輸入 delta**（比照覺醒/客製強化：輸入結果值、
  不模擬取得）。
- **引擎影響**：Phase 5 Artian 簡化輸入 UI（攻擊/會心/屬性/洞 delta，套武器淺拷貝）。

## 8. 位階

- **先驗**：下位/上位皆存在，無 M 位（Ascendance 才有）。
- **證據**：防具 `rank` 欄 = `high`(582) / `low`(132)，**無 master**。γ 系列（`Rey Sandhelm γ` r8, rank high）
  為上位 Arch-tempered 獎勵，歸 high。α/β/γ 於 name 後綴。
- **定案**：位階＝`rank`(low|high)，無 MR。γ 屬上位。
- **引擎影響**：推薦配裝分區依來源實測收斂，**不建幽靈分類**（尾巴 A 教訓）；rank 直接用資料欄。

## 9. 洞位 / rarity / 斬味結構

- **先驗**：未逐項查證，Phase 0 資料層定案（數值模型是 Phase 4）。
- **證據**：
  - **洞位**：armor/weapon/deco `slots` 等級**皆 1–3**（無 lv4）。armor slots 為陣列（如 [1]）、
    weapon slots 陣列（如 []／[2,2,2]）、deco slot 單值。
  - **rarity**：armor 1–8、weapon 1–8、deco 3–7。
  - **斬味**：weapon `sharpness` = **7 色帶** `{red,orange,yellow,green,blue,white,purple}` 各長度值；
    另有獨立 `handicraft[]` 陣列（如 `[5]`，匠系資料表達）。
- **定案**：斬味資料形狀＝7 色帶長度 + `handicraft` 欄位；**匠系技能行為的數值模型留待 Phase 4 考證**
  （`docs/wilds-sharpness-audit.md`，禁憑記憶沿用前兩代）。此處只記形狀。
- **引擎影響**：`Slot` 上限 3；`Weapon.sharpness` 7 色帶 + handicraft；efr-wilds 斬味模型 Phase 4 定。

---

## 定案總表（先驗 vs 實測）

| # | 機制 | 先驗是否成立 | 關鍵定案 |
|---|---|---|---|
| 1 | 技能分家 | ✅ | `skill.kind` 資料驅動（armor/weapon/group/set） |
| 2 | 珠雙池 | ✅ | `decoration.kind`；slot 1–3、複合珠 173 |
| 3 | set 門檻 | ⚠️ 部分 | 門檻資料驅動；**但無 1 件特例，全 2/4**（Mizutsune/Zoh Shia 皆 2/4） |
| 4 | 群組技能 | ✅ | group 門檻恆 3；一件可同屬 set+group |
| 5 | 護石混合 | ✅ | 可生產 + RNG(random 旗標)；**RNG 技能池未結構化 → 使用者庫輸入** |
| 6 | 雙武器 | ✅ | v1 只搜主武器，無資料障礙 |
| 7 | Artian | ✅ | 基礎形態收錄；隨機強化簡化 delta 輸入 |
| 8 | 位階 | ✅ | `rank` low/high，無 MR；γ 屬上位 |
| 9 | 洞位/rarity/斬味 | ✅（形狀） | slot 1–3、rarity 1–8、斬味 7 色帶 + handicraft；數值模型 Phase 4 |
