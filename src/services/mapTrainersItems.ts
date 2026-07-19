import { cachedFetch } from './pokeapi';
import { getSpeciesIdIndex, lookupSpeciesId } from './speciesIndex';

/** trainers.h/trainer_parties.h/scripts.inc/scripts_*.s are plain C/assembly source, not JSON — cachedFetch's res.json() would throw on them. */
async function cachedFetchText(url: string): Promise<string> {
  const cacheKey = `raw_text_cache:${url}`;
  const stored = localStorage.getItem(cacheKey);
  if (stored !== null) return stored;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const text = await res.text();
  try {
    localStorage.setItem(cacheKey, text);
  } catch {
    // Storage quota exceeded — cache is best-effort, safe to skip.
  }
  return text;
}

/**
 * Trainer battle rosters and on-the-ground item placements — the gap
 * disclosed when the live Map Guide first shipped (PokeAPI has neither).
 * The best real source turned out to be the pret decompilation projects
 * themselves: open-source, MIT-licensed, clean-room reverse-engineered
 * DATA tables (never sprites/music/ROMs), fetched live at runtime from
 * raw.githubusercontent.com exactly like the sprite CDN already is.
 *
 * Two different game engines, two different formats, both real:
 *  - GBA (pokefirered, pokeemerald): C header files — trainer battles are
 *    `trainerbattle_single/rematch TRAINER_X` calls in a map's scripts.inc,
 *    cross-referenced against src/data/trainers.h (identity/class/items)
 *    and src/data/trainer_parties.h (species/level/moves/held item).
 *  - NDS (pokeplatinum): a custom assembly-like script DSL — battles are
 *    `StartTrainerBattle`/`StartFirstBattle TRAINER_X` calls in
 *    res/field/scripts/scripts_{location}.s, cross-referenced against one
 *    JSON file per trainer under res/trainers/data/.
 *
 * GBA titles cover every location type, not just routes: rather than a
 * hand-typed name-mapping table, the real `data/maps/` folder listing is
 * fetched once (GitHub's contents API, cached) and matched by normalized
 * prefix against PokeAPI's location name — "mt-moon" finds every one of
 * "MtMoon_1F"/"MtMoon_B1F"/"MtMoon_B2F" and their data is aggregated, since
 * a user picking "Mt. Moon" as a whole reasonably expects everything in it.
 */

const RAW_BASE = 'https://raw.githubusercontent.com/pret';

export interface LiveTrainerMon {
  species: string;
  pokemonId: number | null;
  level: number;
  moves: string[];
  heldItem: string | null;
}

export interface LiveTrainer {
  id: string;
  name: string;
  trainerClass: string;
  doubleBattle: boolean;
  party: LiveTrainerMon[];
}

export interface LiveLocationBattleData {
  trainers: LiveTrainer[];
  items: string[];
  /** Explains why trainers/items came back empty even when the location itself is valid (no matching file, wrong location type, etc.). */
  note: string | null;
}

