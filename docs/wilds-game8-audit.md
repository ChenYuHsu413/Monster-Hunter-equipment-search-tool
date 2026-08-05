# wilds-game8-audit.md — MH Wilds 推薦配裝來源調查與匯入（Phase 6 / 6b）

> **狀態**：Phase 6 / 6b（+§3b Phase Z achievability）｜結案版本 `wilds-v1`（@ `40e25c4`）｜**本文件含後續翻案加註**：
> §3★ achievability「exact 12」→三層可歸因（§3b）；§6② Game8「JS-render-gated」→靜態 `fetch()`；§6③ 快取 gitignore→進版控。
> 產出日期：2026-08-03。方法參照 `docs/world-game8-audit.md`（尾巴 A），但**分區不照抄 World，以實測收斂**。
> 本檔隨進度更新。**尾巴 W-F（2026-08-05）換源 game8.co→game8.jp，見下方 §W-F。**

---

## §W-F 推薦來源重建：game8.co（英文）→ game8.jp（日文）（2026-08-05）

> 本節記錄換源的**定性、覆蓋對照、裁決**。原 Phase 6/6b 記載（英文站）不刪，作為換源前的歷史狀態。
> **紀律（使用者裁決 #1）**：量與質的權衡如實寫，不迎合任務原述把它改寫成「覆蓋問題」。

### §W-F.1 偏差定性（兩點任務前提經實測，一部分反轉）

任務前提定性為「Phase 6 誤用英文 game8.co、偏差源頭在計畫層 prompt 未指明」。逐點查證：

- **前例（部分不實）**：任務述「Rise/World 前計畫來源皆為 game8.jp」。實測——
  - **Rise ✓ JP**：`scripts/game8-sources.json` 全部 `game8.jp/mhrise/*`（初代，JP 前例成立）。
  - **World ✗ EN**：`scripts/world/scrape-game8-mhwi.mjs` 檔頭明載「來源＝game8.co MHW」。
  - **修正定性**：JP 前例來自 **Rise（初代）**；**World 才是第一個改用英文站的**，Wilds 沿用 World 的
    英文選擇。「計畫層未指明來源導致沿用英文」的定性成立，但**不是「World 也用 JP」**。
- **現源 genuine（非造假，只是選錯站）**：抽驗 2 個現源 URL——`archives/502430`（GS，923 KB、
  title `Best Great Sword Builds for High Rank`）、`archives/503042`（bow，1.0 MB）皆 200 真頁。
  現行 173 筆為真實 game8.co 擷取，非捏造。**問題純是選錯站（英文而非日文原站）。**

### §W-F.2 覆蓋對照表（實測，推翻任務「覆蓋遠遜」前提）

從 hub `game8.jp/mhwilds/673589`（全武器種の最強装備・おすすめ装備まとめ）逐一實抓 14 武種三分頁，
以 `武器｜装飾品` 表為 build 訊號機械計數（排除「ユーザーが投稿した」使用者投稿區）：

| 來源 | 終盤（最強／endgame） | 高階（上位／highRank） | 進度（序盤／progression） | **合計** |
|---|---|---|---|---|
| **EN game8.co（現行）** | 96 | 38 | 39 | **173**（Artian 141＝81%） |
| **JP game8.jp** | 59 | 40 | 0＊ | **99** |

＊JP「序盤おすすめ装備（下位）」頁是**散文式武器養成攻略**（`武器｜武器スキル／スロット` 升級表 +
防具進度建議），**非結構化三表 full-build** → 0 筆可匯。與現行 `wildsLowRank` defer 同性質。

**結論（據實，不迎合原述）**：**筆數層面 EN 173 > JP 99（EN 多約 75%）**，使用者原述「英文站 build
覆蓋遠遜日文原站」**在筆數上經實測反向**。EN 的 173 筆中 141（81%）為 Artian 變體近似複本。

### §W-F.3 換源裁決（使用者 方案 1，理由改為保真度而非覆蓋）

覆蓋前提反轉後，換源理由**改立於質與一致性**（非覆蓋）：

1. **保真度**：JP 原生詞彙**直通 mhdb ja locale**（免英文有損轉譯）。實測 GS `hm_1` 全 32 實體
   （weapon 1／armor 5／deco 10／charm 1／skill 15）以「NFKC 正規化 + 去括號後綴」對 mhdb ja
   **100% 命中**——含 Artian 武器（忘却のオストランツァ）、Gogmazios 借用件（ゴグアームα）、
   限界突破強化後綴件（護雷顎竜コイルβ）。
