/**
 * Wilds 匯入：mhdb-wilds 快取（scripts/wilds/.cache/）→ src/data/wilds/*.json（schema 對齊）。
 * 產出檔一律機械產生、**絕不手改**（重跑安全，連跑兩次逐位元一致）。
 *
 *   node scripts/wilds/fetch-mhdb.mjs   # 先抓（快取）
 *   node scripts/wilds/import-wilds.mjs  # 再匯入
 *
 * 產出：armors / weapons / decorations / charms / skills / setBonuses / groupSkills /
 *       weaponTypes / manifest（pin 1.041）。id 慣例：wa_/ww_/wd_/wc_/wsb_/wg_。
 * 形狀依 Phase 0 定案（docs/wilds-mechanics-audit.md）+ Phase 2 armor→set/group 實抓（#10 Gogmazios）。
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, ".cache");
const OUT = path.resolve(HERE, "..", "..", "src", "data", "wilds");
mkdirSync(OUT, { recursive: true });

const rd = (f) => JSON.parse(readFileSync(path.join(CACHE, f), "utf8"));
const CATS = ["armor", "weapons", "decorations", "charms", "skills"];
for (const c of CATS) {
  for (const l of ["en", "zh-Hant"]) {
    if (!existsSync(path.join(CACHE, `${c}.${l}.json`)))
      throw new Error(`缺快取 ${c}.${l} — 先跑 fetch-mhdb.mjs`);
  }
}
const meta = rd("_meta.json");

// en/zh-Hant 以 id 對齊，取 zh 名（缺 zh → EN fallback，逐筆記錄）。
const zhGaps = [];
function nameMap(cat) {
  const en = rd(`${cat}.en.json`);
  const zh = rd(`${cat}.zh-Hant.json`);
  const zhById = new Map(zh.map((x) => [x.id, x]));
  return { en, zhById };
}
function zhName(cat, enItem, zhById) {
  const z = zhById.get(enItem.id);
  const name = z?.name;
  if (name == null || name === "") {
    zhGaps.push({ cat, id: enItem.id, en: enItem.name });
    return enItem.name; // EN fallback
  }
  return name;
}
// 攤平寫檔（bare array，compact 一物件一行）。
function writeArr(file, arr) {
  const body = "[\n" + arr.map((o) => "  " + JSON.stringify(o)).join(",\n") + "\n]\n";
  writeFileSync(path.join(OUT, file), body, "utf8");
  return arr.length;
}

// ───────── skills（全 179：kind + maxLevel）+ set/group 表 ─────────
const skillsSrc = nameMap("skills");
const skillEnById = new Map(skillsSrc.en.map((s) => [s.id, s]));
const skillZhName = (id) => {
  const en = skillEnById.get(id);
  return en ? zhName("skills", en, skillsSrc.zhById) : `#${id}`;
};
const maxRankLevel = (s) => Math.max(...(s.ranks ?? []).map((r) => r.level ?? 1), 1);

const skillsOut = skillsSrc.en.map((s) => ({
  name: skillZhName(s.id),
  nameEn: s.name,
  maxLevel: maxRankLevel(s),
  kind: s.kind, // armor | weapon | group | set（Phase 0 定案 #1）
}));

// set bonus 表（kind:set）：ranks 承載自身效果 @件數門檻，skillName = 自身 zh 名（自效果）。
const setBonusesOut = skillsSrc.en
  .filter((s) => s.kind === "set")
  .map((s) => ({
    id: `wsb_${s.id}`,
    nameZh: skillZhName(s.id),
    nameEn: s.name,
    ranks: s.ranks.map((r) => ({
      pieces: r.setPiecesRequired,
      skillName: skillZhName(s.id),
      skillLevel: r.level,
    })),
  }));

// group 技能表（kind:group）：門檻恆 3（資料驅動，不硬編）。
const groupSkillsOut = skillsSrc.en
  .filter((s) => s.kind === "group")
  .map((s) => ({
    id: `wg_${s.id}`,
    nameZh: skillZhName(s.id),
    nameEn: s.name,
    ranks: s.ranks.map((r) => ({
      pieces: r.setPiecesRequired,
      skillName: skillZhName(s.id),
      skillLevel: r.level,
    })),
  }));

const GOGMAPOCALYPSE_ID = 178; // Gogmazios 原生 set（擬態機制 #10：多套裝件的主歸屬）

// ───────── armor 714 ─────────
const armorSrc = nameMap("armor");
const RANK_ZH = { high: "上位", low: "下位" };
const skillLevelMap = (skills, kind) => {
  const m = {};
  for (const s of skills)
    if (s.skill.kind === kind) m[skillZhName(s.skill.id)] = s.level;
  return m;
};
const armorsOut = armorSrc.en.map((a) => {
  const setSkills = a.skills.filter((s) => s.skill.kind === "set");
  const groupSkill = a.skills.find((s) => s.skill.kind === "group");
  // 主歸屬 setBonusId：單一 set → 該 set；多 set（Gogmazios）→ 原生 Gogmapocalypse。
  let setBonusId, extraSetBonusIds;
  if (setSkills.length === 1) {
    setBonusId = `wsb_${setSkills[0].skill.id}`;
  } else if (setSkills.length > 1) {
    const primary =
      setSkills.find((s) => s.skill.id === GOGMAPOCALYPSE_ID) ?? setSkills[0];
    setBonusId = `wsb_${primary.skill.id}`;
    extraSetBonusIds = setSkills
      .filter((s) => s.skill.id !== primary.skill.id)
      .map((s) => `wsb_${s.skill.id}`);
  }
  const out = {
    id: `wa_${a.id}`,
    nameZh: zhName("armor", a, armorSrc.zhById),
    nameEn: a.name,
    part: a.kind, // head/chest/arms/waist/legs
    rarity: a.rarity,
    slots: a.slots ?? [],
    skills: skillLevelMap(a.skills, "armor"),
    defense: a.defense?.base ?? 0,
    elementRes: {
      fire: a.resistances?.fire ?? 0,
      water: a.resistances?.water ?? 0,
      thunder: a.resistances?.thunder ?? 0,
      ice: a.resistances?.ice ?? 0,
      dragon: a.resistances?.dragon ?? 0,
    },
    rankLabel: RANK_ZH[a.rank] ?? a.rank,
    seriesName: a.armorSet?.name,
  };
  if (setBonusId) out.setBonusId = setBonusId;
  if (extraSetBonusIds && extraSetBonusIds.length) out.extraSetBonusIds = extraSetBonusIds;
  if (groupSkill) out.groupId = `wg_${groupSkill.skill.id}`;
  return out;
});

// ───────── weapons 1188（斬味 base=max 佔位，匠 inactive；Phase 4 考證再分）─────────
const SHARP_ORDER = ["red", "orange", "yellow", "green", "blue", "white", "purple"];
const weaponsSrc = nameMap("weapons");
const ELEMENT_KINDS = new Set(["fire", "water", "thunder", "ice", "dragon"]);
let artianCount = 0;
const weaponsOut = weaponsSrc.en.map((w) => {
  const skills = {};
  for (const s of w.skills ?? []) skills[skillZhName(s.skill.id)] = s.level;
  const out = {
    id: `ww_${w.id}`,
    nameZh: zhName("weapons", w, weaponsSrc.zhById),
    nameEn: w.name,
    weaponType: w.kind,
    attack: w.damage?.display ?? 0, // 顯示值尺度（同 World 慣例；Phase 4 efr-wilds 沿用）
    affinity: w.affinity ?? 0,
    slots: w.slots ?? [],
    tags: [],
    rarity: w.rarity,
  };
  // 斬味（近戰）：mhdb sharpness 7 色物件 → 陣列；Phase 2 暫 base=max（匠 inactive，比照 World Phase 2），
  // 真實 base/max split 由 Phase 4 斬味考證（cache 保有 handicraft 欄）。
  if (w.sharpness) {
    const arr = SHARP_ORDER.map((c) => w.sharpness[c] ?? 0);
    out.sharpness = { base: arr, max: arr };
  }
  // 屬性/狀態：specials 內 kind:element/status（取 display 值；hidden 亦入，hidden 旗標不建模）。
  const elemSpecial = (w.specials ?? []).find(
    (s) => s.element || s.status || s.kind === "element" || s.kind === "status"
  );
  if (elemSpecial) {
    const type = elemSpecial.element ?? elemSpecial.status;
    if (type) out.element = { type, value: elemSpecial.damage?.display ?? 0 };
  }
  if (Object.keys(skills).length) out.skills = skills;
  // Artian 基底標記（隨機強化不在資料 → 簡化輸入，Phase 5）。
  if (/Artian/.test(w.name)) {
    out.tags = ["artian"];
    artianCount++;
  }
  return out;
});

// ───────── decorations 361（pool = kind；複合珠 skills 多鍵）─────────
const decoSrc = nameMap("decorations");
const decosOut = decoSrc.en.map((d) => {
  const skills = {};
  for (const s of d.skills ?? []) skills[skillZhName(s.skill.id)] = s.level;
  const primary = d.skills?.[0];
  return {
    id: `wd_${d.id}`,
    nameZh: zhName("decorations", d, decoSrc.zhById),
    slotLevel: d.slot,
    skillName: primary ? skillZhName(primary.skill.id) : "",
    skillLevel: primary?.level ?? 0,
    skills,
    pool: d.kind, // weapon | armor（Phase 0 定案 #2 珠雙池）
    craftable: true,
  };
});

// ───────── charms（可生產 60 家族 → 攤平逐級 183；RNG 4 排除，記稽核）─────────
const charmSrc = nameMap("charms");
const charmsOut = [];
const rngCharms = [];
for (const c of charmSrc.en) {
  const zc = charmSrc.zhById.get(c.id);
  for (let i = 0; i < c.ranks.length; i++) {
    const r = c.ranks[i];
    const zr = zc?.ranks?.[i];
    if (c.random) {
      rngCharms.push({ nameEn: r.name, rarity: r.rarity, slots: r.slots ?? [], skills: r.skills });
      continue; // RNG 不進候選池（使用者庫輸入，Phase 3/5）
    }
    const skills = {};
    for (const s of r.skills ?? []) skills[skillZhName(s.skill.id)] = s.level;
    charmsOut.push({
      id: `wc_${r.id}`,
      name: zr?.name ?? r.name,
      skills,
      slots: r.slots ?? [], // Wilds 護石無洞（同 World）
      rarity: r.rarity,
    });
  }
}

// ───────── weaponTypes（14；zh 為官方標準名，固定對照非虛構）─────────
const WT_ZH = {
  "great-sword": "大劍", "long-sword": "太刀", "sword-shield": "片手劍",
  "dual-blades": "雙劍", hammer: "大錘", "hunting-horn": "狩獵笛",
  lance: "長槍", gunlance: "銃槍", "switch-axe": "斬擊斧",
  "charge-blade": "充能斧", "insect-glaive": "操蟲棍", bow: "弓",
  "light-bowgun": "輕弩", "heavy-bowgun": "重弩",
};
const weaponTypesOut = Object.entries(WT_ZH).map(([id, zh]) => ({
  id, nameZh: zh, nameEn: id, supported: true,
}));

// ───────── manifest（pin 1.041；集中 manifest，資料檔保 bare-array）─────────
const manifest = {
  dataVersion: "1.041",
  sources: {
    mhdb: { snapshotDate: meta.snapshotDate, counts: meta.counts },
    kiranico: { ver: "1.040" },
  },
};

// ───────── 寫檔 ─────────
const counts = {
  armors: writeArr("armors.json", armorsOut),
  weapons: writeArr("weapons.json", weaponsOut),
  decorations: writeArr("decorations.json", decosOut),
  charms: writeArr("charms.json", charmsOut),
  skills: writeArr("skills.json", skillsOut),
  setBonuses: writeArr("setBonuses.json", setBonusesOut),
  groupSkills: writeArr("groupSkills.json", groupSkillsOut),
  weaponTypes: writeArr("weaponTypes.json", weaponTypesOut),
};
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("[import-wilds] 產出筆數:", JSON.stringify(counts));
console.log("[import-wilds] Artian 標記:", artianCount, "| RNG 護石(排除):", rngCharms.length);
console.log("[import-wilds] zh 缺(EN-fallback):", zhGaps.length);
console.log("[import-wilds] manifest:", JSON.stringify(manifest.sources.mhdb.counts), "pin", manifest.dataVersion, manifest.sources.mhdb.snapshotDate);
