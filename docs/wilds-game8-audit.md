# wilds-game8-audit.md — MH Wilds 推薦配裝來源調查與匯入（Phase 6）

> 產出日期：2026-08-03。方法參照 `docs/world-game8-audit.md`（尾巴 A），但**分區不照抄 World，以實測收斂**。
> 本輪採「逐頁瀏覽器渲染進快取（`scripts/wilds/.cache/game8/`）→ 映射 → 重算」的**快取固化**流程
> （取代 WebFetch 摘要失真、可跨輪續跑）；本檔隨進度更新。

## §2 Game8 Wilds 來源調查（先調查後匯入，不預設分區）

### 結構（實測）

- **逐武器 build 頁**：14 武器各一頁「Best <Weapon> Builds for High Rank」。已確認 URL：
  | 武器 | archives | | 武器 | archives |
  |---|---|---|---|---|
  | great-sword | 502430 | | hammer | 502505 |
  | sword-shield | 503090 | | hunting-horn | 502508 |
  | gunlance | 503030 | | bow | 503042 |
  | insect-glaive | 502439 | | （其餘 7 武種待補 URL） | — |
- **每頁分區標題（實測）**：`Endgame High Rank Build (HR 100++)` / `High Rank Build (HR 50++)` /
  `High Rank Build (HR 36++)` / `(HR 21 to HR 35)` / `(HR 9 to HR 20)`。
- **版號**：Ver **1.041**（changelog 至 2026-02-19，與 pin 一致）。
- **假訊息（PLAN §A.3）**：全頁**未見** TU5 / Abyssal；僅提及 Title Update 1 及更早。合規。

### 分區收斂定案（不照抄 World 四分區）

Game8 5 個 HR 層級 → 收斂 **3 分區**：
- `wildsEndgame` ← HR 100++
- `wildsHighRank` ← HR 50++
- `wildsProgression` ← HR 36++ / HR 21–35 / HR 9–20（三個進度層合併）

### Low Rank（獨立分頁，本輪 defer，如實記載——非幽靈分類）

- Game8 GS 頁明載「Low Rank Builds」為**獨立分頁連結**（本 HR 頁只連結、無明細）。
- **存在證據**：頁內 "Low Rank Builds" 區塊 + 外連。**未匯理由**：屬另一爬取範圍（獨立 LR 頁集）。
- 列為**計畫尾巴候選**（`wildsLowRank`）。⚠️ 這是「記載存在但 defer 的來源」，方向與尾巴 A 禁的
  「建來源不存在的幽靈分類」**相反**，合規。

## §3 爬取方法（逐頁瀏覽器渲染 → 快取）

- Game8 build 明細為**結構化表格**（每 build 連續：`Weapon|Rarity|ATK|DEF` → `Weapon Decorations`
  → `Production Bonus`(Artian) → `Armor|Slots|Skills` → `Weapon Skills / Armor Skills` 總表）。
- 抽取器（`scripts/wilds/scrape-game8-mhwd.mjs` 內附、於瀏覽器 console 對已渲染頁執行）產出每 build：
  `{ zone, weaponName, artian, weaponDecos[], armor[], armorDecos[], talisman, skillTotals{}, groupSetSkills[] }`。
- **`skillTotals` ＝ achievability 重算目標**（Game8 頁自帶「Weapon Skills / Armor Skills」總表）。
- 快取固化：`.cache/game8/<weaponType>.json`（含 url + scrapedAt），首抓不覆蓋，映射/重算全吃快取。

### GS 頁佐證（首頁，2026-08-03）

- 抽出 **23 筆**（含 endgame 5 + HR50 多筆 + 進度層）；其中約 **13 筆含完整 armor + skillTotals**
  （其餘為變體/嵌套差異，armor 表在 8-table 視窗外，續輪修抽取器補齊）。
- 範例（可重算目標）：`Bale Dahaad Gore GS`（Ostrak Oblivion Artian）→ skillTotals：Critical Boost 5、
  Agitator 5、Counterstrike 3、Resentment 3、Maximum Might 3…；Talisman：Counter Charm III。
- **含 Gogmazios 借用件**：多筆用 `Gogmazios Vambraces α`（§4 借用件重算特別點名的素材）。

## §4 N 校準（分階匯入 N，Wilds 以來源結構實測定）

- Rise N=4、World N=5。Wilds skillTotals 每筆技能數多（GS endgame ~14–15 個），**N 待以來源結構
  校準**（匯入時取「紅字/定義性技能」前 N，比照 builder-import extractCoreSkills）——續輪定 N 並記理由。

## §5 進度與續跑（快取固化，跨輪）

- **本輪完成**：§2 調查、分區收斂、爬取方法 + 抽取器、GS 頁快取（.cache/game8/great-sword.json）。
- **續跑（下輪）**：其餘 13 武種逐頁渲染進快取 → `import-game8` EN→id 映射（mhdb en + override）
  → clamp 動態上限（set/group/extraSetBonusIds 聯集）→ 每筆 `metaVersion:"1.041"` → 產出
  `src/data/wilds/recommended-builds.json` → achievability 重算（World 179 標準）→ UI tab。
- 快取固化保證：單輪中斷下輪從快取續，無「150 筆重來」風險；WebFetch 失真由逐頁渲染取代。
