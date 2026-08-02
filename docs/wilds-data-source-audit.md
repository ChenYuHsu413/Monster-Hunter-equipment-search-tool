# wilds-data-source-audit.md — MH Wilds 資料源實測選型（Phase 0）

> 產出日期：2026-08-02。格式比照 `docs/world-data-source-audit.md`。
> **Ground truth 順位**：實際 API/頁面回傳 > repo 文件 > PLAN/HANDOFF 先驗。本輪每格數字皆為
> 本日實抓（mhdb-wilds API 抽樣 + Kiranico 瀏覽器渲染），非訓練記憶。抽樣上限每類目 ≤10 筆結構樣本；
> 類目總數為 API 陣列長度（metadata，僅入本稽核，未落地任何資料檔——見 §裁決）。

## §0 網路可達性（本輪 gating，實測）

| 端點 | HTTP | 備註 |
|---|---|---|
| `https://wilds.mhdb.io/` | 404 | root 無內容屬正常，API 在子路徑 |
| `https://wilds.mhdb.io/en/armor` 等 | 200 | `/{locale}/{category}` 結構可用 |
| `https://mhwilds.kiranico.com/` | 200 | SPA，Game Ver. **1.040** |

兩源皆可達，繼續本輪。

## §1 候選源與覆蓋度矩陣

### 候選 A：mhdb-wilds（LartTyler）— API `wilds.mhdb.io`

REST JSON API，路徑 `/{locale}/{category}`，支援 query filter（`?q={json}` MongoDB 式、`?limit=`）。

| 類目 | 總數 | 結構欄位（實抓證據） | 池別/歸屬 | zh-Hant |
|---|---|---|---|---|
| 防具 | **714**（high 582 / low 132） | `kind`(部位)/`rarity`(1–8)/`rank`(high\|low)/`resistances`/`defense{base,max}`/`slots`([1–3])/`armorSet{id,name}`/`skills[]` | α/β/γ 於 name 後綴；armorSet 183 系列 | 100% |
| 武器 | **1188**（14 種齊全） | `kind`/`rarity`(1–8)/`damage{raw,display}`/`affinity`/`slots`([1–3])/`skills[]`/`sharpness{7色}`/`handicraft[]`/`elderseal`/`specials`/`coatings`/`series` | 自帶技能 1090/1188 | 100% |
| Artian 武器 | 28（含於 1188） | 基礎形態：rarity 6–7、`slots[2,2,2]`、`skills[]`空 | 隨機強化不在資料 | 100% |
| 裝飾珠 | **361** | `kind`(weapon\|armor)/`slot`(單值 1–3)/`rarity`(3–7)/`skills[]` | **weapon 295 / armor 66**；複合珠 173（skills>1） | 100% |
| 可生產護石 | **64** 系列 | `ranks[]`(升級鏈)/每 rank `skills[]`+`crafting.materials`/`random:false` | — | 100% |
| RNG 護石 | **4**（`random:true`） | Unknown(r5)/Historical(r6)/Secret(r7)/Golden Age(r8)；`skills:[]`（鑑定時隨機） | 技能池**未結構化** | 100% |
| 技能 | **179** | `kind`(armor\|weapon\|group\|set)/`ranks[]`(逐級)/`setPiecesRequired` | armor 71/weapon 66/group 17/set 25 | 100% |
| set bonus 門檻 | 25 條(set 技能) | `ranks[].setPiecesRequired` | 全 [2,4] | 100% |
| 群組技能 | 17 條(group 技能) | `setPiecesRequired` 全 [3] | 跨系列 | 100% |
| 斬味 | 每把武器 `sharpness` | 7 色帶 `{red,orange,yellow,green,blue,white,purple}` 各長度值 + `handicraft[]` | — | n/a |
| 洞位/rarity | — | armor/weapon slots 1–3、rarity 1–8；deco rarity 3–7 | — | n/a |

**zh 覆蓋率（實測，null name 比例）**：`zh-Hant` 全類目 **100%**（armor 714/714、weapons 1188/1188、
decorations 361/361、charms 64/64、skills 179/179 皆有繁中名）。
**locale 定案**：繁中用 **`zh-Hant`**；`zh-TW`/`zh` 回 HTTP 200 但 name 為 **null**（不可用），`zh-Hans` 為簡中。

授權/pin：LartTyler 開源專案（mhdb-wilds-data 工具鏈，資料自遊戲檔抽取）。API 無版本標頭，
pin 方式＝抓取當下記 **snapshot 日期 + `data_version` 端點值**（Phase 2 落實）。