function constantToTitle(constant: string, prefix: string): string {
  return constant
    .replace(new RegExp(`^${prefix}_?`), '')
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function speciesPokemonId(speciesConstant: string, index: Map<string, number>): number | null {
  const name = constantToTitle(speciesConstant, 'SPECIES').toLowerCase();
  const id = lookupSpeciesId(index, name);
  return id ?? null;
}

// --- GBA engine (pokefirered, pokeemerald) ---

const GBA_REPO: Record<'firered' | 'emerald', string> = {
  firered: 'pokefirered',
  emerald: 'pokeemerald',
};

interface GithubContentEntry {
  name: string;
  type: string;
}

let gbaMapFolderCache: Map<'firered' | 'emerald', string[]> = new Map();

/**
 * The real `data/maps/` folder listing for a GBA title, fetched once via
 * GitHub's contents API and cached forever after. Multi-room locations
 * (Mt. Moon, SS Anne, the Safari Zone) split into several folders
 * ("MtMoon_1F", "MtMoon_B1F", ...) that a normalized-prefix match against
 * PokeAPI's single location name ("mt-moon" -> "mtmoon") finds all of —
 * verified against Diglett's Cave, SS Anne, Granite Cave, Meteor Falls,
 * Victory Road, and Safari Zone in both games before relying on it.
 */
async function getGbaMapFolders(game: 'firered' | 'emerald'): Promise<string[]> {
  const cached = gbaMapFolderCache.get(game);
  if (cached) return cached;
  const entries = await cachedFetch<GithubContentEntry[]>(`https://api.github.com/repos/pret/${GBA_REPO[game]}/contents/data/maps`);
  const folders = entries.filter((e) => e.type === 'dir').map((e) => e.name);
  gbaMapFolderCache.set(game, folders);
  return folders;
}

function normalizeForMatch(name: string): string {
  return name.replace(/[-_]/g, '').toLowerCase();
}

/** Every real map folder whose name starts with this location's normalized name — one for a simple route, many for a multi-room dungeon/building. */
async function getGbaMapFoldersForLocation(game: 'firered' | 'emerald', locationName: string, regionPrefix: string): Promise<string[]> {
  const withoutRegion = locationName.startsWith(`${regionPrefix}-`) ? locationName.slice(regionPrefix.length + 1) : locationName;
  const target = normalizeForMatch(withoutRegion.replace(/^sea-/, ''));
  const folders = await getGbaMapFolders(game);
  return folders.filter((f) => normalizeForMatch(f).startsWith(target));
}

interface GbaTrainerRaw {
  name: string;
  trainerClass: string;
  doubleBattle: boolean;
  items: string[];
  partyArrayName: string;
}

let gbaTrainerCache: Map<'firered' | 'emerald', Map<string, GbaTrainerRaw>> = new Map();
let gbaPartyCache: Map<'firered' | 'emerald', Map<string, { species: string; level: number; moves: string[]; heldItem: string | null }[]>> = new Map();

async function getGbaTrainers(game: 'firered' | 'emerald'): Promise<Map<string, GbaTrainerRaw>> {
  const cached = gbaTrainerCache.get(game);
  if (cached) return cached;
  const text = await cachedFetchText(`${RAW_BASE}/${GBA_REPO[game]}/master/src/data/trainers.h`);
  const map = new Map<string, GbaTrainerRaw>();
  const blockPattern = /\[(TRAINER_\w+)\]\s*=\s*\{([\s\S]*?)\n\s*\},\n(?=\s*\[TRAINER_|\s*\};)/g;
  let m: RegExpExecArray | null;
  while ((m = blockPattern.exec(text))) {
    const [, id, body] = m;
    const nameMatch = body.match(/\.trainerName\s*=\s*_\("([^"]*)"\)/);
    const classMatch = body.match(/\.trainerClass\s*=\s*(\w+)/);
    const doubleMatch = body.match(/\.doubleBattle\s*=\s*(\w+)/);
    const itemsMatch = body.match(/\.items\s*=\s*\{([^}]*)\}/);
    const partyMatch = body.match(/\.party\s*=\s*(?:\{\s*\.\w+\s*=\s*(\w+)\s*\}|\w+\((\w+)\))/);
    if (!nameMatch || !partyMatch) continue;
    map.set(id, {
      name: nameMatch[1],
      trainerClass: classMatch ? constantToTitle(classMatch[1], 'TRAINER_CLASS') : 'Trainer',
      doubleBattle: doubleMatch?.[1] === 'TRUE',
      items: itemsMatch
        ? itemsMatch[1].split(',').map((s) => s.trim()).filter((s) => s && s !== 'ITEM_NONE')
        : [],
      partyArrayName: partyMatch[1] ?? partyMatch[2],
    });
  }
  gbaTrainerCache.set(game, map);
  return map;
}

async function getGbaParties(game: 'firered' | 'emerald') {
  const cached = gbaPartyCache.get(game);
  if (cached) return cached;
  const text = await cachedFetchText(`${RAW_BASE}/${GBA_REPO[game]}/master/src/data/trainer_parties.h`);
  const map = new Map<string, { species: string; level: number; moves: string[]; heldItem: string | null }[]>();
  const arrayPattern = /sParty_(\w+)\[\]\s*=\s*\{([\s\S]*?)\n\};/g;
  let arrMatch: RegExpExecArray | null;
  while ((arrMatch = arrayPattern.exec(text))) {
    const [, arrayName, body] = arrMatch;
    const mons: { species: string; level: number; moves: string[]; heldItem: string | null }[] = [];
    const monPattern = /\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let monMatch: RegExpExecArray | null;
    while ((monMatch = monPattern.exec(body))) {
      const mon = monMatch[1];
      const species = mon.match(/\.species\s*=\s*(SPECIES_\w+)/);
      const lvl = mon.match(/\.lvl\s*=\s*(\d+)/);
      if (!species || !lvl) continue;
      const movesMatch = mon.match(/\.moves\s*=\s*\{([^}]*)\}/);
      const heldMatch = mon.match(/\.heldItem\s*=\s*(ITEM_\w+)/);
      mons.push({
        species: species[1],
        level: Number(lvl[1]),
        moves: movesMatch ? movesMatch[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
        heldItem: heldMatch ? heldMatch[1] : null,
      });
    }
    map.set(`sParty_${arrayName}`, mons);
  }
  gbaPartyCache.set(game, map);
  return map;
}

