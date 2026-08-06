# CLAUDE.md — MHR:Sunbreak 配裝搜尋器 專案記憶

> 本檔是**專案專屬記憶的跨機器載體**。這幾週的教訓原本累積在 `~/.claude/`（使用者層記憶，
> 位於 C 槽、重開機即消失），此處把「與本專案相關、程式碼看不出來的裁決與教訓」蒸餾進版控。
> 通用工程守則在 repo 上層的 `AI Class ChenYu/CLAUDE.md`（clone 本 repo 不會帶走，新機器另備）。
> 詳細記錄見 `~/.claude` 備份與各 `docs/*.md`；本檔只留高價值、每個 session 都該先讀的部分。
>
> **計畫現狀**：Monster Hunter Wilds 擴充**已結案**（Phase 0–5 + 6b 推薦匯入 + Z 收尾），結案 tag
> `wilds-v1`（動工前錨點 `pre-wilds`）。三款遊戲皆完成。裁決見下方 §7。**下一計畫＝Ascendance（2027）
> 資料重灌**，先驗 `docs/PLAN-wilds.md` §A + `scripts/wilds/diff-report.mjs` + `manifest.dataVersion`。

---

## 0. 禁區（不得更動；D 的 Worker 搬移不算改行為）

- `src/lib/efr.ts` 的 `EFR_RELEVANT_SKILLS`。改它必須同步 `build-search.ts` 護石支配剪枝的相關技能集。
- `src/lib/equipment-pools.ts` 的候選集 limit 邏輯（`prunePools` 的每部位件數 + 護石懲罰階梯）。
- 搜尋演算法本體行為（`searchBuilds`）。搬進 Worker 只是搬移，不得改變結果。
  **World 專屬分支一律 gated by `deps.world`**：Rise（`deps.world===undefined`）路徑逐位元不變，
  由 `regression-baseline.mjs --check`（10/10）背書。動 searchBuilds 任何行別後必跑回歸。
- `scripts/` 與 `data/`（頂層）視為唯讀；**例外**：明確授權的資料修正（如 skillMax 稽核）可動
  `scripts/known-max.mjs` + `src/data/*.json`，但要走稽核線、獨立 commit、跑 audit 驗證。
- **`efr-world.ts` 與 `efr.ts` 同介面義務**：兩者共用 `EfrInput`/`EfrResult`（efr-world 直接
  `import type` 自 efr.ts）。改動 EfrResult 形狀、computeEfr 簽章、或斬味 base/max 語意時，
  **兩檔必須同步**，且 World 逐級數值禁憑訓練記憶硬編（機械抽取自 skill_levels.csv，無數字者
  對 Kiranico/社群公式核對並附來源）。`build-search` 依 `deps.world?profile.efr:efr.ts` 選用。

## 1. 資料完整性教訓（踩過坑，最容易重犯）

- **同源資料不可自我盤查**：拿「專案資料 vs 稽核基準」若兩者同源（都來自 import-kiranico、同一條
  regex），等於自己跟自己比，對方自身的缺漏會隱形、結論無效。正解＝用**獨立外部源**交叉核對
  （例：珠子完整性用 Game8 配裝 vs 專案，而非 decorations.json vs Kiranico 快取）。
- **「對不到」先分兩種**：名稱差異（我方名字不同）vs 真的缺（對方根本沒這筆）。鑑別關鍵＝
  **顆數 / 等級收支**（一筆配裝用了幾顆、單顆給幾級，反推該珠是否可能是某個既有珠）。
- **Game8 孔位標註不可信**，需 `skillTotals` 交叉核對。Game8 也會有上游資料錯（如某筆攻擊 Lv8，
  硬上限是 7）——遇到超標先分「Game8 錯」還是「我方 skillMax 錯」。
- **硬編常數表一旦錯一個就全部可疑**：KNOWN_MAX 稽核發現 26 條硬編有 13 條錯（半數）。
  技能真上限用 **Kiranico 技能詳細頁效果表列數**（第一張 table，cell[0]=ＬｖN）機械核對；
  先用已知正確的技能驗證方法 100% 吻合才信。`scripts/audit-known-max.mjs` 已固化此稽核。
