import { db, type GameInstance, type GameTitle, HOME_GENERATION } from '../db/schema';

/** Single active-profile row (PRD schema's trainer_profile table). */
const TRAINER_PROFILE_ID = 'default';

/** Pokémon HOME is the default dex — no game-specific generation ceiling, everything HOME accepts fits. */
export const HOME_TITLE_ID = 'home';

/**
 * Static reference catalog of game titles (PRD 5) — every mainline release,
 * plus Pokémon HOME as the umbrella "everything" option. Box counts/pokedex
 * mappings are public, well-documented facts about each game's PC storage
 * system, not extracted assets (PRD 4.1); this is a hand-typed stand-in a
 * real build would source from a build-time ETL. Some entries (BDSP,
 * Legends: Arceus, DLC-expanded dexes) rely on PokeAPI pokedex resources
 * that are less certain to exist under these exact names — Regional View
 * already falls back to National View gracefully if a lookup fails, so a
 * wrong slug degrades rather than breaks.
 */
const SEED_TITLES: GameTitle[] = [
  { game_title_id: HOME_TITLE_ID, name: 'Pokémon HOME', generation: HOME_GENERATION, box_count: 200, boxes_slots: 30, box_width: 6, pokedex_slugs: ['national'], allows_pokemon_go: true },

  // Gen 1
  { game_title_id: 'red', name: 'Red', generation: 1, box_count: 12, boxes_slots: 20, box_width: 5, pokedex_slugs: ['kanto'], allows_pokemon_go: false },
  { game_title_id: 'blue', name: 'Blue', generation: 1, box_count: 12, boxes_slots: 20, box_width: 5, pokedex_slugs: ['kanto'], allows_pokemon_go: false },
  { game_title_id: 'yellow', name: 'Yellow', generation: 1, box_count: 12, boxes_slots: 20, box_width: 5, pokedex_slugs: ['kanto'], allows_pokemon_go: false },

  // Gen 2
  { game_title_id: 'gold', name: 'Gold', generation: 2, box_count: 14, boxes_slots: 20, box_width: 5, pokedex_slugs: ['original-johto'], allows_pokemon_go: false },
  { game_title_id: 'silver', name: 'Silver', generation: 2, box_count: 14, boxes_slots: 20, box_width: 5, pokedex_slugs: ['original-johto'], allows_pokemon_go: false },
  { game_title_id: 'crystal', name: 'Crystal', generation: 2, box_count: 14, boxes_slots: 20, box_width: 5, pokedex_slugs: ['original-johto'], allows_pokemon_go: false },

  // Gen 3
  { game_title_id: 'ruby', name: 'Ruby', generation: 3, box_count: 14, boxes_slots: 30, box_width: 6, pokedex_slugs: ['hoenn'], allows_pokemon_go: false },
  { game_title_id: 'sapphire', name: 'Sapphire', generation: 3, box_count: 14, boxes_slots: 30, box_width: 6, pokedex_slugs: ['hoenn'], allows_pokemon_go: false },
  { game_title_id: 'emerald', name: 'Emerald', generation: 3, box_count: 14, boxes_slots: 30, box_width: 6, pokedex_slugs: ['hoenn'], allows_pokemon_go: false },
  { game_title_id: 'firered', name: 'FireRed', generation: 3, box_count: 14, boxes_slots: 30, box_width: 6, pokedex_slugs: ['kanto'], allows_pokemon_go: false },
  { game_title_id: 'leafgreen', name: 'LeafGreen', generation: 3, box_count: 14, boxes_slots: 30, box_width: 6, pokedex_slugs: ['kanto'], allows_pokemon_go: false },

  // Gen 4
  { game_title_id: 'diamond', name: 'Diamond', generation: 4, box_count: 18, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-sinnoh'], allows_pokemon_go: false },
  { game_title_id: 'pearl', name: 'Pearl', generation: 4, box_count: 18, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-sinnoh'], allows_pokemon_go: false },
  { game_title_id: 'platinum', name: 'Platinum', generation: 4, box_count: 18, boxes_slots: 30, box_width: 6, pokedex_slugs: ['extended-sinnoh'], allows_pokemon_go: false },
  { game_title_id: 'heartgold', name: 'HeartGold', generation: 4, box_count: 18, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-johto'], allows_pokemon_go: false },
  { game_title_id: 'soulsilver', name: 'SoulSilver', generation: 4, box_count: 18, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-johto'], allows_pokemon_go: false },

  // Gen 5
  { game_title_id: 'black', name: 'Black', generation: 5, box_count: 24, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-unova'], allows_pokemon_go: false },
  { game_title_id: 'white', name: 'White', generation: 5, box_count: 24, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-unova'], allows_pokemon_go: false },
  { game_title_id: 'black2', name: 'Black 2', generation: 5, box_count: 24, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-unova'], allows_pokemon_go: false },
  { game_title_id: 'white2', name: 'White 2', generation: 5, box_count: 24, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-unova'], allows_pokemon_go: false },

  // Gen 6
  { game_title_id: 'x', name: 'X', generation: 6, box_count: 31, boxes_slots: 30, box_width: 6, pokedex_slugs: ['kalos-central', 'kalos-coastal', 'kalos-mountain'], allows_pokemon_go: false },
  { game_title_id: 'y', name: 'Y', generation: 6, box_count: 31, boxes_slots: 30, box_width: 6, pokedex_slugs: ['kalos-central', 'kalos-coastal', 'kalos-mountain'], allows_pokemon_go: false },
  { game_title_id: 'omegaruby', name: 'Omega Ruby', generation: 6, box_count: 31, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-hoenn'], allows_pokemon_go: false },
  { game_title_id: 'alphasapphire', name: 'Alpha Sapphire', generation: 6, box_count: 31, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-hoenn'], allows_pokemon_go: false },

  // Gen 7
  { game_title_id: 'sun', name: 'Sun', generation: 7, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-alola'], allows_pokemon_go: false },
  { game_title_id: 'moon', name: 'Moon', generation: 7, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-alola'], allows_pokemon_go: false },
  { game_title_id: 'ultrasun', name: 'Ultra Sun', generation: 7, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-alola'], allows_pokemon_go: false },
  { game_title_id: 'ultramoon', name: 'Ultra Moon', generation: 7, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['updated-alola'], allows_pokemon_go: false },
  { game_title_id: 'letsgopikachu', name: "Let's Go, Pikachu!", generation: 7, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['letsgo-kanto'], allows_pokemon_go: true },
  { game_title_id: 'letsgoeevee', name: "Let's Go, Eevee!", generation: 7, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['letsgo-kanto'], allows_pokemon_go: true },

  // Gen 8
  { game_title_id: 'sword', name: 'Sword', generation: 8, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['galar', 'isle-of-armor', 'crown-tundra'], allows_pokemon_go: false },
  { game_title_id: 'shield', name: 'Shield', generation: 8, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['galar', 'isle-of-armor', 'crown-tundra'], allows_pokemon_go: false },
  { game_title_id: 'brilliantdiamond', name: 'Brilliant Diamond', generation: 8, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-sinnoh'], allows_pokemon_go: false },
  { game_title_id: 'shiningpearl', name: 'Shining Pearl', generation: 8, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['original-sinnoh'], allows_pokemon_go: false },
  { game_title_id: 'legendsarceus', name: 'Legends: Arceus', generation: 8, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['hisui'], allows_pokemon_go: false },

  // Gen 9
  { game_title_id: 'scarlet', name: 'Scarlet', generation: 9, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['paldea', 'kitakami', 'blueberry'], allows_pokemon_go: false },
  { game_title_id: 'violet', name: 'Violet', generation: 9, box_count: 32, boxes_slots: 30, box_width: 6, pokedex_slugs: ['paldea', 'kitakami', 'blueberry'], allows_pokemon_go: false },
];

export async function ensureSeedTitles(): Promise<void> {
  // bulkPut (not bulkAdd) so this stays safe under concurrent callers: two
  // callers racing on a count-then-write check could both see zero rows and
  // both try to insert, and bulkAdd throws on the second write's duplicate
  // keys. put is an idempotent upsert, so redundant concurrent calls just
  // overwrite with the same data instead of throwing.
  await db.game_titles.bulkPut(SEED_TITLES);
}

export async function listGameTitles(): Promise<GameTitle[]> {
  await ensureSeedTitles();
  return db.game_titles.toArray();
}

export async function listGameInstances(): Promise<GameInstance[]> {
  // created_date isn't an indexed field, so orderBy() isn't available on it
  // (Dexie throws SchemaError) — sort in JS instead of adding an index for
  // what's a short, infrequently-read list.
  const instances = await db.game_instances.toArray();
  return instances.sort((a, b) => a.created_date.localeCompare(b.created_date));
}

export async function getActiveGameInstanceId(): Promise<string> {
  // Re-upserts SEED_TITLES on every bootstrap, not just on first-ever-run —
  // otherwise a schema change that adds a new GameTitle field (e.g.
  // pokedex_slugs) never reaches an existing user's already-seeded rows,
  // since ensureSeedTitles used to only run from inside createGameInstance.
  await ensureSeedTitles();

  // Everything below runs inside one transaction so two concurrent callers
  // (e.g. two components bootstrapping on first load) can't both observe
  // "no instance yet" and each create their own — IndexedDB serializes
  // competing readwrite transactions on the same stores instead of
  // interleaving them.
  return db.transaction('rw', db.trainer_profile, db.game_instances, db.game_titles, async () => {
    const profile = await db.trainer_profile.get(TRAINER_PROFILE_ID);
    if (profile?.active_game_instance_id) {
      const stillExists = await db.game_instances.get(profile.active_game_instance_id);
      if (stillExists) return profile.active_game_instance_id;
    }

    // No active save yet — create one so every screen has somewhere to write.
    const existing = await db.game_instances.toArray();
    if (existing.length > 0) {
      await setActiveGameInstance(existing[0].game_instance_id);
      return existing[0].game_instance_id;
    }
    return createGameInstance(HOME_TITLE_ID, false);
  });
}

/** Fetches the singleton trainer_profile row, creating it with defaults on first use. */
export async function getOrCreateTrainerProfile(): Promise<import('../db/schema').TrainerProfile> {
  const existing = await db.trainer_profile.get(TRAINER_PROFILE_ID);
  if (existing) return existing;
  const created = { id: TRAINER_PROFILE_ID, active_game_instance_id: null, trainer_name: 'Trainer', link_cable_trade_count: 0 };
  await db.trainer_profile.put(created);
  return created;
}

export async function setActiveGameInstance(gameInstanceId: string): Promise<void> {
  await db.transaction('rw', db.trainer_profile, async () => {
    const profile = await getOrCreateTrainerProfile();
    await db.trainer_profile.put({ ...profile, active_game_instance_id: gameInstanceId });
  });
}

export async function setTrainerName(name: string): Promise<void> {
  await db.transaction('rw', db.trainer_profile, async () => {
    const profile = await getOrCreateTrainerProfile();
    await db.trainer_profile.put({ ...profile, trainer_name: name });
  });
}

/** Bumped on every executed Link Cable trade (PRD 12.4 trade-count badge tiers). */
export async function incrementTradeCount(): Promise<void> {
  await db.transaction('rw', db.trainer_profile, async () => {
    const profile = await getOrCreateTrainerProfile();
    await db.trainer_profile.put({ ...profile, link_cable_trade_count: profile.link_cable_trade_count + 1 });
  });
}

export async function createGameInstance(gameTitleId: string, isNuzlockeMode: boolean): Promise<string> {
  await ensureSeedTitles();
  const gameInstanceId = crypto.randomUUID();
  await db.game_instances.add({
    game_instance_id: gameInstanceId,
    game_title_id: gameTitleId,
    isNuzlockeMode,
    created_date: new Date().toISOString(),
    is_victory: false,
  });
  await setActiveGameInstance(gameInstanceId);
  return gameInstanceId;
}
