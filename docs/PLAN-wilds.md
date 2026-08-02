# PLAN-wilds.md — Monster Hunter Wilds 擴充規劃書

> 撰寫日期:2026-08-02。前置文件:`HANDOFF-wilds.md`(交接)、`PLAN-iceborne.md`(格式模板)、`CLAUDE.md`(§0 禁區 / §5 閘門制 / §6 裁決)。
> 本規劃書已依 2026-08 網路查證修正交接文件 §5 的兩處重大出入(見 §A)。
> **實測與本 PLAN 衝突時,以實測為準並在回報中點名條目**——前兩計畫此原則救場 6+ 次。

---

## §A 版本前提(2026-08 查證,取代交接文件「Wilds 仍在更新中」的假設)

1. **基礎版已停更大型內容**:TU4(2025-12-16)為最後一個大型 Title Update,
   2026-02-18 的 Ver **1.041** 為基礎版最後一次主要更新,官方無 TU5。
   後續大事件是資費擴充 **Ascendance**(2026-06-05 公開,2027 推出,Master Rank)。
2. **因此本計畫 pin 在 1.041**:資料「爬一次+稽核固化」如前兩代即可成立。
   版本化管線降級為「對 Ascendance 的前瞻保險」:schema 帶 `dataVersion` 欄、
   匯入產出記錄上游 pin、稽核腳本具備兩版 diff 報告能力,但**不需**常態重跑機制。
3. **假訊息警告**:網路上存在聲稱「TU5: The Abyssal Awakening / Abyssal Dragon」的內容
   (wildsbuilder.com 等),無官方或多源佐證,判定為 SEO/生成式假內容。
   Phase 0/6 蒐集資料時遇到不可採信;若 agent 查到與本條衝突的**可信多源**訊息,照慣例點名回報。

### 機制定案先驗(Phase 0 仍須逐條實測,含資料層驗證)

| # | 機制 | 查證結論(先驗) | 引擎影響 |
|---|---|---|---|
| 1 | 技能分家 | 武器技能掛武器/武器珠,防具技能掛防具/防具珠;**武器本體自帶技能**(交接文件未點明) | 珠池二維約束;搜尋輸入的武器 seed 技能 |
| 2 | 裝飾珠雙池 | 武器珠/防具珠兩池,洞位有歸屬 | `Decoration.pool` + solver 洞-珠匹配加一維 |
| 3 | Set bonus | 同系列 2 件觸發 / 4 件強化;內部為每件 1 系列點數制;**有 1 件效果特例回報(Mizutsune 系)→ 門檻必須資料驅動,禁硬編 2/4** | computeSetBonusSkills 沿用門檻表模式 |
| 4 | 群組技能 | 跨系列共享 group,任 3 件觸發;與 set bonus 並存互不干擾;一件防具可同時屬 set 與 group | 雙軌統計(setBonusId + groupId) |
| 5 | 護石(**修正:混合制**) | 可生產清單(可升級)**+** RNG 鑑定護石(1.021 Glowing Stone、TU4 Timeworn Charm):稀有度 5–8、最多 3 技能(第 1 個必為武器技能)、**洞位自帶武器/防具池歸屬**、僅會出現有對應珠的技能 | charmMode 新混合模式 = 固定清單進池 + 使用者護石庫(Rise 式輸入,含池別洞位) |
| 6 | 雙武器攜行 | 主/副武器(Seikret 切換) | **v1 只搜主武器**(裁決維持,避免搜尋空間平方化) |
| 7 | Artian 武器 | 終盤隨機強化(含 TU4 Gogma Artian);另 1.021 起 R5+ 防具強化上限提升 | 照慣例簡化輸入結果值(比照傀異鍊成/覺醒) |
| 8 | 位階 | 下位/上位皆存在,無 M 位(Ascendance 才有) | 推薦配裝分區依來源實測收斂,**不建幽靈分類**(尾巴 A 教訓) |
| 9 | 洞位/rarity/斬味結構 | 未逐項查證 | Phase 0 資料層實測定案 |

### 資料源候選(Phase 0 覆蓋度實測後選型)

- **mhdb-wilds**(LartTyler,mhw-db 作者):資料自遊戲檔案抽取(mhdb-wilds-data 工具鏈),
  API `wilds.mhdb.io` 支援 locale,GitHub 有結構化產出——結構化程度候選第一,主源首選待驗。
- **Kiranico Wilds**(mhwilds.kiranico.com,支援 zh-Hant):兩代 Kiranico 匯入經驗直接複用,交叉稽核源首選。
- **Game8 Wilds**:配裝體系持續維護、已更新至 Ver 1.041(HR50+ builds / tier list)——Phase 6 推薦配裝來源。
- 選型準則沿用:結構化最高者為主源 + 獨立源交叉稽核 + zh 覆蓋率實測 + **pin commit/日期**。