- **查證要對「這套裝備」而非「這隻魔物」**：解放門檻誤判多來自「這隻魔物 M5 出現」但「這套裝備是
  傀異克服版 M180」。覆寫樣式必須**收窄**，否則同名前綴造成系統性誤判。
- **重跑安全**：人工判斷全進 override 檔（`data/jp-name-overrides.json` 等），**絕不手改產出檔**
  （Game8/Kiranico 重跑會沖掉）。`import-unlocks.mjs` 重跑會清掉樹傳播條目，
  `derive-weapon-trees.mjs` 必須在其後重跑（`--write`）。

## 2. 關鍵架構裁決（程式碼看不出「為什麼」）

- **推薦配裝匯出到配裝器（四階，見 `src/lib/builder-import.ts` 與 README「推薦配裝匯出」節）**：
  - full-build「以此為基礎修改」＝匯**核心技能 + 護石**，非全表照搬。
  - 核心技能排序鍵：`紅字優先 → 等級÷maxLevel 比值 → 等級 → Game8 原順序`，取前 **N=4**
    （由 10 筆隨機畢業裝校準：N=4 時 9/10 有結果、含 2 筆驗收；N=6 僅 5/10）。
  - **比值排序**而非裸等級：定義性技能常 maxLevel 低（達人藝 1/1、超會心 3/3），裸等級會砍掉它們。
  - **紅字只當優先鍵不當全集**：Game8 `required` 紅字實測只在 2/399 有標，且那兩筆全集 9 項 maxed
    → 全匯反而零結果。
  - **排除 `special` 技能**（`SPECIAL_SKILLS`：狂化/業鎧【修羅】/狂龍症/血氣覺醒等錬成・狂竜化衍生）：
    搜尋器不模擬其取得，硬要求必零結果；匯入時整批排除**並在提示點名**（否則畢業裝條件區近乎空白
    會被誤認壞掉）。
  - **augmentedLevel 欄位語意**：Game8 `Lv4→Lv5` 中 `level=4` 是**錬成前基礎值**（要匯入的）、
    `augmentedLevel=5` 是錬成後總值。照總值匯入會無解。取 `level`，再 clamp 到 skillMax。
  - **reco 護石取代制**：匯入的護石標 `source:"reco"`，每次 full-build 匯入**取代所有舊 reco 護石**
    （＝從這套重新開始，不跨匯入累積），但保留使用者自有護石。
- **搜尋器重構（三階前）**：排除技能＝硬條件（帶該技能的裝備直接踢出候選池，非扣分）；
  結果引擎內固定 EFR total（raw + element×4）降冪，UI 三鍵（EFR/防禦/孔位餘裕）client 重排；
  搜尋條件收斂成單一 `SearchConditions` 物件（`deserializeSearchConditions` 內建 sanitize）。
- **武器派生樹（`derive-weapon-trees.mjs`）**：rarity 重置一律斷樹；升級限定分支根不繼承（保守低估）；
  素材快照皆空＝初始配給武器＝樹根。295 筆可疑邊界待影片抽驗。
- **信心度標註風格**：解放資料用 confirmed / inferred / unverified 三層，不確定寧可標 unverified
  也不假裝精確；自舉推導為上界近似、略保守。

## 3. 環境與管線

- Node（見新機器 `.nvmrc`/package.json engines，若無則用 LTS）；`npm install` → `npm run dev`（3006）/
  `npm run build`。
- 資料管線重跑順序：`build-jp-name-map.js` → `scrape-game8.js` → `validate-recommended-builds.js`。
  皆有磁碟快取（`scripts/.cache` / `.game8-cache` / `.kiranico-cache`，全 gitignore），
  快取在時「重跑零抓取」；快取缺失只是變慢（會禮貌重抓，2.5s 間隔）。
- 破曉 TU5 已停更、資料凍結，故不做 import 時自動抓取的根治，改以稽核 + 快取固化。

## 4. 記憶與備份