2. **技能表可靠性**：JP `武器スキル／防具スキル／シリーズスキル・グループスキル` 三段是**完整可拆解**
   總表；而 Phase Z 已證 **EN skillTotals 是不可靠人工摘要**（雙向與其自列裝備不符）。換 JP 後
   §3b 三層驗證的 (c) 層有機會從「摘要噪音刻畫」**升級為真對照層**（見 §W-F 續，Phase 5 實跑後補）。
3. **護石池別標註**：JP 生產護石列直接標 `武①防①防①`（武器池／防具池洞），**直對 Wilds 珠雙池機制**。
4. **前例一致**：Rise（初代）用 game8.jp；換源使三遊戲回到初代 JP 前例（World 的 EN 為當時的偏離）。
5. **使用者裁決**：覆蓋反轉後仍取質重於量（本輪 W-F 開工 DECISION GATE，使用者選方案 1）。

**權衡如實記載**：換源**以 74 筆覆蓋換取保真度 + 映射乾淨度 + 技能可靠度 + 前例一致**。非覆蓋升級。

### §W-F.4 game8.jp 結構調查（實測收斂，Phase 2）

**頁面族（每武種三分頁，實測）**：
- **最強装備（終盤／Meta）**：build 為 h3（`hm_N`）＋部分 h4（`hs_N`）變體；每 build 三表
  `武器｜装飾品` → `防具｜スロット｜装飾品` → `武器スキル／防具スキル／シリーズスキル・グループスキル`。
- **上位おすすめ装備（HR9〜39 進度）**：build 為 **h2（`hl_N`）**＋ h4（`hs_N`）說明（heading level 與最強頁不同，
  抽取器不靠 heading level 分 build，改以 `武器｜装飾品` 表訊號切段）。三表結構同最強頁。
- **序盤おすすめ装備（下位／Low Rank）**：**散文式武器養成攻略**（`武器｜武器スキル／スロット` 升級表 +
  防具進度建議），**非結構化 full-build → 本輪 defer**（`wildsLowRank`，同現行 defer；來源存在、如實記載）。

**14 武種 URL 表（provenance 逐一實抓，禁猜編號）**：`最強` 由 hub `/mhwilds/673589`
（「全武器種の最強装備・おすすめ装備まとめ」）內各武種連結取得；`上位`／`序盤` 由**各武種最強頁**內
「上位おすすめ装備」／「序盤おすすめ装備」連結取得。全頁 `更新日：2026.08.05`。

| 武器 | 最強(hub) | 上位(最強頁連結) | 序盤(defer) | | 武器 | 最強 | 上位 | 序盤 |
|---|---|---|---|---|---|---|---|---|
| great-sword | 668362 | 675622 | 671152 | | switch-axe | 668370 | 675619 | 671156 |
| long-sword | 668363 | 675623 | 670753 | | charge-blade | 668371 | 675628 | 671157 |
| sword-shield | 668364 | 675620 | 670723 | | insect-glaive | 668372 | 675629 | 670773 |
| dual-blades | 668365 | 675621 | 671153 | | bow | 668373 | 675630 | 671160 |
| hammer | 668366 | 675624 | 671154 | | light-bowgun | 668374 | 675631 | 671158 |
| hunting-horn | 668367 | 675625 | 671155 | | heavy-bowgun | 668375 | 675632 | 672429 |
| lance | 668368 | 675626 | 670780 | | | | | |
| gunlance | 670772 | 675627 | 672571 | | | | | |

（註：最強頁編號 668362–668375 連號但**跳過 668369**；gunlance 最強實為 `670772`〔hub 連結取得〕，
668369 疑為舊 gunlance 頁重導。switch-axe＝668370。以 hub 實連結為準，不硬套連號。）

**每分頁 build 數（實測，排除ユーザー投稿區）**：

| 武器 | 最強 | 上位 | | 武器 | 最強 | 上位 |
|---|---|---|---|---|---|---|
| great-sword | 4 | 4 | | switch-axe | 4 | 3 |
| long-sword | 4 | 2 | | charge-blade | 4 | 3 |
| sword-shield | 4 | 1 | | insect-glaive | 4 | 3 |
| dual-blades | 3 | 3 | | bow | 3 | 6 |
| hammer | 5 | 3 | | light-bowgun | 5 | 1 |
| hunting-horn | 3 | 2 | | heavy-bowgun | 4 | 1 |
| lance | 7 | 2 | | **合計** | **59** | **40** |