**取證指令（可重跑）**：
```bash
curl -s 'https://wilds.mhdb.io/en/armor?limit=1'
curl -s 'https://wilds.mhdb.io/zh-Hant/skills' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);const k={};a.forEach(x=>k[x.kind]=(k[x.kind]||0)+1);console.log(a.length,k)})"
curl -s 'https://wilds.mhdb.io/en/charms?q=%7B%22random%22%3Atrue%7D'   # RNG 護石 4 筆
```

### 候選 B：Kiranico Wilds（`mhwilds.kiranico.com`）

SPA（client-render，HTML 無 SSR 資料、非 livewire），路由 `/zh-Hant/data/{weapons,armor-series,skills,decorations,charms,monsters}`。
Game Ver. **1.040**。zh-Hant 完整（瀏覽器渲染 skills 頁取得全繁中技能表：攻擊／看破／超會心／匠／利刃／
達人藝／砲術／鈍器能手／心眼／會心擊【屬性】…）。**與 mhdb zh-Hant 名逐一比對一致**（看破＝看破、
超會心＝超會心、匠＝匠、利刃＝利刃、達人藝＝達人藝、砲術＝砲術、鈍器能手＝鈍器能手、心眼＝心眼）。

定位＝**交叉核對 + zh 抽驗 + 斬味語意考證**源（比照兩代 Kiranico 經驗）；全量抽取需瀏覽器渲染逐頁
（Phase 2 才做，本輪只證可用 + zh 對齊）。

### 候選 C：其他

過程未發現優於 A 的結構化源。Game8 Wilds 為 Phase 6 推薦配裝來源（本輪不評）。

## §2 新鮮度檢核（主源選型硬門檻）

| 檢核項 | mhdb-wilds | 證據 |
|---|---|---|
| TU4 Gogmazios 防具 | ✅ 有 | `Gogmazios Helm/Mail/Vambraces/Coil/Greaves α`（10 筆） |
| TU4 Gogmazios set bonus | ✅ 有 | set 技能 `Gogmapocalypse` |
| TU4 Gogma Artian | ⚠️ 無獨立命名武器 | Artian 為隨機強化基底，28 把 Artian 基礎武器在列；Gogma 部件不成獨立武器（預期） |
| 1.041 Sororal α 防具 | ✅ 有 | `Sororal Earrings/Coat/Vambraces/Coil/Boots α`（5 筆） |
| 1.041 Shatterseal 大劍 | ✅ 有 | `Shatterseal`、`Shatterseal Drakesnest`（2 筆） |
| Arch-tempered γ 系列 | ✅ 有 | `Rey Sandhelm/…γ`（rarity 8, rank high；"Arch" 不在名、γ 後綴表達） |
| RNG 護石（TU2.5+） | ✅ 結構化旗標 | `random:true` 4 筆，rarity 5–8（技能池未列） |

**結論**：mhdb-wilds 涵蓋 **TU4 + 1.041**，無停更在舊 TU 的疑慮。Kiranico 頁首標 Ver **1.040**，
比 mhdb 舊一個 patch（Sororal/Shatterseal 為 1.041 內容，mhdb 有、Kiranico 版號較舊）→ **mhdb 較新**。

## §3 數量級對照與差異分類

| 類目 | mhdb-wilds(1.041) | Kiranico(1.040) | 差異分類 |
|---|---|---|---|
| 防具 | 714 | 待 Phase 2 逐頁渲染 | 版本差（mhdb 1.041 ≥ Kiranico 1.040）；名稱 100% 對齊（技能抽驗） |
| 武器 | 1188 | 同上 | 同上 |
| 裝飾珠 | 361 | 同上 | 同上 |
| 護石 | 64+4 | 同上 | 同上 |
| 技能 | 179 | zh 名全對齊 | 命名一致，非真缺 |

**點名**：Kiranico 為 SPA，精確逐類目筆數需瀏覽器渲染全表（成本高），本輪 **deferred 到 Phase 2**；
Phase 0 以「版本（1.041≥1.040）+ zh 名逐一對齊 + 結構欄位齊備」三項支撐選型，不以未取得的 Kiranico 精確
筆數阻擋結論。差異暫分類為**版本差**（非命名差、非真缺），Phase 2 匯入後落地精確對照。

## §4 主源選型結論

