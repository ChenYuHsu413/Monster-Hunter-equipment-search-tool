import type {
  Charm,
  GroupSkill,
  SetBonus,
  Skill,
} from "@/types/build";
import * as wildsEfr from "./efr-wilds";
import { buildStaticData, registerGameStaticData, type GameStaticData } from "./data";
import {
  getGameProfile,
  registerGameProfile,
  type GameProfile,
} from "./game-profile";
import type { SearchDeps, WildsSearchExt } from "./build-search";

/**
 * Wilds（Monster Hunter Wilds）執行期註冊（PLAN-wilds Phase 3）。
 *
 * 把 Phase 2 產出的 wilds 資料（src/data/wilds/*.json，pin 1.041）接上 game-profile /
 * game-data 抽象層，並提供 loadWildsSearchDeps()（含 WildsSearchExt 閘門）給搜尋。
 * 介面比照 world-registry.ts；所有 wilds JSON 皆動態 import → 獨立 lazy chunk、不進首屏 bundle。
 *
 * profile.efr ＝ `efr-wilds.ts`（Phase 4：斬味考證 base/max + 技能逐級值機械抽取，同介面）。
 * UI（三遊戲切換）是 Phase 5——本檔**不**動 GAMES/UI 清單，確認無 UI 路徑可達 wilds。
 */

export type WildsStatic = {
  data: GameStaticData;
  skillByName: Record<string, Skill>;
  setBonusById: Record<string, SetBonus>;
  groupById: Record<string, GroupSkill>;
  /** 技能名 → 池別（skill.kind）。珠雙池分割與相關度用。 */
  skillKind: Record<string, "weapon" | "armor" | "group" | "set" | undefined>;
  secretSkillNames: string[];
  charms: Charm[];
};

let wildsStatic: WildsStatic | null = null;

/** 載入並註冊 wilds 小資料 + profile（冪等；動態 import，不進首屏）。 */
export async function ensureWildsRegistered(): Promise<WildsStatic> {
  if (wildsStatic) return wildsStatic;
  const [decMod, skMod, wtMod, sbMod, grpMod, chMod] = await Promise.all([
    import("@/data/wilds/decorations.json"),
    import("@/data/wilds/skills.json"),
    import("@/data/wilds/weaponTypes.json"),
    import("@/data/wilds/setBonuses.json"),
    import("@/data/wilds/groupSkills.json"),
    import("@/data/wilds/charms.json"),
  ]);
  const skills = skMod.default as unknown as Skill[];
  const setBonuses = sbMod.default as unknown as SetBonus[];
  const groups = grpMod.default as unknown as GroupSkill[];
  const charms = chMod.default as unknown as Charm[];

  const data = buildStaticData(
    decMod.default as never,
    skills,
    wtMod.default as never,
    setBonuses
  );
  registerGameStaticData("wilds", data);

  const skillByName: Record<string, Skill> = {};
  const skillKind: Record<string, "weapon" | "armor" | "group" | "set" | undefined> = {};
  for (const s of skills) {
    skillByName[s.name] = s;
    skillKind[s.name] = s.kind;
  }
  const setBonusById: Record<string, SetBonus> = {};
  for (const b of setBonuses) setBonusById[b.id] = b;
  const groupById: Record<string, GroupSkill> = {};
  for (const g of groups) groupById[g.id] = g;
  // Wilds 目前無 secret 解放（skills 無 secretMaxLevel）。
  const secretSkillNames = skills
    .filter((s) => s.secretMaxLevel != null)
    .map((s) => s.name);

  // Wilds profile（efr = STUB；charmMode 混合；set/group 開；無 rampage/qurio/secret）。
  const profile: GameProfile = {
    id: "wilds",
    labelZh: "Wilds",
    efr: {
      computeEfr: wildsEfr.computeEfr,
      EFR_RELEVANT_SKILLS: wildsEfr.EFR_RELEVANT_SKILLS,
    },
    charmMode: "mixed",
    features: {
      rampage: false,
      qurioAugment: false,
      charmDominancePruning: false,
      setBonus: true,
      secretSkills: false,
    },
    storagePrefix: "mhwd.",
    // Wilds 無 secret 解放路徑：恆回傳靜態上限（未列技能 Infinity＝不截斷，同 Rise 語意）。
    resolveSkillMax(skill: string): number {
      return data.skillMax[skill] ?? Infinity;
    },
  };
  registerGameProfile(profile);

  wildsStatic = { data, skillByName, setBonusById, groupById, skillKind, secretSkillNames, charms };
  return wildsStatic;
}

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  const m: Record<string, T> = {};
  for (const it of items) m[it.id] = it;
  return m;
}

/** 建 wilds 搜尋相依（含 WildsSearchExt 閘門）。armors/weapons 動態 import。 */
export async function loadWildsSearchDeps(): Promise<SearchDeps> {
  const s = await ensureWildsRegistered();
  const [armorsMod, weaponsMod] = await Promise.all([
    import("@/data/wilds/armors.json"),
    import("@/data/wilds/weapons.json"),
  ]);
  const armors = armorsMod.default as never[];
  const weapons = weaponsMod.default as never[];
  const wilds: WildsSearchExt = {
    profile: getGameProfile("wilds"),
    setBonusById: s.setBonusById,
    groupById: s.groupById,
    secretSkillNames: s.secretSkillNames,
    skillByName: s.skillByName,
    skillKind: s.skillKind,
    charmPool: s.charms,
  };
  return {
    armors,
    weapons,
    armorById: indexById(armors),
    weaponById: indexById(weapons),
    decorationsBySkill: s.data.decorationsBySkill,
    skillMax: s.data.skillMax,
    wilds,
  };
}