async function getGbaLocationData(game: 'firered' | 'emerald', locationName: string, regionPrefix: string): Promise<LiveLocationBattleData> {
  const mapFolders = await getGbaMapFoldersForLocation(game, locationName, regionPrefix);
  if (mapFolders.length === 0) {
    return { trainers: [], items: [], note: "No matching map folder found for this location in the real game data — its name may differ from PokeAPI's." };
  }

  const scriptTexts = await Promise.all(
    mapFolders.map((mapName) =>
      cachedFetchText(`${RAW_BASE}/${GBA_REPO[game]}/master/data/maps/${mapName}/scripts.inc`).catch(() => ''),
    ),
  );
  const scriptText = scriptTexts.join('\n');

  const trainerIds = [...new Set([...scriptText.matchAll(/trainerbattle_\w+\s+(TRAINER_\w+)/g)].map((m) => m[1]))];
  const itemConstants = [...new Set([...scriptText.matchAll(/(?:giveitem|finditem)\s+(ITEM_\w+)/g)].map((m) => m[1]))];

  const [trainersById, parties, speciesIndex] = await Promise.all([getGbaTrainers(game), getGbaParties(game), getSpeciesIdIndex()]);

  const trainers: LiveTrainer[] = [];
  for (const id of trainerIds) {
    const raw = trainersById.get(id);
    if (!raw) continue;
    const partyMons = parties.get(raw.partyArrayName) ?? [];
    trainers.push({
      id,
      name: raw.name,
      trainerClass: raw.trainerClass,
      doubleBattle: raw.doubleBattle,
      party: partyMons.map((m) => ({
        species: constantToTitle(m.species, 'SPECIES'),
        pokemonId: speciesPokemonId(m.species, speciesIndex),
        level: m.level,
        moves: m.moves.map((mv) => constantToTitle(mv, 'MOVE')),
        heldItem: m.heldItem ? constantToTitle(m.heldItem, 'ITEM') : null,
      })),
    });
  }

  const items = itemConstants.map((c) => constantToTitle(c, 'ITEM'));
  return { trainers, items, note: trainers.length === 0 && items.length === 0 ? 'No trainer battles or items recorded here.' : null };
}

// --- NDS engine (pokeplatinum) ---

function toPlatinumEventName(locationName: string): string {
  return locationName.replace(/^sinnoh-/, '').replace(/-/g, '_');
}

async function getPlatinumTrainer(trainerConstant: string): Promise<LiveTrainer | null> {
  const fileName = trainerConstant.replace(/^TRAINER_/, '').toLowerCase();
  try {
    const data = await cachedFetch<{
      name: string;
      class: string;
      double_battle: boolean;
      party: { species: string; level: number; item: string | null; moves: string[] }[];
    }>(`${RAW_BASE}/pokeplatinum/main/res/trainers/data/${fileName}.json`);
    const speciesIndex = await getSpeciesIdIndex();
    return {
      id: trainerConstant,
      name: data.name,
      trainerClass: constantToTitle(data.class, 'TRAINER_CLASS'),
      doubleBattle: data.double_battle,
      party: data.party.map((m) => ({
        species: constantToTitle(m.species, 'SPECIES'),
        pokemonId: speciesPokemonId(m.species, speciesIndex),
        level: m.level,
        moves: m.moves.map((mv) => constantToTitle(mv, 'MOVE')),
        heldItem: m.item ? constantToTitle(m.item, 'ITEM') : null,
      })),
    };
  } catch {
    return null;
  }
}

async function getPlatinumLocationData(locationName: string): Promise<LiveLocationBattleData> {
  const eventName = toPlatinumEventName(locationName);
  let scriptText: string;
  try {
    scriptText = await cachedFetchText(`${RAW_BASE}/pokeplatinum/main/res/field/scripts/scripts_${eventName}.s`);
  } catch {
    return { trainers: [], items: [], note: 'No script file found for this location.' };
  }

  const trainerIds = [...new Set([...scriptText.matchAll(/Start(?:Trainer|First)Battle\s+(TRAINER_\w+)/g)].map((m) => m[1]))];
  const itemConstants = [...new Set([...scriptText.matchAll(/SetVar\s+VAR_0x8004,\s*(ITEM_\w+)/g)].map((m) => m[1]))];

  const trainerResults = await Promise.all(trainerIds.map((id) => getPlatinumTrainer(id)));
  const trainers = trainerResults.filter((t): t is LiveTrainer => t !== null);
  const items = itemConstants.map((c) => constantToTitle(c, 'ITEM'));

  return { trainers, items, note: trainers.length === 0 && items.length === 0 ? 'No trainer battles or items recorded here.' : null };
}

// --- Shared entry point ---

export async function getLocationTrainersAndItems(
  gameTitleId: string,
  locationName: string,
): Promise<LiveLocationBattleData> {
  if (gameTitleId === 'firered') {
    return getGbaLocationData('firered', locationName, 'kanto');
  }
  if (gameTitleId === 'emerald') {
    return getGbaLocationData('emerald', locationName, 'hoenn');
  }
  if (gameTitleId === 'platinum') {
    return getPlatinumLocationData(locationName);
  }
  return { trainers: [], items: [], note: null };
}
