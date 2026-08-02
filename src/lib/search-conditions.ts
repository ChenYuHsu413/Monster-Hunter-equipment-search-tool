import type {
  Charm,
  ExcludedItems,
  FixedParts,
  SkillMap,
} from "@/types/build";
import { normalizeSlots } from "./slot-utils";

/**
 * 搜尋條件的單一 state 物件與序列化/反序列化。
 *
 * 設計目的：
 * - 主頁所有「使用者指定的搜尋條件」收斂成一個物件，persist 到 localStorage
 * - 之後的「推薦配裝匯入」功能可直接以 deserialize 帶入完整條件
 */

/** 登錄在「我的護石」清單中的一顆護石：最多 2 個技能 + 孔位。 */
export type OwnedCharm = {
  id: string;
  /** 技能列（最多 2 個，name 為空的列不儲存）。 */
  skills: { name: string; level: number }[];
  /** 孔位等級陣列（已去零），例如 [2,1]。 */
  slots: number[];
  /**
   * Wilds 珠雙池：與 slots 平行的逐洞池別（weapon | armor）。Wilds RNG 護石洞位帶歸屬，
   * 缺此欄（Rise/舊護石）→ 引擎視為防具池（build-search wilds 分支預設 armor）。
   */
  slotPools?: ("weapon" | "armor")[];
  /** 來源標記：由推薦配裝匯入的護石標 "reco"（可辨識、可刪，與自有護石並存）。 */
  source?: "reco";
};

export type SearchConditions = {
  version: 1;
  /** 必要技能（含等級）：一定要達成。 */
  requiredSkills: SkillMap;
  /** 排除技能：最終配裝不得出現（硬條件，無等級概念）。 */
  excludedSkills: string[];
  /** 鎖定裝備（武器 + 五部位，存 id）。 */
  fixedParts: FixedParts;
  /** 排除裝備。 */
  excludedItems: ExcludedItems;
  /** 我的護石清單。 */
  charms: OwnedCharm[];
  /** 護石開關：false = 搜尋不使用護石。 */
  useCharms: boolean;
};

export const EMPTY_SEARCH_CONDITIONS: SearchConditions = {
  version: 1,
  requiredSkills: {},
  excludedSkills: [],
  fixedParts: {},
  excludedItems: { armorIds: [], weaponIds: [] },
  charms: [],
  useCharms: true,
};

/** OwnedCharm → 搜尋引擎用的 Charm（技能列合併成 SkillMap，同名累加）。 */
export function ownedCharmToCharm(c: OwnedCharm): Charm {
  const skills: SkillMap = {};
  for (const s of c.skills) {
    if (s.name) skills[s.name] = (skills[s.name] ?? 0) + s.level;
  }
  // name 不含孔位（結果卡片另有孔位欄），僅供標明「用了哪顆」
  const name =
    c.skills
      .filter((s) => s.name)
      .map((s) => `${s.name}${s.level}`)
      .join("・") || "無技能護石";
  return {
    id: c.id,
    name,
    skills,
    slots: c.slots,
    ...(c.slotPools ? { slotPools: c.slotPools } : {}),
  };
}

/** 護石的可讀標籤，例如「攻擊2・弱點特效1（2-1）」。 */
export function ownedCharmLabel(c: OwnedCharm): string {
  const skills = c.skills
    .filter((s) => s.name)
    .map((s) => `${s.name}${s.level}`)
    .join("・");
  const slots = c.slots.filter((s) => s > 0);
  return `${skills || "無技能"}（${slots.length ? slots.join("-") : "無洞"}）`;
}

