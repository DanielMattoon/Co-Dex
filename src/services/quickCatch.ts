import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { getNextBoxIndex } from './boxes';

export interface QuickCatchParams {
  gameInstanceId: string;
  species: string;
  pokemonId: number;
  level: number;
  shiny: boolean;
  nickname: string | null;
  ball: string | null;
}

/**
 * Direct "I own this" declaration from the unified species grid (tap an
 * uncaught tile to catch it, or "+" a duplicate) — no route/encounter
 * context, so unlike registerCatch this never touches Nuzlocke's
 * one-catch-per-route lock. Same bypass precedent as Smart-Map Import and
 * the Shiny Hunt Companion, both of which are also manual declarations
 * rather than wild encounters.
 */
export async function quickCatch(params: QuickCatchParams): Promise<void> {
  const { gameInstanceId, species, pokemonId, level, shiny, nickname, ball } = params;
  await recordSnapshot('catch', `Caught ${species}${shiny ? ' (shiny)' : ''}`);

  await db.transaction('rw', db.vault, async () => {
    const boxIndex = await getNextBoxIndex(gameInstanceId);
    const now = new Date().toISOString();
    await db.vault.add({
      uuid: crypto.randomUUID(),
      species,
      pokemon_id: pokemonId,
      nickname,
      level,
      hp: 100,
      dead: false,
      gender: 'genderless',
      shiny,
      form: 'default',
      catchLocation: null,
      origin_game_instance_id: gameInstanceId,
      current_game_instance_id: gameInstanceId,
      box_index: boxIndex,
      captured_date: now,
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      moves: [],
      held_item: null,
      ball,
      tags: [],
      reservation_status: { is_reserved: false, target_evolution_id: null },
      breeding_project_lock: { is_locked: false, notes: null },
      history_log: [{ timestamp: now, action: 'caught', details: 'Caught via the Living Dex.' }],
      is_sandbox_anomalous: false,
      sort_priority: boxIndex,
    });
  });
}
