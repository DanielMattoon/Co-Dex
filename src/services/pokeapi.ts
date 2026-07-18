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

/**
 * PokéAPI returns species names lowercase-with-hyphens ("pidgeotto",
 * "nidoran-f"); the rest of the app (Vault entries, Teambuilder, @smogon/calc)
 * uses Title-Case ("Pidgeotto", "Nidoran-F"). Evolution chain data needs this
 * to compare/display correctly against VaultEntry.species.
 */
function formatSpeciesName(rawName: string): string {
  return rawName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
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

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** Direct sprite CDN URLs (PRD 3 rule 2 explicitly names this mirror) — no fetch needed, just a stable path by Dex number. */
export function getSpriteUrl(pokemonId: number, shiny = false): string {
  return shiny ? `${SPRITE_BASE}/shiny/${pokemonId}.png` : `${SPRITE_BASE}/${pokemonId}.png`;
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
  results: { name: string; url: string }[];
}

export async function getSpeciesEggData(name: string): Promise<SpeciesEggData> {
  const data = await cachedFetch<RawSpeciesResponse>(`${BASE}/pokemon-species/${toId(name)}`);
  return {
    name: data.name,
    eggGroups: data.egg_groups.map((g) => g.name),
    genderRate: data.gender_rate,
  };
}

// --- Variant / form data (PRD 6.6's Variant Slide) ---
// PokeAPI groups every form that shares one National Dex number under a
// single species' `varieties` list — Shellos East/West Sea, Unown's 28
// letters, Deoxys' formes, regional forms, etc. Species with genuinely
// distinct Dex numbers (Nidoran-F vs Nidoran-M) never appear together here,
// since each has its own separate /pokemon-species entry.

export interface SpeciesVariety {
  name: string;
  pokemonId: number;
  isDefault: boolean;
}

/** Varieties + gender rate come off the same /pokemon-species response, so both are fetched together — one request per species instead of two. */
export interface SpeciesFormData {
  varieties: SpeciesVariety[];
  genderRate: number;
}

interface RawSpeciesFormResponse {
  varieties: { is_default: boolean; pokemon: { name: string; url: string } }[];
  gender_rate: number;
}

export async function getSpeciesFormData(name: string): Promise<SpeciesFormData> {
  const data = await cachedFetch<RawSpeciesFormResponse>(`${BASE}/pokemon-species/${toId(name)}`);
  return {
    genderRate: data.gender_rate,
    varieties: data.varieties.map((v) => {
      const id = Number(v.pokemon.url.replace(/\/$/, '').split('/').pop());
      return { name: v.pokemon.name, pokemonId: id, isDefault: v.is_default };
    }),
  };
}

/**
 * Fetches form data for many species at once, capped to a small concurrency
 * so a big dex (Pokémon HOME's full ~1025 species) doesn't fire a flat
 * thousand-request burst at PokeAPI simultaneously. Every result is cached
 * to localStorage forever afterward (same cachedFetch as everything else in
 * this file), so this cost is paid once per species, ever.
 */
export async function getSpeciesFormDataBulk(speciesNames: string[]): Promise<Map<string, SpeciesFormData>> {
  const unique = [...new Set(speciesNames)];
  const map = new Map<string, SpeciesFormData>();
  let index = 0;
  async function worker() {
    while (index < unique.length) {
      const i = index++;
      const name = unique[i];
      try {
        map.set(name, await getSpeciesFormData(name));
      } catch {
        map.set(name, { varieties: [], genderRate: -1 });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(10, unique.length) }, worker));
  return map;
}

export async function listAllSpeciesNames(): Promise<string[]> {
  const data = await cachedFetch<RawSpeciesListResponse>(`${BASE}/pokemon-species?limit=2000`);
  return data.results.map((r) => r.name);
}

export interface SpeciesWithId {
  name: string;
  pokemonId: number;
}

/** National Dex-ordered species with their real Dex numbers (PRD 6.13), parsed from each entry's own URL. */
export async function listAllSpeciesWithIds(): Promise<SpeciesWithId[]> {
  const data = await cachedFetch<RawSpeciesListResponse>(`${BASE}/pokemon-species?limit=2000`);
  return data.results.map((r) => {
    const id = Number(r.url.replace(/\/$/, '').split('/').pop());
    return { name: r.name, pokemonId: id };
  });
}

// --- Regional Dex (PRD 6.8's Regional View) ---

export interface RegionalDexEntry {
  name: string;
  pokemonId: number;
  regionalNumber: number;
}

interface RawPokedexResponse {
  pokemon_entries: { entry_number: number; pokemon_species: { name: string; url: string } }[];
}

/**
 * A game title's real regional Pokédex — only the species obtainable in
 * that title, in that title's own numbering (PRD 6.8). Some titles split
 * across multiple PokeAPI pokedex resources (e.g. Kalos: central/coastal/
 * mountain); `slugs` are concatenated in order with numbering continuing
 * across them, matching how those games present a single unified dex.
 */
export async function getRegionalDex(slugs: string[] | undefined): Promise<RegionalDexEntry[]> {
  if (!slugs || slugs.length === 0) return [];
  const dexes = await Promise.all(slugs.map((slug) => cachedFetch<RawPokedexResponse>(`${BASE}/pokedex/${slug}`)));
  const entries: RegionalDexEntry[] = [];
  let offset = 0;
  for (const dex of dexes) {
    const sorted = [...dex.pokemon_entries].sort((a, b) => a.entry_number - b.entry_number);
    for (const entry of sorted) {
      const id = Number(entry.pokemon_species.url.replace(/\/$/, '').split('/').pop());
      entries.push({ name: entry.pokemon_species.name, pokemonId: id, regionalNumber: offset + entry.entry_number });
    }
    offset += sorted.length;
  }
  return entries;
}

// --- Move generations (Transfer Engine move legality, Move Library) ---

interface RawGenerationMovesResponse {
  moves: { name: string }[];
}

let moveGenerationCache: Map<string, number> | null = null;
let moveGenerationInflight: Promise<Map<string, number>> | null = null;

/**
 * Every move's introduction generation, built from the 9 /generation/{n}
 * resources (each lists every move that generation introduced) rather than
 * one fetch per move (~900+ calls) — a move's generation is intrinsic to
 * the move itself, so this is exact, not an approximation like the shiny
 * chain-method odds.
 */
export async function getMoveGenerationMap(): Promise<Map<string, number>> {
  if (moveGenerationCache) return moveGenerationCache;
  if (!moveGenerationInflight) {
    moveGenerationInflight = Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => cachedFetch<RawGenerationMovesResponse>(`${BASE}/generation/${g}`)),
    ).then((results) => {
      const map = new Map<string, number>();
      results.forEach((data, i) => {
        for (const m of data.moves) map.set(m.name, i + 1);
      });
      moveGenerationCache = map;
      return map;
    });
  }
  return moveGenerationInflight;
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
  flingPower: number | null;
  flingEffect: string | null;
  attributes: string[];
  /** Species known to hold this item in the wild, per PokeAPI's held_by_pokemon. */
  heldByPokemon: string[];
}

