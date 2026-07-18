import { db, type GameInstance, type GameTitle } from '../db/schema';

/** Single active-profile row (PRD schema's trainer_profile table). */
const TRAINER_PROFILE_ID = 'default';

/**
 * Static reference catalog of game titles (PRD 5) — box counts are public,
 * well-documented facts about each game's PC storage system, not extracted
 * assets (PRD 4.1). A real build sources this from a build-time ETL against
 * the pret decompilation projects; this is a small hand-typed stand-in
 * covering one title per generation.
 */
const SEED_TITLES: GameTitle[] = [
  { game_title_id: 'firered', name: 'FireRed', generation: 3, box_count: 14, boxes_slots: 30, pokedex_slugs: ['kanto'] },
  { game_title_id: 'emerald', name: 'Emerald', generation: 3, box_count: 14, boxes_slots: 30, pokedex_slugs: ['hoenn'] },
  { game_title_id: 'heartgold', name: 'HeartGold', generation: 4, box_count: 18, boxes_slots: 30, pokedex_slugs: ['updated-johto'] },
  { game_title_id: 'platinum', name: 'Platinum', generation: 4, box_count: 18, boxes_slots: 30, pokedex_slugs: ['extended-sinnoh'] },
  { game_title_id: 'white', name: 'White', generation: 5, box_count: 24, boxes_slots: 30, pokedex_slugs: ['original-unova'] },
  { game_title_id: 'y', name: 'Y', generation: 6, box_count: 31, boxes_slots: 30, pokedex_slugs: ['kalos-central', 'kalos-coastal', 'kalos-mountain'] },
  { game_title_id: 'sun', name: 'Sun', generation: 7, box_count: 32, boxes_slots: 30, pokedex_slugs: ['original-alola'] },
  { game_title_id: 'sword', name: 'Sword', generation: 8, box_count: 32, boxes_slots: 30, pokedex_slugs: ['galar'] },
  { game_title_id: 'scarlet', name: 'Scarlet', generation: 9, box_count: 32, boxes_slots: 30, pokedex_slugs: ['paldea'] },
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
    return createGameInstance(SEED_TITLES[0].game_title_id, false);
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
