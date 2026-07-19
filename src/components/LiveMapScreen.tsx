import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { getSpriteUrl } from '../services/pokeapi';
import {
  getLocationAreaEncounters,
  getLocationAreas,
  listRegionLocations,
  type GameMapConfig,
  type LiveEncounter,
} from '../services/mapLive';
import { getLocationTrainersAndItems, type LiveLocationBattleData } from '../services/mapTrainersItems';
import { canCatchOnRoute, registerCatch } from '../services/nuzlocke';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';

interface LiveMapScreenProps {
  gameTitleId: string;
  config: GameMapConfig;
}

function titleCase(name: string): string {
  return name.split(/[\s-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

function locationLabel(name: string): string {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

const METHOD_LABELS: Record<string, string> = {
  walk: 'Walking',
  surf: 'Surfing',
  'old-rod': 'Old Rod',
  'good-rod': 'Good Rod',
  'super-rod': 'Super Rod',
  'rock-smash': 'Rock Smash',
  'headbutt-normal': 'Headbutt',
  'headbutt-special': 'Headbutt (rare)',
};

/**
 * The real-data Map Guide (PRD 7) — every location in the active game's
 * region, with real wild encounter tables pulled live from PokeAPI and
 * filtered to that exact game version, instead of one hand-typed sample
 * route. Trainer rosters and on-the-ground item locations aren't shown
 * here: PokeAPI doesn't model either, so faking them would mean guessing —
 * this only ever shows encounter data that's actually real.
 */
export function LiveMapScreen({ gameTitleId, config }: LiveMapScreenProps) {
  const { gameInstanceId, isNuzlockeMode: nuzlockeActive } = useActiveGameInstance();
  const [locations, setLocations] = useState<{ name: string }[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [areas, setAreas] = useState<{ name: string }[] | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [encounters, setEncounters] = useState<LiveEncounter[] | null>(null);
  const [battleData, setBattleData] = useState<LiveLocationBattleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catchError, setCatchError] = useState<string | null>(null);
  const [routeCatchable, setRouteCatchable] = useState(true);

  useEffect(() => {
    setLocations(null);
    setError(null);
    listRegionLocations(config.region)
      .then(setLocations)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load locations'));
  }, [config.region]);

  useEffect(() => {
    setAreas(null);
    setSelectedArea(null);
    setEncounters(null);
    if (!selectedLocation) return;
    getLocationAreas(selectedLocation)
      .then((a) => {
        setAreas(a);
        if (a.length === 1) setSelectedArea(a[0].name);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load areas'));
  }, [selectedLocation]);

  useEffect(() => {
    setEncounters(null);
    if (!selectedArea) return;
    getLocationAreaEncounters(selectedArea, config.version)
      .then(setEncounters)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load encounters'));
  }, [selectedArea, config.version]);

  useEffect(() => {
    setBattleData(null);
    if (!selectedLocation) return;
    getLocationTrainersAndItems(gameTitleId, selectedLocation)
      .then(setBattleData)
      .catch(() => setBattleData({ trainers: [], items: [], note: 'Failed to load trainer/item data for this location.' }));
  }, [selectedLocation, gameTitleId]);

  useEffect(() => {
    if (!gameInstanceId || !selectedArea) return;
    canCatchOnRoute(selectedArea, gameInstanceId).then(setRouteCatchable);
  }, [gameInstanceId, selectedArea, nuzlockeActive]);

  const vaultEntries = useLiveQuery(
    () => (gameInstanceId ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray() : []),
    [gameInstanceId],
  );
  const caughtSet = new Set((vaultEntries ?? []).map((e) => e.pokemon_id));

  const filteredLocations = useMemo(() => {
    if (!locations) return [];
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) => l.name.includes(q) || locationLabel(l.name).toLowerCase().includes(q));
  }, [locations, query]);

  async function catchEncounter(enc: LiveEncounter) {
    if (!gameInstanceId || !selectedArea) return;
    setCatchError(null);
    const allowed = await canCatchOnRoute(selectedArea, gameInstanceId);
    if (!allowed) {
      setCatchError("Nuzlocke rule: this route's first-encounter slot is already used.");
      return;
    }
    await registerCatch({
      uuid: crypto.randomUUID(),
      species: titleCase(enc.species),
      pokemonId: enc.pokemonId,
      routeId: selectedArea,
      routeLabel: `${locationLabel(selectedLocation ?? '')} (${METHOD_LABELS[enc.method] ?? enc.method})`,
      gameInstanceId,
      level: enc.minLevel,
    });
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <p className="text-slate-500">
        Real wild encounters for {config.region.charAt(0).toUpperCase() + config.region.slice(1)} (PokeAPI), plus real trainer
        battles and item pickups (the pret decompilation project).
      </p>
      {error && <p className="text-red-400">{error}</p>}
      <div className="flex flex-1 gap-2 overflow-hidden">
        <div className="flex w-2/5 flex-col gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations…"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
          />
          <ul className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40">
            {locations === null && <li className="p-2 text-slate-500">Loading…</li>}
            {filteredLocations.map((l) => (
              <li key={l.name}>
                <button
                  type="button"
                  onClick={() => setSelectedLocation(l.name)}
                  className={[
                    'w-full px-2 py-1 text-left hover:bg-slate-700/60',
                    selectedLocation === l.name ? 'bg-slate-700/60 text-cyan-300' : 'text-slate-300',
                  ].join(' ')}
                >
                  {locationLabel(l.name)}
                </button>
              </li>
            ))}
            {locations !== null && filteredLocations.length === 0 && <li className="p-2 text-slate-500">No matches.</li>}
          </ul>
        </div>

        <div className="flex w-3/5 flex-col gap-1.5 overflow-hidden">
          {!selectedLocation && <p className="text-slate-500">Pick a location.</p>}
          {selectedLocation && areas && areas.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => setSelectedArea(a.name)}
                  className={[
                    'rounded border px-2 py-0.5',
                    selectedArea === a.name ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400',
                  ].join(' ')}
                >
                  {a.name.replace(selectedLocation, '').replace(/^-/, '') || 'Main area'}
                </button>
              ))}
            </div>
          )}
          {selectedArea && nuzlockeActive && !routeCatchable && (
            <p className="text-red-400">Nuzlocke: first-encounter slot used on this route.</p>
          )}
          {catchError && <p className="text-red-400">{catchError}</p>}
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-1.5">
            {selectedArea && encounters === null && <p className="text-slate-500">Loading encounters…</p>}
            {selectedArea && encounters && encounters.length === 0 && (
              <p className="text-slate-500">No recorded wild encounters here for this game.</p>
            )}
            {encounters && encounters.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {encounters.map((enc) => {
                  const owned = caughtSet.has(enc.pokemonId);
                  const canCatch = !owned && (!nuzlockeActive || routeCatchable);
                  return (
                    <li key={`${enc.species}-${enc.method}`} className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/50 p-1.5">
                      <img src={getSpriteUrl(enc.pokemonId)} alt={enc.species} className="h-8 w-8" style={{ imageRendering: 'pixelated' }} />
                      <div className="flex-1">
                        <p className="text-slate-200">{titleCase(enc.species)}</p>
                        <p className="text-slate-500">
                          {METHOD_LABELS[enc.method] ?? enc.method} · Lv. {enc.minLevel}
                          {enc.maxLevel !== enc.minLevel ? `–${enc.maxLevel}` : ''} · ~{enc.chance}%
                        </p>
                      </div>
                      {owned ? (
                        <span className="text-emerald-400">Caught</span>
                      ) : (
                        <button
                          type="button"
                          disabled={!canCatch}
                          onClick={() => void catchEncounter(enc)}
                          className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-0.5 text-cyan-300 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Catch
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {battleData && battleData.trainers.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="font-retro text-[9px] text-slate-300">Trainers ({battleData.trainers.length})</p>
                {battleData.trainers.map((t) => (
                  <div key={t.id} className="rounded border border-slate-700 bg-slate-900/50 p-2">
                    <p className="text-slate-200">
                      {t.trainerClass} {t.name} {t.doubleBattle && <span className="text-amber-400">(Double Battle)</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {t.party.map((mon, i) => (
                        <div key={i} className="flex flex-col items-center">
                          {mon.pokemonId !== null && (
                            <img src={getSpriteUrl(mon.pokemonId)} alt={mon.species} className="h-8 w-8" style={{ imageRendering: 'pixelated' }} />
                          )}
                          <span className="text-slate-500">
                            {mon.species} Lv.{mon.level}
                          </span>
                          {mon.heldItem && <span className="text-amber-300">{mon.heldItem}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {battleData && battleData.items.length > 0 && (
              <div className="mt-3">
                <p className="font-retro text-[9px] text-slate-300">Items</p>
                <p className="text-slate-400">{battleData.items.join(', ')}</p>
              </div>
            )}

            {battleData?.note && (
              <p className="mt-3 text-slate-600">{battleData.note}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