**主源 = mhdb-wilds（wilds.mhdb.io API + LartTyler/mhdb-wilds-data）**。理由（覆蓋度矩陣支撐）：

1. **結構化最高**：JSON API，所有引擎所需欄位皆結構化——`skill.kind`（武/防/group/set 技能分家）、
   `decoration.kind`（珠雙池）、`setPiecesRequired`（set/group 門檻）、武器 `skills[]`（自帶技能）、
   `sharpness` 7 色帶、`random` 旗標（RNG 護石）。無需從 HTML 反解。
2. **zh-Hant 100% 覆蓋**：與 World 需補 100 筆 EN-fallback 截然不同，Wilds 主源自帶完整繁中
   （Phase 2 仍須品質抽驗，但無結構性缺口）。
3. **最新**：涵蓋 TU4 + 1.041（Kiranico 版號 1.040 較舊）。
4. **可 pin、重跑安全**：開源、資料自遊戲檔抽取，比照 World MHWorldData 慣例。

**交叉核對源 = Kiranico Wilds**（zh 抽驗、斬味語意考證、set bonus/secret 抽驗）——瀏覽器渲染逐頁，Phase 2 用。

**與 PLAN §A 先驗的出入（點名）**：
- PLAN §A「mhdb-wilds…主源首選待驗」→ **實測確立為主源**，先驗成立。
- PLAN §A.5「RNG 護石 稀有度 5–8」→ **資料證實**（random:true 4 筆 r5–8）；惟**技能池未結構化**
  （skills:[]），app 需使用者庫輸入（詳 mechanics-audit #5）。
- set bonus 1 件特例（見 mechanics-audit #3）：**先驗未獲 1.041 資料證實**，點名於機制表。

## §5 版本策略設計（文件，不實作）

- **`dataVersion` 與 `sourcePin` 落點**：建議**集中 manifest** `src/data/wilds/manifest.json`
  （`{dataVersion:"1.041", sources:{mhdb:{snapshotDate,dataVersionEndpoint}, kiranico:{ver:"1.040"}}}`），
  而非每個資料檔頂層。**理由**：現行 World/Rise 大資料檔為 bare array（loader 直接 `import` 陣列），
  若改成 `{dataVersion, data:[...]}` 物件包裹會動到所有 loader 形狀；集中 manifest 保持資料檔形狀不變、
  版本/pin 單點可稽核、diff 報告單一入口讀取。**與 PLAN Phase 1「資料檔頂層 dataVersion?」的偏離已點名**
  （依 §B.6 以實作成本為由，最終形狀由 Phase 1/2 定；recommended-builds 這類本就有 `meta` 包裹的檔
  可另在 meta 內帶 metaVersion）。
- **上游 pin 方式**：mhdb-wilds＝抓取 snapshot 日期 +（若有）`data_version` 端點值；Kiranico＝頁首 Ver 字串。
- **diff 報告形狀**（`scripts/wilds/diff-report.mjs`，為 Ascendance 預留，本計畫不跑真 diff）：
  吃兩份帶版本 snapshot，輸出**按類目分節、每節三類（新增／移除／變更）**的 JSON + 人讀摘要；
  本計畫僅以「自我 diff → 空報告」驗證可跑（Phase 2）。
- **§A.3 假訊息**：本輪於 mhdb/Kiranico 官方源**未遇**任何「TU5 / Abyssal」內容；官方基礎版停在 TU4/1.041，
  與 PLAN §A 一致。若後續於非官方源遇到，一律不採信並記出處。

---

## §6 Phase 2 匯入結果落地（2026-08-02）

管線：`scripts/wilds/fetch-mhdb.mjs`（en+zh-Hant 抓取→`.cache/`，gitignore、重跑零抓取）
→ `import-wilds.mjs`（→`src/data/wilds/*.json`，機械產生絕不手改）
→ `audit-wilds.mjs`（資料層稽核）→ `diff-report.mjs`（版本 diff 骨架）。

### 產出筆數（id 慣例 `wa_/ww_/wd_/wc_/wsb_/wg_`）

