/**
 * Meta Analytics (PRD 9) — fetches monthly-refreshed Smogon usage stats
 * on demand, client-side, no scraping. smogon.com/stats itself doesn't send
 * CORS headers, so this hits the pkmn.cc mirror (pkmn.github.io/smogon),
 * which republishes the same chaos data with Access-Control-Allow-Origin: *.
 */
const BASE = 'https://pkmn.github.io/smogon/data/stats';

export const KNOWN_FORMATS = [
  'gen9ou',
  'gen9ubers',
  'gen9uu',
  'gen9ru',
  'gen9nu',
  'gen9pu',
  'gen9lc',
  'gen9monotype',
  'gen9doublesou',
  'gen9vgc2025',
] as const;

interface RawPokemonStats {
  usage: { weighted: number };
  abilities: Record<string, number>;
  items: Record<string, number>;
  moves: Record<string, number>;
  counters: Record<string, [number, number, number]>;
}

interface RawStatsResponse {
  battles: number;
  pokemon: Record<string, RawPokemonStats>;
}

export interface UsageEntry {
  species: string;
  usage: number;
}

export interface PokemonMetaProfile {
  species: string;
  usage: number;
  topAbilities: { name: string; share: number }[];
  topItems: { name: string; share: number }[];
  topMoves: { name: string; share: number }[];
  topCounters: { name: string; koOrSwitchRate: number }[];
}

async function cachedFetch<T>(url: string): Promise<T> {
  const cacheKey = `smogon_stats_cache:${url}`;
  const stored = sessionStorage.getItem(cacheKey);
  if (stored) {
    try {
      return JSON.parse(stored) as T;
    } catch {
      sessionStorage.removeItem(cacheKey);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Smogon stats request failed (${res.status}): ${url}`);
  const data = (await res.json()) as T;
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    // Multi-MB payload may exceed quota — cache is best-effort.
  }
  return data;
}

function topN(record: Record<string, number>, n: number): { name: string; share: number }[] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, share]) => ({ name, share }));
}

export async function getFormatUsage(format: string): Promise<UsageEntry[]> {
  const data = await cachedFetch<RawStatsResponse>(`${BASE}/${format}.json`);
  return Object.entries(data.pokemon)
    .map(([species, stats]) => ({ species, usage: stats.usage.weighted }))
    .sort((a, b) => b.usage - a.usage);
}

export async function getPokemonMetaProfile(format: string, species: string): Promise<PokemonMetaProfile | null> {
  const data = await cachedFetch<RawStatsResponse>(`${BASE}/${format}.json`);
  const stats = data.pokemon[species];
  if (!stats) return null;
  return {
    species,
    usage: stats.usage.weighted,
    topAbilities: topN(stats.abilities, 3),
    topItems: topN(stats.items, 5),
    topMoves: topN(stats.moves, 6),
    topCounters: Object.entries(stats.counters)
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, 5)
      .map(([name, [, koOrSwitchRate]]) => ({ name, koOrSwitchRate })),
  };
}
