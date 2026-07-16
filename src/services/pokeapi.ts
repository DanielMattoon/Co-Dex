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
