# Monster Hunter 多遊戲配裝搜尋器 · MH Multi-Game Build Finder

以**技能條件 + 武器選擇**驅動的《Monster Hunter》配裝搜尋工具，目前支援三款遊戲：

- **Rise: Sunbreak**（破曉，TU5 / Ver16 資料，已停更凍結）
- **World: Iceborne**（最終版 15.2x 資料，已停更凍結）
- **Wilds**（荒野，基礎版最終 **Ver 1.041** 資料，pin 固化）

排名採 **EFR（有效攻擊力／期望傷害）模型**（物理＋屬性）。無後端，資料為本地靜態 JSON，搜尋跑在前端 Web Worker，評分邏輯為純 TypeScript utility（可獨立測試）。

線上網址：**[monster-hunter-rise-equipment-searc.vercel.app](https://monster-hunter-rise-equipment-searc.vercel.app)**（Vercel 部署現值；GitHub repo 為 `Monster-Hunter-equipment-search-tool`）

頂欄可切換三款遊戲（URL `?game=world` / `?game=wilds`；rise 省略）。切換以 per-game 元件重掛載 + localStorage 前綴（rise `mhsb.*` / world `mhwib.*` / wilds `mhwd.*`）隔離，各款狀態互不污染、各自還原。分享連結帶 `gameId`，舊格式連結（無 gameId）視為 rise。

## 這個工具為誰而做

網路上的配裝文九成是畢業裝，剛入坑的玩家根本一件都做不出來。本工具以技能條件驅動搜尋、支援全武器，並保留完整進階控制（固定部位、護石、保留洞位、傀異鍊成／武器強化），從拓荒到畢業各階段都能用。

## 三遊戲能力對照

以下數字皆對照 repo 內資料檔（`src/data/<game>/*.json`）與稽核文件（`docs/*.md`）逐一核對。

| 能力 | Rise: Sunbreak | World: Iceborne | Wilds（Ver 1.041） |
|---|---|---|---|
| 防具 | 1591 件（RARE1–10，含防禦與五屬性耐性） | 1595 件 | 714 件 |
| 武器 | 3953 把（14 類，含斬味 base/max） | 3544 把（rarity→12，含 Fatalis／Alatreon／Safi） | 1188 把（14 類；含 28 把 Artian 基底） |
| 裝飾珠 | 244 顆（243 Kiranico 匯入 + 1 手工合成珠） | 404 顆（其中**複合珠 234**：Lv4 雙技能各 Lv1） | 361 顆（**珠雙池**：武器池 295／防具池 66；**複合珠 173**） |
| 技能 | 147 個（含上限、特殊標記） | 178 個（含 12 個 secret 極意技能） | 179 個（**分武器系 66／防具系 71**，與珠雙池對應） |
| 護石 | **隨機護石**：使用者護石庫輸入（存多顆、套用、去重、刪除） | **固定可生產清單**：資料選單（可固定一顆／排除若干顆） | **混合制**：183 逐級可生產護石自動進候選池 ＋ RNG 護石庫（使用者輸入，**逐洞池別**正確性） |
| Set / group bonus | —（Rise 無防具 set bonus 機制） | **69 組** set，2/3/4/5 件門檻動態觸發 | **25 組 set（2/4 件）＋ 17 組 group（3 件）雙軌**獨立觸發 |
| 多套裝件 | — | —（單一 setBonusId） | **Gogmazios 擬態**：`setBonusId` + `extraSetBonusIds` 件數**聯集**計數（借用 set 湊門檻） |
| Secret 動態上限 | — | ○‧極意 / Fatalis Inheritance 觸發後上限提升（挑戰者 5→7，結果卡顯示 7/7） | —（Wilds 無 secret 解放路徑，靜態上限） |
| 複合珠 solver | 珠皆單技能（複合珠 gate 恆空，逐位元不變） | Lv4 雙技能珠支援 + 貪婪失敗後**有界交換後處理**（見「誠實揭露」） | 複合珠 173，沿用同一有界修復 gate（`.skills` ≥2 必要技能時觸發） |
| EFR 模型 | 有效攻擊 × 斬味 × 期望會心 ＋ 屬性 | 同介面；另含 **World 斬味期望倍率模型**（見下） | 同介面 `efr-wilds`；**attack = raw 尺度**（Wilds 顯示即 raw）、斬味 base=匠0 + handicraft 延展 |
| 簡化輸入 | 傀異鍊成（輸入鍊成後技能與洞數） | 武器強化（覺醒／客製強化，僅固定武器；輸入結果值 delta） | **Artian 武器**（隨機強化結果值，不逐能力模擬；結果卡標未模擬旗標） |
| 推薦配裝 | **542 筆**（14 武種 × 6 分類：下位／上位過渡／上位畢業／大師拓荒／大師畢業／推薦武器） | **179 筆四分區**（上位 55／進度拓荒 42／畢業 Meta 69／畢業旗艦 13） | **173 筆三分區**（進度拓荒 39／上位 38／畢業 96；每筆 `metaVersion` 1.041） |

> 「簡化輸入」共通哲學：**輸入結果值、不模擬取得過程**。傀異鍊成／武器強化／Artian 都套用到裝備**淺拷貝**（原資料不動）後進搜尋／EFR。

## 誠實揭露（EFR 為近似模型，不是傷害計算機）

沿用並整併既有揭露，這些是刻意記錄的已知限制：

### EFR 近似（共通）
- **弱點特效**：假設已軟化／傷口計滿（未軟化時偏高估）。
- **屬性值上限（elemental cap）不建模** → 高屬性強化配裝屬性 EFR 偏高（已知高估）。
- **條件技觸發率**統一 `CONDITIONAL_UPTIME = 0.75`，可隨實測手感微調。
- **會心擊【屬性】倍率依武器種**（GS／鎚／笛／重弩較高，來源 Fextralife／社群傷害公式）。
- 尚未建模的 raw 乘數技能（寒氣鍊成／業鎧【修羅】等）；死裡逃生（World=Resuscitate）為迴避無傷害，不計入 EFR。

### World 斬味期望倍率模型
- EFR 取色帶頂端 `EXPECTED_SHARPNESS_USE=60` 單位、依落入各色段長度**加權平均**倍率（非只取最高色）；故 base 已達最高色的武器（如 Fatalis 薄紫）匠愈高 → 頂端高色段愈厚 → 物理 EFR 單調上升。
- **仍未建模**：打鬥中斬味耗損下滑、剃刀銳利／砥石類技能。斬味語意經考證修正（單列＝匠5 maxed，見 `docs/world-sharpness-audit.md`）。

### 複合珠 solver 為有界局部搜尋，非全域最佳
- 主流程仍為逐技能貪婪；**貪婪失敗且候選珠含覆蓋 ≥2 必要技能之複合珠時**，追加有界局部搜尋（偏好單珠 alt + 複合珠 seed，深度 ≤2），只採用字典序（必要技能滿足數, 保留洞位, 剩餘洞位）**嚴格更優**者，平手不換 → 決定性、絕不退化，效能增幅實測 +16%（≤30%）。
- 修復的是兩類次優：(E) 貪婪過度搶大洞給複合珠、餓死大洞技能；(F) 多複合珠並存時短視選錯首顆。**Rise 珠全單技能 → gate 恆空、逐位元不變**（由回歸背書）。

### 中文名 EN-fallback（World）
- 顯示層 zh 名 EN-fallback，其中經 Kiranico 分頁補齊後**仍確認真缺 27 筆**（charms 14 / decorations 7 / skills 6，Kiranico World 亦無 zh），留 EN 不硬翻，逐筆有據（見 `docs/world-data-source-audit.md`）。不影響 setBonusId 連結與 set bonus 機能。

### Wilds EFR 近似（v1）
- **attack = raw 尺度**：Wilds 顯示攻擊即 raw（與 World「display 需還原 raw」不同），efr-wilds 以 raw 為基數（Phase 4a 翻案，見 `docs/efr-wilds-notes.md`）。
- **斬味期望倍率 `EXPECTED_SHARPNESS_USE = 60` 為佔位常數，N=60 待 Wilds 實測校準、禁當定值**；base=匠0、max=handicraft 延展（見 `docs/wilds-sharpness-audit.md`）。
- **Wilds 特有機制 v1 不建模（明列）**：**傷口（wound）**攻擊加成、**集中模式（Focus Mode）**傷口精準傷害——EFR 為同武器種內相對排序指標，這些對排序影響次要。
- 共通近似同上（弱點計滿、屬性上限不建模、uptime 0.75、斬味打鬥消耗下滑不建模、鈍器能手／達人藝類不建模、會心擊【屬性】社群近似）。
- **Low Rank 推薦配裝 deferred**：Game8 有獨立 Low Rank 頁（來源存在），本輪未匯入，列計畫尾巴候選（`wildsLowRank`）——記載存在但 defer，非虛構分類（見 `docs/wilds-game8-audit.md` §2）。

### Wilds 推薦配裝：資料保證 vs Game8 摘要噪音（重要，勿誤讀為「全驗證」）
- **推薦資料本身的硬保證（`validate-wilds-builds.mjs` 三層分析，Phase Z）**：
  - **(a) 裝備層重現 173/173（100%）**：每筆 build 列出的防具/武器/珠/護石全對到 DB 實體（映射 2175/2175 直通、override 空）。
  - **(b) 引擎自洽 173/173（100%）**：對每套實際裝備，**真實引擎函式**（`skill-calculator`）算出的技能與各件資料獨立加總**逐位元一致**——引擎對已知裝備計算正確。
  - **(a)+(b) 即本工具保證的：忠實重現裝備 ＋ 正確計算技能。**
- **Game8 的 `skillTotals` 是人工編修的摘要參考值，非其所列裝備的忠實加總**：三層分析的 (c) 層顯示兩者差異**雙向**且逐項可歸因——
  - **引擎多算（Game8 摘要漏列其自列裝備提供的技能）**：元素技 49／武器內建 21／set·group 顯示分離 15／其他 24 技能實例。
  - **引擎少算（Game8 宣稱較多）**：**Artian 武器隨機 roll 未模擬 259 技能實例（主體）**／非 Artian 邊際 41（mhdb 武器缺內建技、或 Game8 摘要與其自列裝備不一致）。
  - 僅 **11/173** 套引擎自洽值與 Game8 摘要 ±1 全合——**這不是達成率，而是 Game8 摘要作為對照基準的噪音程度**。
- **UI 揭露**：Artian build（141/173）結果卡標「**此配裝依賴 Artian 武器隨機強化，引擎不模擬**」旗標，匯入搜尋時略過其能力、EFR 會低於 Game8 實際值。

## 技術棧與架構

**Next.js 14（App Router）· TypeScript · Tailwind CSS · shadcn/ui**。無後端、無 DB：遊戲資料是唯讀靜態 JSON（CDN 快取），搜尋在前端 Web Worker 執行（不凍結 UI、可取消）。

多遊戲以 **GameProfile 抽象層**支援：`game-profile.ts`（EFR 模組／features 開關／charmMode／storagePrefix／resolveSkillMax）、`game-data.ts`（`loadGameData(gameId)` 動態 import per-game chunk）、`world-registry.ts`／`wilds-registry.ts`（動態註冊各遊戲 profile）。非 Rise 行為一律 gated by `deps.world`／`deps.wilds`，Rise 路徑逐位元不變（`regression-baseline.mjs --check` 背書）。

**首屏 lazy chunk 策略**：大資料（防具／武器／解放／推薦配裝）與 World／Wilds 引擎皆不進首屏 bundle，改由動態 import 拆成獨立 chunk、掛載後背景載入並快取，首屏 296 kB（`next build` 實測，含 Wilds）。

```
src/
├── types/build.ts          # 核心型別（以 weaponType 字串區分，不寫死特定武器）
├── data/
│   ├── rise/               # Rise 資料：armors / weapons / decorations / skills /
│   │                       #   unlocks / weaponTrees / rampage-* / weaponTypes
│   ├── world/              # World 資料：armors / weapons / decorations / skills /
│   │                       #   charms / setBonuses / recommended-builds / weaponTypes
│   └── wilds/              # Wilds 資料：armors / weapons / decorations / charms /
│                           #   skills / setBonuses / groupSkills / recommended-builds /
│                           #   manifest（pin 1.041）/ weaponTypes
├── lib/
│   ├── game-profile.ts     # 多遊戲抽象：per-game EFR/features/charmMode/storagePrefix
│   ├── game-data.ts        # 大資料延遲載入（per-game 動態 chunk）
│   ├── world-registry.ts   # 動態註冊 World profile + 靜態 + 護石池
│   ├── wilds-registry.ts   # 動態註冊 Wilds profile + set/group + 護石混合池
│   ├── efr.ts              # Rise EFR 傷害模型
│   ├── efr-world.ts        # World EFR（與 efr.ts 同介面 EfrInput/EfrResult）
│   ├── efr-wilds.ts        # Wilds EFR（同介面；attack=raw、斬味 base=匠0+handicraft）
│   ├── decoration-solver.ts# 自動補珠（含複合珠有界修復；Rise/World/Wilds 共用）
│   ├── build-search.ts     # searchBuilds()（依 EFR 綜合值降冪）
│   ├── search.worker.ts    # Web Worker：跑搜尋、不凍結 UI、可取消
│   ├── recommended-builds.ts# 推薦配裝延遲載入與索引（Rise + World + Wilds）
│   ├── builder-import.ts   # 推薦配裝 → 配裝器匯入通道
│   └── ...                 # slot-utils / skill-calculator / suggest-skills / equipment-pools ...
├── components/             # UI 元件（每個獨立、可組合）
└── app/page.tsx            # 主 Dashboard（推薦配裝 + 配裝器）
```

## 版本前提（Wilds）

- **Wilds 資料 pin 於 Ver 1.041**（基礎版最終版），主源 mhdb-wilds（`wilds.mhdb.io`，snapshot 日期 + 全類目筆數指紋固化於 `manifest.json`，重跑決定性）。
- **Ascendance（2027）為已知的未來資料重灌事件**：屆時資料版本跳升、可能重排 id。`docs/PLAN-wilds.md` §A 為其先驗；`scripts/wilds/diff-report.mjs` + `manifest.dataVersion` 為版本漂移的預留 diff 工具（新舊 snapshot 差異報告）。**升級前先驗**：diff-report + manifest 版號 + PLAN §A；池分割解法（珠雙池）依賴「零跨池例外」，Ascendance 若引入跨池珠需重審。

## 開發

```bash
npm run dev     # 開發伺服器（本機 3000；.claude/launch.json 另備 3005/3006）
npm run build   # 生產建置（含 type-check + lint）
npm run start   # 執行生產版本
```

## 開發驗證

改動的正確性靠**逐位元回歸**與**消費端冒煙**背書，不靠記憶：

- **Rise 回歸基準（逐位元）**：`node scripts/regression-baseline.mjs --check` — 10 組場景（固定武器／各武種搜尋／護石／排除／greedy 等）與基準**逐位元一致**，任何搜尋改動後必跑。這是「World 擴充零污染 Rise」的硬底線。
- **World 冒煙**（`scripts/world/`）：`smoke-world.mjs`（搜尋消費端）、`smoke-efr-integration.mjs`（EFR 經 searchBuilds 佈線）、`test-efr-world.mjs`（World EFR 單元）、`smoke-weapon-augment.mjs`（武器強化簡化輸入）、`smoke-cross-session.mjs`（匯入／匠單調／追加洞）。
- **複合珠修復**：`test-decoration-repair.mjs`（E／depth-1／F + 決定性）、`smoke-repair-realdata.mjs`（真實前後對照）、`bench-repair-perf.mjs`（效能量測）。
- **資料稽核**：`audit-world-data.mjs`（World 獨立外部源交叉核對）、`validate-recommended-builds.js` / `validate-mhwi-builds.mjs`（推薦配裝）、`validate-unlocks.mjs`（Rise 解放資料）。

推送閘門制：`regression-baseline.mjs --check`、乾淨 `next build`、`tsc --noEmit` 三綠燈全過方可推。

## Rise 專屬功能細節

- **推薦配裝匯出到配裝器**（`builder-import.ts`）：full-build「以此為基礎修改」＝匯**核心技能 + 護石**，非全表照搬。核心技能取法（`extractCoreSkills`）排序鍵 `紅字優先 → 等級÷maxLevel 比值 → 等級 → Game8 原順序`，取前 **N=4**（由 10 筆隨機畢業裝校準：N=4 時 9/10 有結果、N=6 僅 5/10）。**排除 `special` 技能**（狂化／業鎧【修羅】／狂龍症等，搜尋器不模擬其取得，硬要求必零結果），匯入時整批排除並點名。等級取 `level` 非 `augmentedLevel`（前者為鍊成前基礎值），再 clamp 到 skillMax。
- **解放條件資料**（`unlocks.json`，5544 件全覆蓋）：每件裝備標可製作里程碑與**信心度**（confirmed 4.6% / inferred 85.7% / unverified 9.7%），多為任務星級推導，寧可標「未驗證」也不假裝精確（詳見 [docs/DATA-COVERAGE.md](docs/DATA-COVERAGE.md)）。
- **派生小字提示**：結果卡顯示系列名（最長共同前綴，純文字推導）與階級標籤（村／HR／MR，依稀有度推算，**非精確解放任務**）。來源怪為啟發式推測（名稱優先，否則素材佔比 ≥60%），一律附「（推測）」。
- **簡化版傀異鍊成**：直接輸入鍊成後技能與洞數。**護石庫**：儲存多顆、一鍵套用、去重、刪除（localStorage）。

## World 專屬功能細節

- **set bonus**：2/3/4/5 件門檻觸發（真髓／加護），結果卡顯示觸發狀態（例「銀火龍的真髓 ×4 → 真‧會心擊【屬性】」）。門檻資料驅動，不硬編。
- **secret 動態上限**：○‧極意 / Fatalis Inheritance（全域解放）觸發後上限提升，結果卡顯示分母（挑戰者 **7/7** 而非 7/5）。
- **武器強化簡化輸入**（覺醒／客製強化，僅固定武器）：可填攻擊／會心／屬性／追加洞位（1 個，1–4 級）之 delta，套用到武器淺拷貝；防禦為 display-only。覺醒賦予的套裝技以「虛擬 set bonus +1 件」表達（可讓 3 件門檻用 2 件防具達成，結果卡標「含武器覺醒 +1」）。
- **護石**：固定可生產清單（非 Rise 的使用者護石庫），World 護石排除走獨立 state。

## 資料來源與匯入

**Rise**：防具／武器／裝飾珠／技能為真實破曉 TU5（Ver16）正體中文資料，由 [Kiranico](https://mhrise.kiranico.com/zh-Hant) 匯入。斬味與屬性耐性在列表頁不提供，拆成獨立合併腳本只補對應欄位。破曉已停更、資料凍結，管線以稽核 + 快取固化。

```bash
node scripts/import-kiranico.mjs         # 重新抓取並覆寫 rise/{armors,decorations,skills,weapons}.json
node scripts/add-armor-resistances.mjs   # 只補防具五屬性耐性 elementRes
node scripts/add-weapon-sharpness.mjs    # 只補武器斬味 sharpness（逐武器詳細頁）
node scripts/import-unlocks.mjs          # 解放條件推導 → unlocks.json
```

**World**：主源＝**MHWorldData**（gatheringhallstudios，GitHub raw CSV，**pin commit**、重跑安全），內建繁體中文；交叉核對＝mhw-db.com API（僅非武器）與 Kiranico MH:World（zh 缺漏裁決、斬味語意考證）。產出檔一律機械產生、**絕不手改**，人工裁決進 `zh-name-overrides.json`。

```bash
node scripts/world/fetch-mhwd.mjs        # pin commit 抓 raw CSV 到 .cache
node scripts/world/import-world.mjs      # 產出 src/data/world/*.json（重跑安全）
node scripts/world/build-zh-name-map.mjs # Kiranico id 配對補 zh
node scripts/world/audit-world-data.mjs  # 獨立外部源交叉稽核
```

**Wilds**：主源＝**mhdb-wilds**（`wilds.mhdb.io`，en + zh-Hant 兩 locale，snapshot 日期 + 全類目筆數指紋固化於 `manifest.json`，重跑決定性、pin Ver 1.041）；wilds id 由 mhdb id 派生（`wa_/ww_/wd_/wc_`）。推薦配裝＝Game8 Wilds High Rank 14 頁（`fetch → 靜態表解析 → 抽取結果進版控 .cache/game8/*.json`；原始 HTML 續 gitignore）。產出檔一律機械產生、**絕不手改**。

```bash
node scripts/wilds/fetch-mhdb.mjs            # 抓 mhdb-wilds en+zh locale 到 .cache
node scripts/wilds/import-wilds.mjs          # 產出 src/data/wilds/*.json（重跑安全）
node scripts/wilds/scrape-game8-mhwd.mjs     # Game8 14 頁 fetch → 抽取快取（首抓固化）
node scripts/wilds/import-game8-mhwd.mjs     # 快取 → recommended-builds.json（EN→id 映射）
node scripts/wilds/validate-wilds-builds.mjs # 三層可歸因驗證（(a)裝備重現 (b)引擎自洽 (c)Game8 偏差）
node scripts/wilds/diff-report.mjs           # 版本漂移 diff（Ascendance 升級預留）
```

> 註：早期版本內建「流派 preset」下拉與 `/guide` 新手引導模式，兩者定位與「推薦配裝」頁籤重疊，已移除；配裝主軸回歸「選技能 + 選武器」。搜尋為相關度裁切後的組合搜尋（全 DB 每部位 300+ 件無法暴力枚舉），結果為高品質啟發解，非保證全域最佳。

## 資料致謝

- 遊戲資料來源：[Kiranico](https://mhrise.kiranico.com/)（Rise）、[MHWorldData](https://github.com/gatheringhallstudios/MHWorldData) / [Kiranico MH:World](https://mhworld.kiranico.com/)（World）、[mhdb-wilds](https://wilds.mhdb.io/)（Wilds）。
- 推薦配裝參考自 [Game8](https://game8.co/)（Rise / World / Wilds Builds），並對齊官方譯名。
- 武器／防具部位圖示：[OthelloRhin/MHW_Icons_SVG](https://github.com/OthelloRhin/MHW_Icons_SVG)（MIT License, © 2020 Thibault "Othello" BENOIT）。

本專案為個人非商業用途的配裝工具。《Monster Hunter Rise: Sunbreak》／《Monster Hunter World: Iceborne》／《Monster Hunter Wilds》© CAPCOM。
