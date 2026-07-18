import { db, type VaultEntry } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { GRAVEYARD_BOX_INDEX, getNextBoxIndex } from './boxes';

export async function isNuzlockeMode(gameInstanceId: string): Promise<boolean> {
  const instance = await db.game_instances.get(gameInstanceId);
  return instance?.isNuzlockeMode ?? false;
}

export async function setNuzlockeMode(gameInstanceId: string, enabled: boolean): Promise<void> {
  await recordSnapshot('nuzlocke_toggle', `Nuzlocke Mode turned ${enabled ? 'on' : 'off'}`);
  await db.game_instances.update(gameInstanceId, { isNuzlockeMode: enabled });
}

/** Declares a Nuzlocke run won (PRD 12.4's "first Nuzlocke victory" badge) — a one-way flag, never auto-detected. */
export async function declareVictory(gameInstanceId: string): Promise<void> {
  await recordSnapshot('nuzlocke_victory', 'Declared Nuzlocke victory!');
  await db.game_instances.update(gameInstanceId, { is_victory: true });
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
  await recordSnapshot('catch', `Caught ${species} on ${routeLabel}`);

  await db.transaction('rw', db.vault, db.map_progress, async () => {
    const boxIndex = await getNextBoxIndex(gameInstanceId);
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
      box_index: boxIndex,
      captured_date: now,
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      moves: [],
      held_item: null,
      ball: null,
      origin_pokemon_go: false,
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
      sort_priority: boxIndex,
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
  });
}

/** Marks a specimen fainted and moves it to the locked Graveyard box (PRD 10, rule 1). */
export async function markFainted(uuid: string): Promise<void> {
  const entry = await db.vault.get(uuid);
  if (!entry) return;
  const now = new Date().toISOString();
  await recordSnapshot('faint', `${entry.species} fainted`);
  await db.vault.update(uuid, {
    dead: true,
    box_index: GRAVEYARD_BOX_INDEX,
    history_log: [...entry.history_log, { timestamp: now, action: 'fainted', details: 'Fainted — moved to Graveyard.' }],
  });
}
