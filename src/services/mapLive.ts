import { cachedFetch } from './pokeapi';

const BASE = 'https://pokeapi.co/api/v2';

/**
 * Real, live per-game Map data (PRD 7) — sourced from PokeAPI's region/
 * location/location-area/encounter resources at runtime, never hand-typed
 * or bundled, per the zero-asset-repository rule. This is the generalizable
 * model every future title plugs into: add one entry to GAME_MAP_CONFIG and
 * its whole region's real route list + wild encounter tables come alive.
 *
 * What ISN'T available from PokeAPI (disclosed, not faked): trainer battle
 * rosters and on-the-ground item placements. No public, freely-fetchable
 * API models "which trainer stands where with which team" or "where is the
 * Potion on the ground" for a specific route — that's exactly the kind of
 * data the pret decompilation projects would have to supply, which is why
 * the ORIGINAL hand-typed SAMPLE_ROUTE (mapData.ts) already documented that
 * pipeline as a future, separate undertaking. This file only ever states
 * what PokeAPI actually gives: real wild encounters, real level ranges,
 * real rates.
 */
export interface GameMapConfig {
  region: string;
  /** PokeAPI version name (not version-group) — encounter data is filtered to exactly this game, not its sibling version. */
  version: string;
}

export const GAME_MAP_CONFIG: Record<string, GameMapConfig> = {
  firered: { region: 'kanto', version: 'firered' },
  emerald: { region: 'hoenn', version: 'emerald' },
  platinum: { region: 'sinnoh', version: 'platinum' },
  heartgold: { region: 'johto', version: 'heartgold' },
};

export interface LiveLocation {
  name: string;
}

interface RawRegionResponse {
  locations: { name: string; url: string }[];
}

/** Every named location in a region (routes, towns, caves, etc.) — PokeAPI doesn't distinguish "route" from "town" in this list, so the UI filters/labels by name pattern instead. */
export async function listRegionLocations(region: string): Promise<LiveLocation[]> {
  const data = await cachedFetch<RawRegionResponse>(`${BASE}/region/${region}`);
  return data.locations.map((l) => ({ name: l.name })).sort((a, b) => a.name.localeCompare(b.name));
}

interface RawLocationResponse {
  areas: { name: string; url: string }[];
}

/** Most locations have exactly one area; some (bigger routes, multi-part caves) split into several — each area has its own independent encounter table. */
export async function getLocationAreas(locationName: string): Promise<LiveLocation[]> {
  const data = await cachedFetch<RawLocationResponse>(`${BASE}/location/${locationName}`);
  return data.areas.map((a) => ({ name: a.name }));
}

export interface LiveEncounter {
  species: string;
  pokemonId: number;
  method: string;
  minLevel: number;
  maxLevel: number;
  /** Summed chance across every encounter_details row for this method (PokeAPI splits one method into several level-banded rows) — a rough "how common," not a single canonical percent. */
  chance: number;
}

interface RawLocationAreaResponse {
  pokemon_encounters: {
    pokemon: { name: string; url: string };
    version_details: {
      version: { name: string };
      encounter_details: { chance: number; max_level: number; min_level: number; method: { name: string } }[];
    }[];
  }[];
}

/** Real wild encounters for one location area, filtered to exactly one game version — the same species list a player would actually see walking that route in that specific game. */
export async function getLocationAreaEncounters(areaName: string, versionName: string): Promise<LiveEncounter[]> {
  const data = await cachedFetch<RawLocationAreaResponse>(`${BASE}/location-area/${areaName}`);
  const out: LiveEncounter[] = [];
  for (const pe of data.pokemon_encounters) {
    const versionDetail = pe.version_details.find((v) => v.version.name === versionName);
    if (!versionDetail) continue;
    const pokemonId = Number(pe.pokemon.url.replace(/\/$/, '').split('/').pop());
    const byMethod = new Map<string, { min: number; max: number; chance: number }>();
    for (const ed of versionDetail.encounter_details) {
      const cur = byMethod.get(ed.method.name) ?? { min: ed.min_level, max: ed.max_level, chance: 0 };
      cur.min = Math.min(cur.min, ed.min_level);
      cur.max = Math.max(cur.max, ed.max_level);
      cur.chance += ed.chance;
      byMethod.set(ed.method.name, cur);
    }
    for (const [method, info] of byMethod) {
      out.push({ species: pe.pokemon.name, pokemonId, method, minLevel: info.min, maxLevel: info.max, chance: info.chance });
    }
  }
  return out.sort((a, b) => b.chance - a.chance);
}