---

## §B 方法論總綱(全 Phase 適用,違反即退件)

1. **Rise 與 World 回歸逐位元不變是絕對底線**。每個 commit 跑
   `node scripts/regression-baseline.mjs --check`(Rise)與 Phase 1 建立的 World 基準 `--check`。
2. **開工先驗上一手**:每輪第一步重跑上一輪的驗收指令,實際輸出貼回報。
   上一手回報是宣稱,不是地面真相(前計畫實際救場 3 次)。
3. **一步一驗**:每項產出附當下真實工具輸出(指令+輸出片段),禁事後補述。
4. **禁硬編**:常數一律機械推導自資料(KNOWN_MAX 半數錯的教訓);
   人工裁決進 override 檔並附依據,絕不手改產出檔;快取固化、重跑安全。
5. **冒煙從消費端打**:驗證必須經 `searchBuilds` 等實際消費路徑,不能只打模組
   (Phase 4→5 EFR 佈線 gap 教訓);冒煙案例需設計隔離(單一變因)。
6. **prompt 條文自相矛盾時以意圖為準**,並在稽核文件留痕;自行裁決逐條回報。
7. **推送 = §5 閘門制**:回歸 + 乾淨 build + tsc 三綠燈 + 待推清單 → 自主 push。
   force push / 改寫歷史 / 刪遠端 tag **絕對禁止**。重大 Phase 前打 `pre-*` 錨點 tag。
8. 「對不上」先分類:名稱差異 vs 真的缺(顆數/等級收支鑑別);zh 真缺留 EN 不硬翻,逐筆有據。

---

## Phase R — 文件現代化與錨點(前置輪,不碰 src/)

**目標**:README 與專案描述仍停在舊狀態,先更新至 Rise+Iceborne 雙遊戲現況,並補齊錨點 tag。

**工作項**:
1. 確認 `origin/main` = 本地 main = 463cee2、工作樹乾淨;若 `iceborne-v2-tails` tag 未打,打在 463cee2 並推送。
2. 更新 `README.md`:專案定位(多遊戲配裝搜尋器)、雙遊戲能力對照(以 HANDOFF §1 表格為準)、
   已知近似清單(HANDOFF §4)、使用方式、線上網址。既有的複合珠有界修復標註等誠實揭露保留。
3. 更新 `package.json` description 與 repo 描述文字建議(GitHub repo description 由使用者手動改,agent 給文案)。
4. `CLAUDE.md` 若有現狀段落過時(仍稱單遊戲/未含尾巴 A–D),同步修正;§0/§5/§6 條文不動。
5. 打 `pre-wilds` 錨點 tag 並推送。

**驗收**:不碰 `src/`;Rise 回歸 `--check` 綠;README 內容逐段可對照 HANDOFF §1/§4。
**佐證**:`git tag` 清單輸出、README diff 摘要、回歸輸出。
**禁區**:任何程式碼、資料檔;GitHub repo description(僅出文案)。

---

## Phase 0 — 資料源實測選型 + 機制定案 + 版本策略(不碰 src/)

**目標**:§A 的先驗逐條落地為「有資料證據的定案」,選出主源,設計版本欄位與 diff 報告形狀。

**工作項**:
1. **資料源覆蓋度矩陣**(mhdb-wilds / Kiranico Wilds / 其他發現的源):
   防具(含 α/β/γ)、武器(14 種 + Artian 基礎)、裝飾珠(**含池別欄位是否存在**)、
   可生產護石、set bonus 門檻表、群組技能歸屬、斬味結構、洞位/rarity、zh(zh-Hant 優先)覆蓋率。
   每格附實際抽樣證據(API 回傳片段 / 頁面節錄),不可只寫「有」。
2. **機制定案**:§A 表格 9 條逐條以資料層證據定案(例:set bonus 門檻是否每系列可異、
   1 件效果特例如何表示;RNG 護石洞位池別在資料中如何表達;武器自帶技能的資料形狀)。
3. **對照數量級**:主源各類目總數 vs Kiranico/遊戲 wiki 公開數量,差異先分類(命名 vs 真缺)。
4. **版本策略設計**(文件,不實作):`dataVersion: "1.041"` 欄位落點、上游 pin 方式
   (mhdb-wilds 用 commit hash / API snapshot 日期)、`scripts/wilds/diff-report` 的輸出形狀
   (為 Ascendance 預留,本計畫不需跑真 diff)。
