import type { ArmorPiece, GameId, Weapon } from "@/types/build";

/**
 * 大型遊戲資料（防具 + 武器，Rise 合計 ~1.8MB）的延遲載入，per-game。
 *
 * 這兩包資料只有在使用者實際操作（開武器選單 / 按搜尋）時才需要，
 * 因此用動態 import 讓 webpack 拆成獨立 chunk，不進首屏 bundle。
 * 每款遊戲各自一份 chunk（rise/、world/），以 gameId 為快取鍵。
 *
 * 小型資料（技能 / 珠子 / 武器類型 / 套裝加成）仍在 data.ts 載入。
 *
 * gameId 預設 "rise"：多遊戲改造期間，所有現有無參呼叫端行為與改造前完全相同。
 */
export type GameData = {
  armors: ArmorPiece[];
  weapons: Weapon[];
  armorById: Record<string, ArmorPiece>;
  weaponById: Record<string, Weapon>;
};

const cache = new Map<GameId, GameData>();
const inflight = new Map<GameId, Promise<GameData>>();

function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const it of items) map[it.id] = it;
  return map;
}

/**
 * 依 gameId 載入原始 armors/weapons。
 * 以顯式分支（非 template 動態路徑）確保 webpack 為各遊戲產出獨立且可預期的 chunk，
 * 且不會在 Phase 1（world 資料尚未產出）引用不存在的模組。
 */
function loadRaw(gameId: GameId): Promise<[unknown, unknown]> {
  if (gameId === "rise") {
    return Promise.all([
      import("@/data/rise/armors.json"),
      import("@/data/rise/weapons.json"),
    ]);
  }
  if (gameId === "wilds") {
    // Wilds（PLAN Phase 5 接上 UI）：獨立動態 chunk，不進首屏。
    return Promise.all([
      import("@/data/wilds/armors.json"),
      import("@/data/wilds/weapons.json"),
    ]);
  }
  // World（PLAN Phase 5 接上 UI）：各自獨立動態 chunk，不進首屏。
  return Promise.all([
    import("@/data/world/armors.json"),
    import("@/data/world/weapons.json"),
  ]);
}

/** 已載入時同步取得，否則 null。 */
export function getLoadedGameData(gameId: GameId = "rise"): GameData | null {
  return cache.get(gameId) ?? null;
}

/** 載入（並快取）指定遊戲的防具與武器資料。重複呼叫共用同一個 in-flight promise。 */
export function loadGameData(gameId: GameId = "rise"): Promise<GameData> {
  const cached = cache.get(gameId);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(gameId);
  if (existing) return existing;
  const p = loadRaw(gameId).then(([armorsMod, weaponsMod]) => {
    const armors = (armorsMod as { default: unknown }).default as ArmorPiece[];
    const weapons = (weaponsMod as { default: unknown }).default as Weapon[];
    const gd: GameData = {
      armors,
      weapons,
      armorById: indexById(armors),
      weaponById: indexById(weapons),
    };
    cache.set(gameId, gd);
    return gd;
  });
  inflight.set(gameId, p);
  return p;
}