**分區收斂（照 JP 實測結構，不硬湊 EN 三分區，使用者裁決 #3）**：JP 僅 **2 個 editorial 層**（最強＋上位）。
映射到現有 3 分區 enum（HR 區間對齊，**零 label 改動**）：
- **`wildsEndgame`（畢業裝 HR100+ Meta）← 最強装備**（59）：終盤 Meta，區間對齊。
- **`wildsProgression`（進度拓荒裝 HR9–36）← 上位おすすめ装備**（40）：JP 上位 builds 標題實測 HR9〜19／
  HR20〜39，**語意即高難度前的進度拓荒**（非「次強 endgame」），區間對齊 HR9–36。
- **`wildsHighRank`（上位裝 HR50+）← 無 JP 對應層**（0）：JP 結構自 上位(HR〜39) 直跳 最強(終盤)，
  無獨立 HR50+ 層。UI 已 `.filter(builds.length>0)` 自動隱藏空分區（`RecommendedView.tsx:232`），零改動。
- 序盤 → `wildsLowRank`（defer）。

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
- **Phase 6b 定案：N=4**（`WILDS_CORE_SKILL_COUNT`）。實測（`validate-wilds-builds.mjs`）：
  endgame top-N 跑搜尋 **N=4 → 12/12 有結果**、N=5 → 10/12、N≥6 遞減；highRank N=4/5/6 → 11/12。
  技能數分佈 endgame 眾數 13–15。**取 importability 最優的 N=4**（同 Rise「匯入必有結果」優先原則；
  Wilds 珠密度高，N 過大會過度約束搜尋）。extractCoreSkills 排序沿用 `selectWorldCoreSkillRows`
  （game-agnostic）：ratio（等級÷上限）→ 等級 → 原順序（Wilds 無 Game8 紅字標記，故無 required 首鍵）。

## §2b 映射 + 匯入結果（Phase 6b，`import-game8-mhwd.mjs`）

- **映射統計**：實體 **2175 / 直通 2175（100%）/ 屬性佔位 38 / 真缺 0**。`game8-en-overrides.json`
  **空**（無需 override）。映射鍵：防具/武器＝`{armors,weapons}.json` nameEn；珠/護石＝mhdb en
  locale（`.cache/*.en.json` 的 id → wd_/wc_，與 committed 資料 0 漂移，已驗全 id 可解）；技能＝
  skills.json nameEn→繁中。屬性佔位（Elemental Attack 等 38 筆）＝Game8 泛稱屬性珠，標 placeholder。
- **產出**：`src/data/wilds/recommended-builds.json` **173 build**（endgame 96 / highRank 38 /
  progression 39；Artian 141），每筆 `metaVersion:"1.041"`；**連跑兩次逐位元一致**。schema 對齊 World
  （weapons/armor/charm/buildDecorations/skillTotals/unmodeled），Artian → `unmodeled.artian`。
- **clamp**：skillTotals 逐級 clamp 到靜態 skillMax（Wilds `secretSkills:false`，無動態上限 → 不虛構
  secret；set/group 由防具件數表達）。

## §3 achievability 重算 + EFR sanity（`validate-wilds-builds.mjs`，World 179 方法）

> ★ **Phase Z 抽查翻案（保留原記載、加註，比照 attack display→raw 留痕慣例）**：下方原「exact
> 12 / off Artian 135 / 非 Artian 26」把兩件事混為一談——「我方能否忠實重現裝備並正確計算」vs
> 「Game8 skillTotals 是否為其自列裝備的忠實加總」。Phase Z 機械抽查證實**後者不成立**：Game8 總表
> 是人工摘要，**雙向**與其自列裝備不符（漏列武器內建/元素技；偶爾等級與自列珠不符）。故 achievability
> 不可用單一 exact 率表述。**正解見下方 §3b 三層分析**（(a)+(b) 為我方保證、(c) 為對照噪音刻畫）。