5. 產出 `docs/wilds-data-source-audit.md`(格式比照 world-data-source-audit)+ 機制定案表 + 主源選型結論與理由。

**驗收**:每條定案有可重跑的取證指令;主源選型有覆蓋度矩陣支撐;與 §A 先驗的出入逐條點名。
**佐證**:API/爬取抽樣原始輸出、數量級對照表。
**禁區**:`src/` 全部;不下載全量資料(抽樣即可,全量是 Phase 2 的事)。

---

## Phase 1 — World 回歸基準建立 + schema 擴充

**目標**:World 現在也是「既有行為」,比照 Rise 建立逐位元基準;之後才動 schema。順序不可倒。

**工作項**:
1. **先建 World 回歸基準**:10 組固定搜尋條件(覆蓋 set bonus 觸發、secret 解放、複合珠、
   護石池、覺醒輸入、EFR 排序各路徑),逐位元快照;整合進 regression-baseline.mjs 或 sibling 腳本,
   `--check` 介面一致。建完立刻 commit(schema 改動前的錨點)。
2. schema 擴充(`types/build.ts` hub,全部可選欄位,Rise/World 資料零改動):
   - `GameId` 加 `'wilds'`;
   - `Decoration.pool?: 'weapon' | 'armor'`;
   - `ArmorPiece.groupId?`(與既有 `setBonusId?` 並存);`GroupSkill` 型別(門檻資料驅動);
   - `Weapon.skills?: SkillMap`(武器自帶技能);
   - 護石混合:固定清單項與使用者庫項共用形狀,洞位帶 `pool` 歸屬;
   - 資料檔頂層 `dataVersion?` / `sourcePin?`。
   實際欄位命名與形狀**以 Phase 0 定案為準**,此處僅為形狀預告。
3. `game-profile.ts` 註冊位預留(未註冊拋錯不靜默,沿用);`wilds-registry.ts` 骨架(照 world-registry 模式)。

**驗收**:Rise 10 組 + World 10 組逐位元 `--check` 全綠;tsc/build 綠;World 基準 commit 早於 schema commit。
**佐證**:兩份基準 `--check` 輸出;schema diff。
**禁區**:`build-search.ts` §0 邏輯;efr.ts / efr-world.ts;既有資料檔。

---

## Phase 2 — 匯入管線 scripts/wilds/(pin 1.041)

**目標**:主源全量匯入 + 交叉稽核 + zh 覆蓋,產出 `src/data/wilds/`,全部帶版本標記。

**工作項**:
1. 匯入腳本組(照 scripts/world/ 模式):防具、武器、裝飾珠(含池別)、可生產護石、
   set bonus/群組技能門檻表、技能(含武器/防具技能歸類)。上游 pin(commit/snapshot 日期)寫進產出。
2. 稽核腳本:數量級對照(vs Kiranico)、洞位/等級收支檢核、set/group 歸屬完整性、
   珠-技能池別一致性(武器珠只含武器技能等,若資料有例外→點名回報而非силently 修)。
3. override 檔機制沿用:命名橋接、人工裁決逐筆附據;zh 真缺留 EN 清單化。
4. diff 報告腳本骨架(吃兩份帶版本資料出 diff;本計畫以自我 diff 空報告驗證可跑)。
5. 產出 `docs/wilds-data-source-audit.md` 更新(匯入結果數字落地)。

**驗收**:三綠燈;稽核腳本全過或例外逐筆有據;資料檔含 `dataVersion: "1.041"` + pin;
Rise/World 基準不變(資料是新增資料夾,理論零影響,仍須 `--check` 證明)。
**佐證**:各腳本實跑輸出、稽核報告、數量級對照表。
**禁區**:`src/lib/` 引擎;Rise/World 資料(凍結不重跑)。

---

## Phase 3 — 引擎差異(SearchDeps.wilds 閘門)

**目標**:珠池二維約束、set/group 雙軌、護石混合池,全部經單一可選閘門注入,Rise/World 短路不變。

**工作項**:
1. `SearchDeps.wilds` 閘門(照 SearchDeps.world 模式):未注入時所有 wilds 邏輯短路。
2. **decoration-solver 池約束**:洞-珠匹配加 pool 一維(武器/護石武器洞只吃武器珠…)。
   注意尾巴 D 的有界修復邏輯在雙池下的交換合法性(交換不得跨池)——先探測後修
   (尾巴 D 教訓:spec 假設的問題可能不存在,真問題可能在反方向)。
3. **computeSetBonusSkills 雙軌**:set(門檻表驅動,含可能的 1 件特例)+ group(3 件,跨系列計數);
   equipment-pools 的相關度裁切比照 Phase 3 教訓給 group 價值件虛擬技能評分,防裁切剪掉。