interface RawItemListResponse {
  results: { name: string }[];
}

interface RawItemResponse {
  name: string;
  category: { name: string };
  cost: number;
  fling_power: number | null;
  fling_effect: { name: string } | null;
  attributes: { name: string }[];
  effect_entries: { short_effect: string; language: { name: string } }[];
  held_by_pokemon: { pokemon: { name: string } }[];
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
    flingPower: data.fling_power,
    flingEffect: data.fling_effect?.name ?? null,
    attributes: data.attributes.map((a) => a.name),
    heldByPokemon: data.held_by_pokemon.map((h) => h.pokemon.name),
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

// --- Per-Pokémon Info Panel (PRD 6.12) ---

export interface LevelUpMove {
  move: string;
  level: number;
}

/** A species' level-up learnset, sorted by level (PRD 6.12's "level-up path"). */
export async function getLevelUpMoves(species: string): Promise<LevelUpMove[]> {
  const data = await cachedFetch<RawPokemonResponse>(`${BASE}/pokemon/${toId(species)}`);
  const moves: LevelUpMove[] = [];
  for (const entry of data.moves) {
    const levelDetail = entry.version_group_details.find((d) => d.move_learn_method.name === 'level-up');
    if (levelDetail) {
      const level = (levelDetail as unknown as { level_learned_at: number }).level_learned_at;
      moves.push({ move: entry.move.name, level });
    }
  }
  return moves.sort((a, b) => a.level - b.level);
}

export interface SpeciesFlags {
  isLegendary: boolean;
  isMythical: boolean;
  evolutionChainUrl: string;
}

interface RawSpeciesFlagsResponse {
  is_legendary: boolean;
  is_mythical: boolean;
  evolution_chain: { url: string };
}

export async function getSpeciesFlags(species: string): Promise<SpeciesFlags> {
  const data = await cachedFetch<RawSpeciesFlagsResponse>(`${BASE}/pokemon-species/${toId(species)}`);
  return {
    isLegendary: data.is_legendary,
    isMythical: data.is_mythical,
    evolutionChainUrl: data.evolution_chain.url,
  };
}

export interface EvolutionEdge {
  from: string;
  to: string;
  trigger: string;
  minLevel: number | null;
  item: string | null;
  requiresTrade: boolean;
}

export interface EvolutionChainData {
  species: string[];
  edges: EvolutionEdge[];
}

interface RawEvolutionDetail {
  trigger: { name: string };
  min_level: number | null;
  item: { name: string } | null;
  trade_species: { name: string } | null;
}

interface RawEvolutionNode {
  species: { name: string };
  evolution_details: RawEvolutionDetail[];
  evolves_to: RawEvolutionNode[];
}

interface RawEvolutionChainResponse {
  chain: RawEvolutionNode;
}

function flattenEvolutionChain(node: RawEvolutionNode, species: string[], edges: EvolutionEdge[]): void {
  species.push(formatSpeciesName(node.species.name));
  for (const next of node.evolves_to) {
    const detail = next.evolution_details[0];
    edges.push({
      from: formatSpeciesName(node.species.name),
      to: formatSpeciesName(next.species.name),
      trigger: detail?.trigger.name ?? 'level-up',
      minLevel: detail?.min_level ?? null,
      item: detail?.item?.name ?? null,
      requiresTrade: detail?.trigger.name === 'trade',
    });
    flattenEvolutionChain(next, species, edges);
  }
}

/** The whole evolution family for a species (PRD 6.7, 6.12) — trade-only evolutions are flagged via requiresTrade. */
export async function getEvolutionChain(species: string): Promise<EvolutionChainData> {
  const flags = await getSpeciesFlags(species);
  const chainId = flags.evolutionChainUrl.replace(/\/$/, '').split('/').pop();
  const data = await cachedFetch<RawEvolutionChainResponse>(`${BASE}/evolution-chain/${chainId}`);
  const speciesList: string[] = [];
  const edges: EvolutionEdge[] = [];
  flattenEvolutionChain(data.chain, speciesList, edges);
  return { species: speciesList, edges };
}