- **重算 vs Game8（±1 容忍）**：exact **Artian 6/141、非 Artian 6/32、合計 12/173**。off 分兩類：
  - **Artian 135**：Artian 武器隨機 roll（set skill / group skill / focus / 攻擊強化）**不在資料**
    → 重算 < Game8。**這是 Wilds 版的「World 覺醒未模擬」**；占比高（meta 78% 用 Artian）是 Wilds
    生態特性，非資料錯（Phase 5 已定「Artian 簡化輸入、不逐能力模擬」）。
  - **非 Artian 26**：小幅邊際差（多 1 技能差 2–3 級），源自武器內建技超出 mhdb 記載、Game8「Armor
    Decorations」總表偶有省略等——**與 World 自身 26 套「其他」off 同級同因**（珠位/防具欄邊際差）。
  - recompute 邏輯正確性：以 Bale Dahaad 手驗 **13/14 吻合**（唯一缺項為 Artian roll 的逆襲）背書。
- **Gogmazios 借用件（§3.1 點名）**：29 套用 Gogmazios 件。借用件 `setBonusId=wsb_178`（原生
  Gogmapocalypse）+ `extraSetBonusIds`（如 wsb_25），recompute 對主 set 與每個 extra **各 +1 件
  （聯集）**計數，借用 set 門檻可達；由 `smoke-wilds.mjs` ⑦/⑦b 逐位元背書。
- **EFR 排序 sanity（§3.2）**：4 武種（bow/charge-blade/dual-blades/great-sword）以 endgame 核心
  技能搜尋，結果皆 **EFR 降冪、首位非平凡**（top efr GS 2506 / CB 1809 / DB 1025 / bow 195）。4/4 通過。

## §3b achievability 三層可歸因分析（Phase Z 重構，`validate-wilds-builds.mjs`）

把「exact vs off」拆成三層，**我方保證＝(a)+(b)**，(c) 為對照噪音源的誠實刻畫（非我方達成率）：

- **(a) 裝備層重現**：build 列出的防具/武器/珠/護石全對到 DB 實體（id 級）。**173/173（100%）**。
- **(b) 引擎自洽**：對「該套實際裝備」，**真實引擎函式**（`skill-calculator` 的 `calculateSkills` /
  `computeSetBonusSkills` / `computeGroupSkills` / `clampSkillsToMax`）算出的技能，與各件裝備資料的
  獨立加總**逐位元一致**。**173/173（100%）** → 引擎對已知裝備計算正確、無我方 bug。**(a)+(b) 即
  「忠實重現裝備並正確計算」的硬保證。**
- **(c) Game8 skillTotals 偏差**：引擎自洽值 vs Game8 宣稱（±1 容忍），**按方向分類**。**11/173** 兩者
  ±1 全合；其餘的差異**雙向**且逐項歸因：
  - **引擎多算（Game8 摘要漏列其自列裝備提供的技能）**：set/group 名 15（Game8 列 groupSetSkills
    顯示、不入 skillTotals）／元素技（屬性攻擊強化・會心擊【屬性】）49／武器內建技 21／其他 24。
  - **引擎少算（Game8 宣稱較多）**：Artian roll 未模擬 **259 技能實例**（主體）／非 Artian **41 實例**
    （我方 mhdb 武器資料缺內建技、或 Game8 摘要與其自列裝備不一致；如 `great-sword_wildsHighRank_0`
    火場怪力 4 在其自列 Bale 裝備無來源）。
  - **關鍵結論**：Game8 `skillTotals` 是**人工摘要參考值，非其所列裝備的忠實加總**；故它不是乾淨的逐級
    對照基準。我方推薦資料（裝備/珠/護石）本身正確（(a)+(b) 背書），差異全在此摘要噪音。
- **Gogmazios 借用件**：29 套；`computeSetBonusSkills` 對 `setBonusId`+`extraSetBonusIds` 聯集計數
  （smoke-wilds ⑦/⑦b 背書）。**N=4**（endgame top-4 → 12/12 有結果）。**EFR sanity 4/4** 降冪。

## §5 進度與續跑（快取固化，跨輪）

- **Phase 6 前半完成**：§2 調查、分區收斂、爬取方法 + 抽取器、GS 頁快取。
- **Phase 6b 完成（本輪）**：全 14 頁 fetch → 靜態表抽取 → `.cache/game8/*.json`（173 完整 build，
  進版控）；URL 補齊、不完整分類、版號合規（見上）。
- **續行（本輪 §2 起）**：`import-game8` EN→id 映射 → clamp 動態上限（set/group/extraSetBonusIds
  聯集）→ 每筆 `metaVersion:"1.041"` → 產出 `src/data/wilds/recommended-builds.json` →
  achievability 重算（World 179 標準）→ UI tab。
