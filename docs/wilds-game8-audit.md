# wilds-game8-audit.md — MH Wilds 推薦配裝來源調查與匯入（Phase 6 / 6b）

> 產出日期：2026-08-03。方法參照 `docs/world-game8-audit.md`（尾巴 A），但**分區不照抄 World，以實測收斂**。
> 本檔隨進度更新。

## Phase 6b 續跑（2026-08-03）— 快取遺失事件、方法修正、版控修正

**① 快取遺失事件（開工驗上一手）**：Phase 6 前半的 Game8 抽取快取產於上一手機器
（`C:\Users\jolen\…`），因 `.cache/game8/` 被 gitignore、**未進 repo**；本輪機器（`D:\ChenYu\MH`）
pull 後快取不存在、亦無備份。依 Phase 6b §0.3「快取遺失即停手回報、不默默重爬」停手回報，經使用者
裁決**方案 2（本機重新擷取）**續行：從一手來源（game8.co）重新取得、記新 `scrapedAt=2026-08-03`
（與原擷取同一時間窗）、每頁核 Ver 1.041——非硬湊，§0.3 凍結保護的是 provenance 與管線決定性，二者
以「進版控 + 版號核對」達成。

**② 方法修正（實測翻案）**：Phase 6 前半 audit（下方 §3）記「Game8 build 頁為 JS 渲染、需瀏覽器
console 抽取」。Phase 6b 實測 `fetch()` GS 頁得 **923 KB 靜態 HTML**，build 三表（Best Weapon /
Armor Loadout / Skill Summary）**全在初始 HTML**（React 摘要表另有 fallback 靜態表）。故改用與 World
`scrape-game8-mhwi.mjs` 同款「fetch → 靜態表解析 → 快取」**可重跑**管線（`scrape-game8-mhwd.mjs`
重寫），取代半自動瀏覽器抽取——更忠於「重跑安全、只改腳本不手改產出」。

**③ 快取版控修正（推翻 Phase 6 前半的 gitignore 裁決）**：`.cache/game8/*.json`（Game8 **抽取
結果**）改為**進版控**（`.gitignore` 改 `scripts/wilds/.cache/*` + `!…/game8/`）。理由：(a) 單副本
風險已實際發生（跨機開發是本專案常態）；(b) 進 repo 後 provenance 隨 git 歷史留痕，「首抓固化」由
版控強制，比 gitignore+本機更忠於原設計意圖；(c) 內容為結構化事實性遊戲資料，與最終 commit 的
`recommended-builds.json` 同性質。原始 HTML（`.cache/html/`，大、可重抓）續 gitignore。

## §2 Game8 Wilds 來源調查（先調查後匯入，不預設分區）

### 結構（實測）

- **逐武器 build 頁**：14 武器各一頁「Best <Weapon> Builds for High Rank」。Phase 6b 由 GS 頁
  「All Weapon Builds」區塊站內交叉補齊 7 個待補 URL，全 14 頁 archives id（★=前半已知、互證一致）：
  | 武器 | archives | | 武器 | archives |
  |---|---|---|---|---|
  | great-sword | 502430 ★ | | switch-axe | 502864 |
  | long-sword | 502435 | | charge-blade | 503022 |
  | sword-shield | 503090 ★ | | insect-glaive | 502439 ★ |
  | dual-blades | 501198 | | bow | 503042 ★ |
  | hammer | 502505 ★ | | light-bowgun | 502870 |
  | hunting-horn | 502508 ★ | | heavy-bowgun | 502810 |
  | lance | 503092 | | gunlance | 503030 ★ |

### 各頁筆數（Phase 6b 全量，scrapedAt 2026-08-03，快取指紋）

175 個 build 區塊 h3 → **173 完整 build**（其中 **141 用 Artian 武器 = 81%**）+ 2 非配裝段（見下分類）：

| 武器 | builds | 完整 | | 武器 | builds | 完整 |
|---|---|---|---|---|---|---|
| great-sword | 13 | 13 | | switch-axe | 15 | 15 |
| long-sword | 12 | 11 | | charge-blade | 12 | 12 |
| sword-shield | 11 | 11 | | insect-glaive | 13 | 13 |
| dual-blades | 14 | 14 | | bow | 11 | 11 |
| hammer | 11 | 11 | | light-bowgun | 13 | 13 |
| hunting-horn | 11 | 11 | | heavy-bowgun | 12 | 12 |
| lance | 13 | 13 | | gunlance | 14 | 13 |

### 不完整筆分類（§1.2 紀律，逐筆判定）

- **(a) Game8 未提供 build**（如實排除，記 `excludeReason:"a:non-build-section"`）：
  `gunlance / Build Playstyle and Combos`、`long-sword / Build Playstyle and Combos`——兩者為 build
  分區 h2 下的**導覽/連段段落**（armor=0 skills=0 weapon=null），非配裝，排除。
- **(b) 抽取器漏抽 → 修抽取器重抽**（本輪修復，全數救回）：
  1. **複數"Builds"分區標頭**：long-sword/hunting-horn 部分頁 h2 作 `Endgame High Rank **Builds**
     (HR 100++)`（複數），原 regex 只認單數 → 漏 9 筆。修 `High Rank Builds?`。
  2. **技能總表標頭變體**：hammer `Sleep Critical Hammer` 用 `Build Skill List`（非 Weapon/Armor
     Skills 雙軌）；heavy-bowgun `Agitated Max Burst HBG` 用 Game8 錯字 `Weapons Skills`（複數）。
     修 `classifyTable`／`parseSkillSummary` 容錯。

### 版號合規

全 14 頁 HTML 皆含 **Ver 1.041** 標記、**零** TU5／Abyssal（抽取器逐 build 段掃 `TU5|Abyssal`
即警告，全程無警告）。與 pin `dataVersion 1.041` 一致。
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

- **Phase 6 前半完成**：§2 調查、分區收斂、爬取方法 + 抽取器、GS 頁快取。
- **Phase 6b 完成（本輪）**：全 14 頁 fetch → 靜態表抽取 → `.cache/game8/*.json`（173 完整 build，
  進版控）；URL 補齊、不完整分類、版號合規（見上）。
- **續行（本輪 §2 起）**：`import-game8` EN→id 映射 → clamp 動態上限（set/group/extraSetBonusIds
  聯集）→ 每筆 `metaVersion:"1.041"` → 產出 `src/data/wilds/recommended-builds.json` →
  achievability 重算（World 179 標準）→ UI tab。
