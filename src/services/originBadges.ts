import { db } from '../db/schema';

export interface OriginBadge {
  gameInstanceId: string;
  gameTitleName: string;
}

/**
 * Cross-Game Overlays / Origin Badges (PRD 6.4) — for a set of species (by
 * Dex number), which other saves besides the active one already have them
 * caught. Batched into a handful of queries instead of one lookup per slot,
 * since a full box can have 30 species to check at once.
 */
export async function getOriginBadgesForSpecies(
  pokemonIds: number[],
  excludeInstanceId: string,
): Promise<Map<number, OriginBadge[]>> {
  if (pokemonIds.length === 0) return new Map();

  const entries = await db.vault.where('pokemon_id').anyOf(pokemonIds).toArray();
  const otherEntries = entries.filter((e) => e.current_game_instance_id !== excludeInstanceId);
  if (otherEntries.length === 0) return new Map();

  const instanceIds = [...new Set(otherEntries.map((e) => e.current_game_instance_id))];
  const instances = await db.game_instances.bulkGet(instanceIds);
  const instanceById = new Map(instances.filter(Boolean).map((i) => [i!.game_instance_id, i!]));

  const titleIds = [...new Set([...instanceById.values()].map((i) => i.game_title_id))];
  const titles = await db.game_titles.bulkGet(titleIds);
  const titleById = new Map(titles.filter(Boolean).map((t) => [t!.game_title_id, t!]));

  const result = new Map<number, OriginBadge[]>();
  for (const entry of otherEntries) {
    const instance = instanceById.get(entry.current_game_instance_id);
    if (!instance) continue;
    const title = titleById.get(instance.game_title_id);
    const list = result.get(entry.pokemon_id) ?? [];
    if (!list.some((b) => b.gameInstanceId === entry.current_game_instance_id)) {
      list.push({ gameInstanceId: entry.current_game_instance_id, gameTitleName: title?.name ?? 'Unknown' });
    }
    result.set(entry.pokemon_id, list);
  }
  return result;
}
