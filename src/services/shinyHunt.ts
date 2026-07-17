import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { getNextBoxIndex } from './boxes';

/**
 * Converts a completed hunt directly into a verified shiny Vault entry
 * (PRD 11.2 — "a single click... converts the tracking widget directly into
 * a verified shiny specimen"). Lands in the next open box slot, same as any
 * other catch.
 */
export async function catchFromHunt(
  gameInstanceId: string,
  species: string,
  pokemonId: number,
  level: number,
  encounterCount: number,
  perEncounterProbability: number,
): Promise<void> {
  await recordSnapshot('catch', `Caught a shiny ${species} after a hunt!`);
  const boxIndex = await getNextBoxIndex(gameInstanceId);
  const now = new Date().toISOString();
  await db.vault.add({
    uuid: crypto.randomUUID(),
    species,
    pokemon_id: pokemonId,
    nickname: null,
    level,
    hp: 100,
    dead: false,
    gender: 'genderless',
    shiny: true,
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
    ball: null,
    tags: ['shiny-hunt'],
    reservation_status: { is_reserved: false, target_evolution_id: null },
    breeding_project_lock: { is_locked: false, notes: null },
    history_log: [{ timestamp: now, action: 'caught', details: `Shiny hunt completed after ${encounterCount} encounter(s).` }],
    is_sandbox_anomalous: false,
    sort_priority: boxIndex,
  });

  await db.shiny_hunt_log.add({
    id: crypto.randomUUID(),
    species,
    pokemon_id: pokemonId,
    encounters: encounterCount,
    per_encounter_probability: perEncounterProbability,
    timestamp: now,
  });
}
