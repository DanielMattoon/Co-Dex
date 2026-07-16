/**
 * PokéAPI fetch + local cache (PRD 4.1, 18). Species/moves/items reference
 * data is fetched at runtime and cached — never bundled/redistributed,
 * per the zero-asset-repository rule. localStorage is the cache here since
 * this data is small, static, and doesn't need Dexie's query surface.
 */
const BASE = 'https://pokeapi.co/api/v2';

function toId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[’'.]/g, '');
}

async function cachedFetch<T>(url: string): Promise<T> {
  const cacheKey = `pokeapi_cache:${url}`;
  const stored = localStorage.getItem(cacheKey);
  if (stored) {
    try {
      return JSON.parse(stored) as T;
    } catch {
      localStorage.removeItem(cacheKey);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PokéAPI request failed (${res.status}): ${url}`);
  const data = (await res.json()) as T;
  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    // Storage quota exceeded — cache is best-effort, safe to skip.
  }
  return data;
}

export interface SpeciesEggData {
  name: string;
  eggGroups: string[];
  /** -1 = genderless, 0 = always male, 8 = always female, else eighths-female. */
  genderRate: number;
}

interface RawSpeciesResponse {
  name: string;
  egg_groups: { name: string }[];
  gender_rate: number;
}

interface RawSpeciesListResponse {
  results: { name: string }[];
}

export async function getSpeciesEggData(name: string): Promise<SpeciesEggData> {
  const data = await cachedFetch<RawSpeciesResponse>(`${BASE}/pokemon-species/${toId(name)}`);
  return {
    name: data.name,
    eggGroups: data.egg_groups.map((g) => g.name),
    genderRate: data.gender_rate,
  };
}

export async function listAllSpeciesNames(): Promise<string[]> {
  const data = await cachedFetch<RawSpeciesListResponse>(`${BASE}/pokemon-species?limit=2000`);
  return data.results.map((r) => r.name);
}

// --- Item Dex (PRD 6.15) ---

export interface ItemSummary {
  name: string;
}

export interface ItemDetail {
  name: string;
  category: string;
  cost: number;
  shortEffect: string;
}

interface RawItemListResponse {
  results: { name: string }[];
}

interface RawItemResponse {
  name: string;
  category: { name: string };
  cost: number;
  effect_entries: { short_effect: string; language: { name: string } }[];
}

export async function listAllItemNames(): Promise<string[]> {
  const data = await cachedFetch<RawItemListResponse>(`${BASE}/item?limit=2000`);
  return data.results.map((r) => r.name);
}

export async function getItemDetail(name: string): Promise<ItemDetail> {
  const data = await cachedFetch<RawItemResponse>(`${BASE}/item/${toId(name)}`);
  const enEntry = data.effect_entries.find((e) => e.language.name === 'en');
  return {
    name: data.name,
    category: data.category.name,
    cost: data.cost,
    shortEffect: enEntry?.short_effect ?? 'No effect description available.',
  };
}

// --- Egg Move Inheritance Tree (PRD 8.4) ---

interface RawMoveLearnMethod {
  move_learn_method: { name: string };
  version_group: { name: string };
}

interface RawPokemonMoveEntry {
  move: { name: string };
  version_group_details: RawMoveLearnMethod[];
}

interface RawPokemonResponse {
  name: string;
  moves: RawPokemonMoveEntry[];
}

interface RawMoveResponse {
  name: string;
  learned_by_pokemon: { name: string }[];
}

/** Egg moves a species can learn (any version group), from its own move list. */
export async function getEggMoves(species: string): Promise<string[]> {
  const data = await cachedFetch<RawPokemonResponse>(`${BASE}/pokemon/${toId(species)}`);
  return data.moves
    .filter((m) => m.version_group_details.some((d) => d.move_learn_method.name === 'egg'))
    .map((m) => m.move.name);
}

/** Every species that can learn a given move via any method (PokéAPI's full learner list). */
export async function getMoveLearners(move: string): Promise<string[]> {
  const data = await cachedFetch<RawMoveResponse>(`${BASE}/move/${toId(move)}`);
  return data.learned_by_pokemon.map((p) => p.name);
}

/** Learn methods a specific species uses for a specific move (e.g. ['level-up'], ['egg']). */
export async function getLearnMethodsForSpeciesMove(species: string, move: string): Promise<string[]> {
  const data = await cachedFetch<RawPokemonResponse>(`${BASE}/pokemon/${toId(species)}`);
  const entry = data.moves.find((m) => m.move.name === toId(move));
  if (!entry) return [];
  return [...new Set(entry.version_group_details.map((d) => d.move_learn_method.name))];
}
