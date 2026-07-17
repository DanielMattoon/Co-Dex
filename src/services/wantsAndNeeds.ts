import { db } from '../db/schema';
import { listAllSpeciesWithIds } from './pokeapi';
import { ensureSeedCatalog } from './collectibles';

/**
 * Auto-generated "Wants & Needs Sheet" (PRD 12.1) — pulled from the gaps in
 * the trainer's active game instances: species not yet owned anywhere, and
 * cataloged games not yet in the Collection.
 */
export interface WantsAndNeeds {
  missingSpecies: { name: string; pokemonId: number }[];
  missingGames: { catalogId: string; name: string }[];
}

export async function getWantsAndNeeds(): Promise<WantsAndNeeds> {
  await ensureSeedCatalog();
  const [allSpecies, allVault, catalog, copies] = await Promise.all([
    listAllSpeciesWithIds().catch(() => []),
    db.vault.toArray(),
    db.collectible_catalog.toArray(),
    db.collectible_copies.toArray(),
  ]);

  const ownedIds = new Set(allVault.map((e) => e.pokemon_id));
  const missingSpecies = allSpecies
    .filter((s) => !ownedIds.has(s.pokemonId))
    .map((s) => ({ name: s.name, pokemonId: s.pokemonId }));

  const ownedCatalogIds = new Set(copies.map((c) => c.catalog_id));
  const missingGames = catalog
    .filter((c) => !ownedCatalogIds.has(c.catalog_id))
    .map((c) => ({ catalogId: c.catalog_id, name: c.name }));

  return { missingSpecies, missingGames };
}