- 詳細專案記憶原在 `~/.claude/projects/D--AI-Class-ChenYu-AIClass-MHSB/memory/`（C 槽，5 檔：
  MEMORY.md 索引 + game8-recommended-builds / search-refactor-decisions / weapon-tree-derivation /
  newbie-guided-mode-plan）。已備份至 `D:\claude-backup\`。
- `~/.claude/` 全域 config 版控於 `github.com/ChenYuHsu413/Claude-Config`（memory/projects/sessions
  未追蹤，僅存 C 槽）。
- 新手引導模式（`/guide`）與流派 preset 已於 `f433557`／`d070884` 移除（定位與「推薦配裝」頁籤
  重疊，推薦配裝頁為其替代）；原計畫文件 docs/ROADMAP.md、DATA-COVERAGE.md 仍在（已加移除註記），
  尾巴見 HANDOFF.md。

## 6. World: Iceborne 擴充（多遊戲；Phase 0–5 + 尾巴 A–D 已完成，狀態同 HANDOFF）

> 現狀：尾巴 A（World 推薦分頁，即原 Phase 6）／B（期望斬味倍率）／C（武器強化簡化輸入）／
> D（複合珠 solver 有界修復）四條全落地，錨點 tag `iceborne-v2-tails`（463cee2）。

程式碼看不出「為什麼」的關鍵裁決（詳見 `docs/WORLD-ICEBORNE-EXPANSION-PLAN.md` 與各 audit）：

- **抽象層**：`game-profile.ts`（EFR 模組/features 開關/charmMode/storagePrefix/resolveSkillMax）、
  `game-data.ts`（`loadGameData(gameId)` 動態 import per-game chunk）、`data.ts`
  （`getGameStaticData(gameId)`）、`world-registry.ts`（動態 import 註冊 world profile+靜態+護石池）。
  UI 以 `gameId` prop + `key=gameId` 重掛載切換；`GameIdProvider` context 供深層元件取色表。
- **禁區等價性**：所有 World 行為經 `deps.world` 閘門或資料層差異表達，Rise 路徑零改變（回歸背書）。
  `profile.features` 決定 UI 面板顯隱（不用 gameId 硬判斷）：qurioAugment→傀異、charmMode→護石庫↔選單。
- **localStorage 前綴**：rise `mhsb.*` / world `mhwib.*`，**Rise 既有鍵名一個未動**（老用戶零影響）。
  share-link 帶 gameId，舊格式（無 game）視為 rise。**World 護石排除走 `worldExcludedCharmIds`
  獨立 state**（非 conditions.excludedItems.charmIds——後者不進 share-link deserialize）。
- **斬味語意（考證推翻初判，`docs/world-sharpness-audit.md`）**：MHWorldData `weapon_sharpness`
  單列 ＝ **匠5 maxed**（非匠0 base）；`maxed=TRUE`＝base 已等於 maxed（匠加成 0）、
  `FALSE`＝匠 Lv5 恰 +50（base 由高色端剝 50）。二值建模，無中間值。
- **World 資料重跑順序**：`fetch-mhwd.mjs`（pin commit 抓 raw CSV 到 .cache）→ `import-world.mjs`
  （產出 `src/data/world/*.json`，重跑安全、只改腳本不手改產出）→ `build-zh-name-map.mjs`
  （Kiranico id 配對補 zh）→ `audit-world-data.mjs`（獨立外部源交叉稽核）。
- **首屏 bundle**：world 資料/引擎（efr-world/world-registry/skill-calculator world 分支）維持獨立
  lazy chunk；`BuilderView` 對 `build-search` 改動態 import（僅開發用 parity 對照才載入），
  搜尋引擎移出首屏 → **首屏 291 kB（低於 Phase 1 的 292 基準）**。
- **已知近似**（v1，`docs/efr-world-notes.md`）：斬味 color-only 不計長度、屬性上限不建模（高估）、
  弱點傷口計滿、uptime 0.75、會心擊【屬性】倍率依武器種、zh 100 筆 EN-fallback。
- **PLAN↔實測衝突點名**（實測為準）：真‧龍脈覺醒為 **5 件**門檻（非 PLAN 說的 3；龍脈覺醒才是 3 件）；
  自由搜尋 挑戰者7 可經 Raging Brachydios 挑戰者‧極意(3件) 解放，非只有 Fatalis Inheritance。
- **複合珠 solver 有界修復（尾巴 D，`decoration-solver.ts`）**：`solveDecorations` = 貪婪主體
  （`greedySolve`，逐位元未改）+ **貪婪失敗後**的 gated 有界局部搜尋。**gate＝候選珠含覆蓋 ≥2
  必要技能之複合珠**（Rise 珠無 `.skills`、恆空 → 短路回傳貪婪結果，Rise 逐位元不變由回歸背書；
  **不用 if-rise 硬判**）。採用準則＝(必要技能滿足數, 保留洞位可行, 剩餘洞位價值) 字典序**嚴格更優
  才換、平手不換**（決定性、絕不退化）。深度 ≤2（偏好單珠 alt + 複合珠 seed depth-1，depth-2 僅在
  depth-1 未救活時）。效能增幅 ≤30%（實測 +16%）。
  - **spec↔實測衝突點名（實測為準）**：PLAN 假設貪婪對「兩必要技能可由一顆複合珠同時推進」次優、
    要「單珠→複合珠」替換。**探測腳本證實貪婪的 bonusCoverage 對此已最優**（R 場景直接成功）。
    真正殘留次優是**反方向**的 (E) 貪婪過度搶大洞給複合珠、餓死只有大洞可補的技能，與 (F) 多複合珠
    並存時短視選錯首顆。故修復涵蓋**雙向**（偏好單珠 + seed 複合珠），非 PLAN 的單向。真實資料掃描
    15000 組僅 4 組觸發（皆 (E)），修復主要價值在補救 (E)。
  - **`__setDecorationRepairEnabled` 是 bench-only seam**，生產恆 true（應用碼絕不呼叫）；
    僅供 `bench-repair-perf.mjs` 量測貪婪-only 基準。
  - 驗收腳本：`test-decoration-repair.mjs`（3 構造案例 E/depth-1/F + 決定性）、
    `smoke-repair-realdata.mjs`（真實前後對照 + Phase3③ + 決定性）、`bench-repair-perf.mjs`、
    `smoke-cross-session.mjs`（A 匯入/B 匠單調/C 追加洞可進複合珠）。

## 5. 工作協議（換手／長 session 失真防護）

一次長 session 上下文嚴重劣化，導致「宣稱 3 個 commit 全部沒發生、報的筆數全是幻覺、
半套 Edit 留下編譯破口」。教訓固化如下（每個 session 先讀）：

- **一步一驗，佐證優先**：每個宣稱的產出（檔案、筆數、跑批結果、commit 落地）必須附**當下真實
  工具輸出**；無佐證的結論不寫進回報。Write/Edit 後靠 build／resolver 實測佐證，不靠記憶。
- **build 是最終權威**：Edit／Read／grep／甚至 git 命令的 stdout 都可能失真。逐行 Edit 對不上時
  改整檔 Write；驗證用「停 dev server + `rm -rf .next`」的乾淨 `next build`；確認 git 狀態用
  `git log --oneline`（多筆交叉）或直接讀 `.git/logs/HEAD`（reflog 物理檔），不靠單筆 short hash。
- **交接文件本身也可能失真**：上一手的 handoff／memory 是「當時的宣稱」，非地面真相。動手前先用
  `git status --porcelain`、`git check-ignore`、乾淨 build 交叉核對，把每條前提驗成事實再信。
  （本輪即發現 handoff 說的「.gitignore line72-78 壞內容」「recommended-builds.json 被 gitignore
  需 git add -f」皆為失真——實際 .gitignore 乾淨、該檔未被忽略。）
- **中文 stdout 亂碼**：Git Bash 中文輸出常亂碼／截斷——改用 Node 寫檔 + Read 讀，或請使用者手動
  貼 `git status` 真實輸出當地面真相。
- **分支慣例＝一律直接於 `main` 工作，不開側枝**：Claude commit 到本地 `main`。
  **推送閘門制**：`regression-baseline.mjs --check`、乾淨 `next build`、`tsc --noEmit` 三者全綠，
  且回報中列出 `git log --oneline origin/main..main` 的待推清單後，即可 `git push origin main`。
  **一律禁止**：force push（`--force`／`--force-with-lease`）、改寫已推送歷史（rebase／amend 已 push 的 commit）、
  刪遠端 tag／分支。重大計畫（多 Phase）推送前先打 `pre-*` 錨點 tag（如 `pre-iceborne`）以利回滾。
  （舊制為「人類親手 push、Claude 只 commit 本地」，緣由：長 session 失真下以人工 push 當最後一道關、
  防幻覺／半套破口上遠端；今以三綠燈 + 待推清單回報取代人工 push 這關，並以錨點 tag 與禁止改寫史作安全網。）
  若環境把 Claude 丟進自動建立的 worktree／側枝（`claude/*`），那是 harness
  預設，非本專案慣例——完事後把該 commit `cherry-pick`（或 `merge --ff-only`）回 `main`、砍掉側枝。
  注意：主 repo 已 checkout `main` 時，worktree 內 `git checkout main` 會被拒（同分支不可雙 checkout），
  改用 `git -C <主 repo 路徑>` 操作 `main`；要刪自己所在的側枝需先 `git switch --detach` 再 `git branch -D`。
- **Dev server 管理**：每次 session 結束、或要執行 `rm -rf .next`／乾淨 build 前，必須先確認並關閉
  自己啟動的 dev server（Windows 下可 `taskkill /F /IM node.exe`，或挑 PID 關）。殭屍 dev server
  疊加會使 port 遞增（3000→3001→…），且清 `.next` 會讓仍存活的舊實例 CSS／chunk 失效，呈現
  「全站無樣式」的假故障。人類若回報「localhost 樣式全裸」，第一優先懷疑殭屍 server ＋ 瀏覽器快取
  （Ctrl+F5），而非最近的 commit。

## 7. Wilds 擴充（三遊戲第三款；Phase 0–5 + 6b + Z 已完成，狀態同 HANDOFF §00）

> 全部裁決由 `docs/wilds-*.md` audit 與 git 歷史提取（非憑記憶）。與 §6（World）同格式。

- **attack 尺度：display→raw 翻案**（Phase 4a，`docs/efr-wilds-notes.md`）：Phase 2 初判 attack=`damage.display`
  （假設同 World 尺度）；考證發現 Wilds Kiranico 顯示值即 raw、無 World 式膨脹 → **attack=`damage.raw`**，
  efr-wilds 不除武器種倍率（與 World「display 需還原 raw」相反）。
- **斬味 base/max 方向與 World 相反**（`docs/wilds-sharpness-audit.md`）：Wilds mhdb `weapon_sharpness` 單列
  ＝**匠0 base**、`handicraft[]` 給 max 延展；而 World 單列＝**匠5 maxed**。二者方向相反，`efr-world` 與
  `efr-wilds` 各自處理，勿混用。全 947 把自洽驗證。
- **Gogmazios 擬態＝additive 聯集建模**（mechanics #10）：多套裝件的借用 set 以 `setBonusId`（原生
  Gogmapocalypse `wsb_178`）+ `extraSetBonusIds` 表達；`computeSetBonusSkills` 對主 set 與每個 extra
  **各 +1 件（聯集）**計數，借用 set 湊門檻可觸發。Rise/World 無 `extraSetBonusIds`（迴圈零迭代、逐位元
  不變，回歸背書）。`smoke-wilds.mjs` ⑦/⑦b 背書。
- **珠雙池 → 池分割解法**（Phase 0 定案 #2）：珠分武器池（295）/ 防具池（66），技能亦分武器系（66）/
  防具系（71）。solver 依此分池補珠。**依賴「零跨池例外」的前提**——Ascendance 若引入跨池珠，此假設
  失效、需重審分池邏輯（重審條件已記 HANDOFF §00）。
- **charm 混合制**（`charmMode:"mixed"`）：可生產護石（183 逐級）自動進候選池 + RNG 護石走使用者護石庫
  輸入；RNG 護石**逐洞池別**正確性（Phase 6 前置翻案：Wilds 珠雙池下護石洞需標池別）。
- **W04→W11 基準補強**：Wilds 引擎差異（`deps.wilds` 閘門）上線時，`regression-world.mjs` 基準由 W04
  補至 W11（複合珠有界修復實觸發等），確保 World 逐位元不因 Wilds 共用路徑改動而漂移。
- **Game8 快取固化爬取（Phase 6b）**：Game8 Wilds 頁**非 JS-render-gated**（premise 翻案，實測 `fetch()`
  得完整靜態 HTML）→ `fetch → 靜態表解析 → 抽取結果進版控（.cache/game8/*.json）`，原始 HTML 續 gitignore。
  版控修正理由：跨機單副本風險已實際發生（Phase 6b 開工即遇快取遺失），provenance 由 git 歷史強制。
- **推薦來源換 game8.co→game8.jp（尾巴 W-F，`docs/wilds-game8-audit.md §W-F`）**：Phase 6 誤用英文站
  （計畫層 prompt 未指明來源、World 已先改用 game8.co、Wilds 沿用）。W-F 換回日文原站。**兩前提實測部分反轉、
  據實記錄，不迎合原述**：① 前例＝Rise 用 game8.jp、World 才是 EN 者；② 覆蓋 EN 173 > JP 105（原述「遠遜」
  反向）。**換源理由改立於保真度**：JP 原生詞彙**直通 mhdb `ja` locale**（`import-game8-mhwd` 映射鍵，顯示
  仍走 zh-Hant）、免英文有損轉譯、技能表較完整、護石池別標註、Rise 前例一致。**RNG 護石判定＝解析不到
  「池內」wc_id**（涵蓋泛稱鑑定護石 + 具名 未解/秘歴/栄世/史伝の護石＝mhdb skills 空、import-wilds「RNG 4 排除」），
  非硬編名單。scraper 兩 layout（最強＋上位）+ **6 表頭變體容錯**（`武器`/`メイン武器`/`武器／強化パーツ`；
  漏認即靜默合併 build，Phase 1 探測 99→定版 105）。metaVersion「1.041 + JP 更新日」。
- **分區收斂（尾巴 W-F 定版）**：JP 僅 **2 editorial 層** → `wildsEndgame`←最強(66)、`wildsProgression`←上位(39)；
  `wildsHighRank` 無 JP 對應層＝空（UI `.filter(len>0)` 自動隱藏，零 label 改動）。序盤 defer（`wildsLowRank`）。
  〔Phase 6b 原「三收斂 96/38/39」為 EN 結構，已被 W-F 取代。〕**照 JP 實測收斂，不硬湊 EN 分區筆數感。**
- **lowRank defer 裁決**：Game8 有獨立 Low Rank 頁（來源存在），本輪未匯入、列尾巴候選（`wildsLowRank`）；
  方向與尾巴 A 禁的「建來源不存在的幽靈分類」**相反**（記載存在但 defer），合規。
- **Phase Z achievability 翻案**（`docs/wilds-game8-audit.md` §3b）：抽查證實 **Game8 `skillTotals` 是
  人工編修摘要、非其自列裝備的忠實加總**（雙向不符：漏列武器內建/元素技；偶爾等級與自列珠不符）。故
  achievability **不可用單一 exact 率表述**。重構為三層：**(a) 裝備層重現、(b) 引擎自洽（真實 skill-calculator
  聚合 == 各件加總，逐位元）＝我方硬保證**；(c) Game8 偏差為對照噪音刻畫。**核心主張＝(a)+(b)，非 exact 率。**
  〔**W-F 換 JP 後數字**：105 筆，(a)/(b) 105/105、(c) 33/105 clean（遠高於 EN 12/173）；此定性對 JP 仍成立。〕
  文件措辭紀律：Game8 skillTotals 一律定性「人工摘要參考值」，禁用「筆數全驗證」類措辭。