| 檔 | 筆數 | 備註 |
|---|---|---|
| armors.json | 714 | setBonusId/extraSetBonusIds/groupId derive；defense=base、rankLabel 上/下位 |
| weapons.json | 1188 | 14 武種；**attack=damage.raw**（原 Phase 2 裁決為 =damage.display「同 World 尺度」，**Phase 4 考證推翻→raw**：Kiranico 顯示值=raw，見 `efr-wilds-notes.md` §1；原記載保留於此）；**斬味 base=匠0、max=handicraft 延展**（Phase 4，`wilds-sharpness-audit.md`）；Artian 28 tag |
| decorations.json | 361 | pool=kind（weapon 295/armor 66）；複合珠 173 帶 SkillMap |
| charms.json | 183 | 60 可生產家族**攤平逐級**（比照 World per-rank）；無洞 slots:[] |
| skills.json | 179 | kind 四類 + maxLevel（=max rank level）|
| setBonuses.json | 25 | ranks 承載自身效果@門檻（全 [2,4]）；skillName=自身 zh 名 |
| groupSkills.json | 17 | 門檻恆 [3]（資料驅動）|
| weaponTypes.json | 14 | zh 官方標準名（固定對照）|
| manifest.json | — | dataVersion "1.041" + mhdb snapshot 2026-08-02 + 筆數指紋 + kiranico 1.040 |

**重跑決定性**：`import-wilds.mjs` 連跑兩次，`src/data/wilds/*.json` sha256 逐位元一致 ✓。

### 數量級對照（vs Phase 0）差異分類

- armor 714 / weapons 1188 / decorations 361 / skills 179：**與 Phase 0 完全一致**。
- **charms**：Phase 0 記「可生產 64 系列 + RNG 4」為**低估性誤植**（實為 60 可生產 + 4 RNG = 64 total）；
  攤平逐級後 183 筆。RNG 4 筆不進候選池（Phase 3/5 使用者庫），留存供 UI 驗證：
  Unknown(r5)/Historical(r6)/Secret(r7)/Golden Age(r8)，皆 skills:[]、slots:[]。
- setBonuses 25 / groupSkills 17：與 Phase 0 set/group 技能數一致。

### 稽核結果（`audit-wilds.mjs` 全 PASS）

- 收支：slot ∈ {1,2,3}、rarity ∈ [1,8]。
- set/group 歸屬完整（無 dangling 引用、無孤兒表項）；extraSetBonusIds 無含自身、恰 10 件（Gogmazios）。
- **池別一致性：武器珠/防具珠技能池別零跨池例外**。
- **武器無 seed 技能 98/1188 分佈查明**：每武種均 7 把（14×7=98）。按 rarity {1:14, 6:14, 7:14, 8:56}；
  其中 **Artian 基底 28/28**（隨機強化不在資料 → seed 空，正確）+ 14 rarity-1 起始武器 + 其餘高 rarity。
  非資料缺陷，為 Artian/起始武器的合理分佈。

### Kiranico 交叉抽驗 + 1.041 白名單

- **技能**（Phase 0）：40+ 筆 zh 名與 mhdb 逐一吻合。
- **裝飾珠**（本輪瀏覽器渲染 `mhwilds.kiranico.com/zh-Hant/data/decorations`）：15 筆珠名+技能組成與 mhdb
  **15/15 完全一致**（含複合珠：守勢・匠珠【3】=攻擊守勢+匠、火炎・屬會珠【3】=火屬性攻擊強化+會心擊【屬性】…）。
- **1.041-only 白名單**（Kiranico 停 1.040，下列在 Kiranico 缺席＝**版本差非缺陷**）：
  Sororal α 系列、Shatterseal/Shatterseal Drakesnest、Gogmazios α/β + Gogmapocalypse、γ 系列（Rey Sand* γ 等 AT 獎勵）。
- 防具逐項數值 + 斬味色帶的完整 Kiranico 交叉：斬味語意屬 **Phase 4 考證**（`wilds-sharpness-audit.md`）；
  數值面以本輪資料層稽核（收支/歸屬/池別全 PASS）+ 名稱強對齊背書，完整逐值 Kiranico scrape 依 SPA 成本
  **deferred**（proportionate，點名）。

### zh 覆蓋率終值

- **zh-Hant 100%**：import 全量 EN-fallback = **0**；audit 複驗 armor/deco/skill 名皆含非 ASCII，無殘留。
  真缺清單：**空**（Phase 0 宣稱 100% 經全量匯入證實）。

### manifest pin 方式與理由

- 純 live API，mhdb-wilds 無可直接 pin 的資料 commit（GitHub repo 為工具鏈非快照），
  故 pin = **snapshot 日期（2026-08-02）+ 全類目筆數指紋（armor714/weapons1188/deco361/charms64/skills179）**，
  寫入 `.cache/_meta.json`（首抓一次、重跑不覆蓋 → import 決定性），再由 manifest.json 落地。
