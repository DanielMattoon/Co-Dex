import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';

/**
 * Mark All / Unmark All / Revert to Selected (PRD 6.1, 6.8), scoped to
 * either a whole dex (`${gameInstanceId}::ALL`) or one box within it
 * (`${gameInstanceId}::box-${n}`). Every mass action snapshots exactly the
 * specimens in scope to `mass_action_snapshots` first — a dedicated,
 * unpruned table (unlike Version History's 30-day/50-action window) so
 * Revert to Selected keeps working regardless of how long ago the mass
 * action happened, and only ever touches this one scope's specimens.
 */
async function snapshotScope(scopeKey: string, gameInstanceId: string, pokemonIds: number[]) {
  const all = await db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray();
  const inScope = all.filter((e) => pokemonIds.includes(e.pokemon_id));
  await db.mass_action_snapshots.put({
    scope_key: scopeKey,
    game_instance_id: gameInstanceId,
    pokemon_ids: pokemonIds,
    timestamp: new Date().toISOString(),
    entries: inScope,
  });
  return inScope;
}

export interface MarkAllTarget {
  pokemonId: number;
  species: string;
  gender: 'male' | 'female' | 'genderless';
  form: string;
}

/** Catches one of every uncaught target in scope, after snapshotting the scope's prior state. */
export async function markAll(
  scopeKey: string,
  gameInstanceId: string,
  targets: MarkAllTarget[],
  catchOne: (target: MarkAllTarget) => Promise<void>,
): Promise<void> {
  await recordSnapshot('mass_catch', `Mark All (${targets.length} species) in one dex/box`);
  const inScope = await snapshotScope(scopeKey, gameInstanceId, targets.map((t) => t.pokemonId));
  const ownedIds = new Set(inScope.map((e) => e.pokemon_id));
  for (const t of targets) {
    if (!ownedIds.has(t.pokemonId)) await catchOne(t);
  }
}

/** Releases every specimen in scope, after snapshotting the scope's prior state. */
export async function unmarkAll(scopeKey: string, gameInstanceId: string, pokemonIds: number[]): Promise<void> {
  await recordSnapshot('mass_release', `Unmark All (${pokemonIds.length} species) in one dex/box`);
  const inScope = await snapshotScope(scopeKey, gameInstanceId, pokemonIds);
  await db.vault.bulkDelete(inScope.map((e) => e.uuid));
}

export async function hasRevertAvailable(scopeKey: string): Promise<boolean> {
  return (await db.mass_action_snapshots.get(scopeKey)) !== undefined;
}

/** Restores this scope's specimens to exactly the state they were in right before the last Mark All/Unmark All. */
export async function revertToSelected(scopeKey: string): Promise<boolean> {
  const snap = await db.mass_action_snapshots.get(scopeKey);
  if (!snap) return false;
  await recordSnapshot('mass_revert', 'Reverted to the state before the last Mark All/Unmark All');
  const current = (await db.vault.where('current_game_instance_id').equals(snap.game_instance_id).toArray()).filter((e) =>
    snap.pokemon_ids.includes(e.pokemon_id),
  );
  await db.transaction('rw', db.vault, async () => {
    await db.vault.bulkDelete(current.map((e) => e.uuid));
    if (snap.entries.length > 0) await db.vault.bulkAdd(snap.entries);
  });
  return true;
}