4. **護石混合池**:buildCharmPool = 固定清單 + 使用者護石庫(含池別洞位);
   使用者庫輸入沿用 Rise 護石庫 UI 形狀,欄位加池別(UI 本體 Phase 5,這裡先做資料通路)。
5. **武器 seed 技能**:searchBuilds 起點計入選定武器自帶技能。
6. wilds 冒煙 10 組:**從 searchBuilds 消費端打**,每組單一變因
   (純池約束/純 group/純 set/混合護石/武器 seed…),含至少 1 組知名 meta 配裝整合驗收。

**驗收**:Rise 10 + World 10 逐位元不變;wilds 冒煙全綠且逐組附輸出;tsc/build 綠。
**佐證**:冒煙輸出全文、solver 池約束的探測記錄(改前行為證據)。
**禁區**:§0 禁區條文本身;efr 模組(Phase 4)。

---

## Phase 4 — efr-wilds.ts

**目標**:同介面第三實作,數值全部機械抽取,禁沿用 Rise/World 數字。

**工作項**:
1. 斬味結構考證(色帶/斬味補正倍率/匠類技能行為)——**逐級值以 Wilds 資料/多源考證為準,
   禁憑記憶沿用前兩代**(Phase 4 CSV 單列=匠5 色帶的二度自我推翻教訓);
   期望倍率模型是否沿用「頂端 N 單位加權」由考證決定,產出 `docs/wilds-sharpness-audit.md`。
2. 會心/攻擊/屬性相關技能逐級值機械抽取(來源=Phase 2 資料 + 考證文件),`docs/efr-wilds-notes.md` 記近似
   (弱點/uptime 等近似策略比照前兩代並逐條註記)。
3. profile 註冊 `efr: efrWilds`;**佈線驗證從 searchBuilds 消費端打**(Phase 5 救場教訓,這次在本 Phase 內做完)。
4. 手算對照組 ≥ 20 組(比照 test-efr-world 23 組)。

**驗收**:手算對照全數吻合;消費端佈線冒煙綠;Rise/World 基準不變;三綠燈。
**佐證**:手算過程文件、對照輸出、考證文件。
**禁區**:efr.ts / efr-world.ts 不動。

---

## Phase 5 — UI / 持久化 / lazy 化

**工作項**:
1. 三遊戲切換(現有雙遊戲切換擴一格);`storagePrefix: 'mhwd.'` 一類(實際字串照 profile 慣例)。
2. Wilds 特有輸入 UI:護石庫(含池別洞位)、Artian 簡化輸入(比照覺醒/客製的 delta 模式)、
   珠池在珠子清單/篩選的呈現。
3. Wilds 資料/引擎全 lazy chunk;**首屏包量預算:不含 wilds 時 ≤ 現行 294 kB + 少量分支字串**,
   超標需診斷來源(Phase 1 首屏診斷經驗)。
4. 整合冒煙:三遊戲各跑代表性搜尋,localStorage 互不污染。

**驗收**:三綠燈 + 首屏包量報告 + 三遊戲互不影響證據;Rise/World 基準不變。
**禁區**:無新增;沿用全域禁區。

---

## Phase 6 — 推薦配裝(帶版本時效標記)

**工作項**:
1. 來源:Game8 Wilds builds(HR50+/tier list/進度配裝),分區**依來源實際存在的階層收斂**
   (尾巴 A 教訓:來源不存在的分類不建;World 是四分區、Rise 是四階,Wilds 以實測為準)。
2. 每筆帶 `metaVersion: "1.041"`(版本時效標記,為 Ascendance 後的 meta 漂移預留)。
3. 分階匯入 N 獨立校準(Rise N=4、World N=5,Wilds 自行實測)。
4. 匯入 clamp 用含 set bonus/group 的動態上限(Phase 6 意圖優先裁決沿用)。
5. `docs/wilds-game8-audit.md`。

**驗收**:三綠燈;全部 preset 經引擎重算可達成(或例外逐筆有據);Rise/World 基準不變。

---

## §C 收尾

- 結案 tag:`wilds-v1`;README/CLAUDE.md 補 Wilds 段落(三遊戲對照表)。
- 交接:若後續有 Ascendance 計畫,依 diff 報告腳本 + dataVersion 欄位起手,本文件 §A 即其先驗。

## §D 全域禁止事項(重申)

- force push / 改寫歷史 / 刪遠端 tag。
- 硬編任何可從資料推導的常數;手改產出檔。
- 動 Rise/World 已凍結資料;動 §0 禁區未經明示授權。
- 冒煙只打模組不打消費端。
- 採信無多源佐證的網路內容(§A.3 假 TU5 一類)。
