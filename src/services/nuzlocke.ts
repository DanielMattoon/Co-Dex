import { db, type VaultEntry } from '../db/schema';

/** No game-instance selection UI exists yet — placeholder scope key, shared with Map/Vault. */
export const DEFAULT_GAME_INSTANCE_ID = 'demo_instance';
export const DEFAULT_GAME_TITLE_ID = 'demo_title';

/** Reserved box_index for fainted Nuzlocke specimens — a locked Graveyard box (PRD 10). */
export const GRAVEYARD_BOX_INDEX = -1;

/** Guarantees the demo game instance exists so Nuzlocke state has somewhere to live. */
export async function ensureDefaultGameInstance(): Promise<void> {
  const existing = await db.game_instances.get(DEFAULT_GAME_INSTANCE_ID);
  if (existing) return;
  await db.game_titles.put({
    game_title_id: DEFAULT_GAME_TITLE_ID,
    name: 'Demo Save',
    generation: 9,
    box_count: 1,
    boxes_slots: 30,
  });
  await db.game_instances.put({
    game_instance_id: DEFAULT_GAME_INSTANCE_ID,
    game_title_id: DEFAULT_GAME_TITLE_ID,
    isNuzlockeMode: false,
    created_date: new Date().toISOString(),
  });
}

export async function isNuzlockeMode(gameInstanceId: string): Promise<boolean> {
  const instance = await db.game_instances.get(gameInstanceId);
  return instance?.isNuzlockeMode ?? false;
}

export async function setNuzlockeMode(gameInstanceId: string, enabled: boolean): Promise<void> {
  await ensureDefaultGameInstance();
  await db.game_instances.update(gameInstanceId, { isNuzlockeMode: enabled });
}

/** Whether a route's first-encounter slot is still open (PRD 10, rule 2). */
export async function canCatchOnRoute(routeId: string, gameInstanceId: string): Promise<boolean> {
  if (!(await isNuzlockeMode(gameInstanceId))) return true;
  const progressId = `${gameInstanceId}_${routeId}`;
  const progress = await db.map_progress.get(progressId);
  return !(progress?.firstEncounterLogged ?? false);
}

interface CatchParams {
  uuid: string;
  species: string;
  pokemonId: number;
  routeId: string;
  routeLabel: string;
  gameInstanceId: string;
  level: number;
}

/** Registers a new catch, logging location/level/date and locking the route under Nuzlocke (PRD 10, rule 3). */
export async function registerCatch(params: CatchParams): Promise<void> {
  const { uuid, species, pokemonId, routeId, routeLabel, gameInstanceId, level } = params;
  const now = new Date().toISOString();
  const nuzlocke = await isNuzlockeMode(gameInstanceId);

  const entry: VaultEntry = {
    uuid,
    species,
    pokemon_id: pokemonId,
    nickname: null,
    level,
    hp: 100,
    dead: false,
    gender: 'genderless',
    shiny: false,
    form: 'base',
    catchLocation: routeLabel,
    origin_game_instance_id: gameInstanceId,
    current_game_instance_id: gameInstanceId,
    box_index: 0,
    captured_date: now,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [],
    held_item: null,
    tags: [],
    reservation_status: { is_reserved: false, target_evolution_id: null },
    breeding_project_lock: { is_locked: false, notes: null },
    history_log: [
      {
        timestamp: now,
        action: 'captured',
        details: `Caught on ${routeLabel} at level ${level}.`,
      },
    ],
    is_sandbox_anomalous: false,
  };
  await db.vault.put(entry);

  if (nuzlocke) {
    const progressId = `${gameInstanceId}_${routeId}`;
    const current = await db.map_progress.get(progressId);
    await db.map_progress.put({
      id: progressId,
      routeId,
      game_instance_id: gameInstanceId,
      firstEncounterLogged: true,
      itemChecklist: current?.itemChecklist ?? {},
    });
  }
}

/** Marks a specimen fainted and moves it to the locked Graveyard box (PRD 10, rule 1). */
export async function markFainted(uuid: string): Promise<void> {
  const entry = await db.vault.get(uuid);
  if (!entry) return;
  const now = new Date().toISOString();
  await db.vault.update(uuid, {
    dead: true,
    box_index: GRAVEYARD_BOX_INDEX,
    history_log: [...entry.history_log, { timestamp: now, action: 'fainted', details: 'Fainted — moved to Graveyard.' }],
  });
}
