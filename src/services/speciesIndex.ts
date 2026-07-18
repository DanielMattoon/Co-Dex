import { listAllSpeciesWithIds } from './pokeapi';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[.''’:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let cached: Map<string, number> | null = null;
let inflight: Promise<Map<string, number>> | null = null;

/**
 * Shared species-name → national Dex number lookup (normalized so
 * "Mr. Mime"/"mr-mime" both resolve), used anywhere a Pokémon dropdown
 * needs a sprite next to a name that didn't already come with its own
 * pokemonId (e.g. @smogon/calc's species list, which has names but no
 * Dex numbers).
 */
export async function getSpeciesIdIndex(): Promise<Map<string, number>> {
  if (cached) return cached;
  if (!inflight) {
    inflight = listAllSpeciesWithIds()
      .then((species) => {
        const map = new Map<string, number>();
        for (const s of species) map.set(normalize(s.name), s.pokemonId);
        cached = map;
        return map;
      })
      .catch(() => new Map<string, number>());
  }
  return inflight;
}

export function lookupSpeciesId(index: Map<string, number>, name: string): number | undefined {
  return index.get(normalize(name));
}