export function serializeSearchConditions(c: SearchConditions): string {
  return JSON.stringify(c);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function sanitizeSkillMap(v: unknown): SkillMap {
  if (!isRecord(v)) return {};
  const out: SkillMap = {};
  for (const [name, lvl] of Object.entries(v)) {
    const n = Number(lvl);
    if (name && Number.isFinite(n) && n > 0) out[name] = Math.floor(n);
  }
  return out;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

const FIXED_KEYS = ["weapon", "head", "chest", "arms", "waist", "legs"] as const;

function sanitizeFixedParts(v: unknown): FixedParts {
  if (!isRecord(v)) return {};
  const out: FixedParts = {};
  for (const key of FIXED_KEYS) {
    const id = v[key];
    if (typeof id === "string" && id) out[key] = id;
  }
  return out;
}

function sanitizeCharms(v: unknown): OwnedCharm[] {
  if (!Array.isArray(v)) return [];
  const out: OwnedCharm[] = [];
  for (const raw of v) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    const skills = Array.isArray(raw.skills)
      ? raw.skills
          .filter(
            (s): s is { name: string; level: number } =>
              isRecord(s) &&
              typeof s.name === "string" &&
              s.name.length > 0 &&
              Number.isFinite(Number(s.level))
          )
          .slice(0, 2)
          .map((s) => ({ name: s.name, level: Math.max(1, Math.floor(Number(s.level))) }))
      : [];
    const rawSlots = Array.isArray(raw.slots)
      ? raw.slots.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    const rawPools = Array.isArray(raw.slotPools) ? raw.slotPools : null;
    // Wilds：slots 與 slotPools 需保持對齊 → 配對後一起去零/降冪排序，再拆開（無 pools 則沿用 normalize）。
    let slots: number[];
    let slotPools: ("weapon" | "armor")[] | undefined;
    if (rawPools) {
      const paired = rawSlots
        .map((s, i) => ({ s, p: rawPools[i] === "weapon" ? "weapon" : "armor" }) as { s: number; p: "weapon" | "armor" })
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
      slots = paired.map((x) => x.s);
      slotPools = paired.map((x) => x.p);
    } else {
      slots = normalizeSlots(rawSlots);
    }
    out.push({
      id: raw.id,
      skills,
      slots,
      ...(slotPools ? { slotPools } : {}),
      ...(raw.source === "reco" ? { source: "reco" as const } : {}),
    });
  }
  return out;
}

/**
 * 反序列化 + 逐欄位驗證/補預設值。壞資料整欄退回預設，不整包丟棄。
 * 亦為「推薦配裝匯入」的入口：外部來源只要產出同構 JSON 即可帶入。
 */
export function deserializeSearchConditions(raw: unknown): SearchConditions {
  const v = typeof raw === "string" ? safeParse(raw) : raw;
  if (!isRecord(v)) return { ...EMPTY_SEARCH_CONDITIONS };
  const excluded = isRecord(v.excludedItems) ? v.excludedItems : {};
  return {
    version: 1,
    requiredSkills: sanitizeSkillMap(v.requiredSkills),
    excludedSkills: sanitizeStringArray(v.excludedSkills),
    fixedParts: sanitizeFixedParts(v.fixedParts),
    excludedItems: {
      armorIds: sanitizeStringArray(excluded.armorIds),
      weaponIds: sanitizeStringArray(excluded.weaponIds),
    },
    charms: sanitizeCharms(v.charms),
    useCharms: v.useCharms !== false,
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 一次性遷移：從改版前的零散 localStorage key 組出 SearchConditions。
 * 只在新 key（mhsb.searchConditions）不存在時由頁面呼叫；找不到任何舊資料回傳 null。
 * 舊評分相關 key（mhsb.preferred / mhsb.weights）直接忽略。
 */
export function migrateLegacyConditions(): SearchConditions | null {
  if (typeof window === "undefined") return null;
  const read = (key: string): unknown => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const required = read("mhsb.required");
  const avoid = read("mhsb.avoid");
  const fixedParts = read("mhsb.fixedParts");
  const excludedItems = read("mhsb.excluded");
  const charmLibrary = read("mhsb.charmLibrary");
  if (
    required === undefined &&
    avoid === undefined &&
    fixedParts === undefined &&
    excludedItems === undefined &&
    charmLibrary === undefined
  ) {
    return null;
  }

  // 舊護石庫：{ id, rows: {name, level}[], slots: "2-1-0" }
  const charms: OwnedCharm[] = [];
  if (Array.isArray(charmLibrary)) {
    for (const c of charmLibrary) {
      if (!isRecord(c) || typeof c.id !== "string") continue;
      const rows = Array.isArray(c.rows) ? c.rows : [];
      const slotsStr = typeof c.slots === "string" ? c.slots : "";
      charms.push({
        id: c.id,
        skills: rows
          .filter(
            (r): r is { name: string; level: number } =>
              isRecord(r) && typeof r.name === "string" && r.name.length > 0
          )
          .slice(0, 2)
          .map((r) => ({ name: r.name, level: Math.max(1, Number(r.level) || 1) })),
        slots: normalizeSlots(
          slotsStr.split("-").map((x) => parseInt(x, 10)).filter((n) => !isNaN(n))
        ),
      });
    }
  }

  return deserializeSearchConditions({
    requiredSkills: required,
    // 舊排除技能為 SkillMap（等級無意義），取 key 即可
    excludedSkills: isRecord(avoid) ? Object.keys(avoid) : [],
    fixedParts,
    excludedItems,
    charms,
    useCharms: true,
  });
}
