import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRegionalDex, getSpriteUrl, listAllSpeciesWithIds, type SpeciesWithId } from '../services/pokeapi';
import { getGeneration } from '../services/boxes';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { db, HOME_GENERATION } from '../db/schema';
import { SpeciesReference } from './SpeciesReference';

interface PokedexScreenProps {
  caughtPokemonIds: Set<number>;
}

/**
 * The Static Pokédex (PRD 6.13) — a fully separate, read-only reference
 * dex. No UUIDs, no checkboxes: just caught/uncaught at a glance across the
 * whole National Dex for the active save, independent of box placement.
 * Selecting an entry reuses SpeciesReference, the same reference layer the
 * Info Panel shows for owned specimens. Scoped to the active game's
 * generation, same as the Living Dex's National View — a Gen 3 game's
 * static reference shouldn't list Pokémon that don't exist yet either.
 */
export function PokedexScreen({ caughtPokemonIds }: PokedexScreenProps) {
  const [allSpecies, setAllSpecies] = useState<SpeciesWithId[]>([]);
  const [regionalDex, setRegionalDex] = useState<SpeciesWithId[]>([]);
  const [hideCaught, setHideCaught] = useState(false);
  const [selected, setSelected] = useState<SpeciesWithId | null>(null);
  const [query, setQuery] = useState('');

  const { gameInstance } = useActiveGameInstance();
  const gameTitle = useLiveQuery(
    () => (gameInstance ? db.game_titles.get(gameInstance.game_title_id) : undefined),
    [gameInstance],
  );

  useEffect(() => {
    listAllSpeciesWithIds().then(setAllSpecies);
  }, []);

  useEffect(() => {
    if (!gameTitle || gameTitle.has_expanded_national_dex) {
      setRegionalDex([]);
      return;
    }
    getRegionalDex(gameTitle.pokedex_slugs)
      .then((dex) => setRegionalDex(dex.map((d) => ({ pokemonId: d.pokemonId, name: d.name }))))
      .catch(() => setRegionalDex([]));
  }, [gameTitle]);

  // Titles without a real National Dex feature (Let's Go onward's "Dexit"
  // games, Brilliant Diamond/Shining Pearl, Legends: Arceus) have no
  // broader universe than their own region — a generation cutoff would
  // otherwise list hundreds of species that title's world never had.
  const species =
    gameTitle && !gameTitle.has_expanded_national_dex && regionalDex.length > 0
      ? regionalDex
      : gameTitle && gameTitle.generation !== HOME_GENERATION
        ? allSpecies.filter((s) => getGeneration(s.pokemonId) <= gameTitle.generation)
        : allSpecies;

  // Completion is tied to the search query (which dex entries are even in
  // view) but not Hide Caught, since that toggle exists to hide caught
  // entries from the grid — tying the bar to it too would always read 0%
  // whenever it's on.
  const searchFiltered = species.filter((s) => !query.trim() || s.name.includes(query.trim().toLowerCase()));
  const visible = searchFiltered.filter((s) => !hideCaught || !caughtPokemonIds.has(s.pokemonId));
  const caughtInView = searchFiltered.filter((s) => caughtPokemonIds.has(s.pokemonId)).length;
  const completionPct = searchFiltered.length > 0 ? Math.round((caughtInView / searchFiltered.length) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        />
        <button
          type="button"
          onClick={() => setHideCaught((v) => !v)}
          className={[
            'shrink-0 rounded border px-2 py-1 text-[10px]',
            hideCaught ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400',
          ].join(' ')}
        >
          Hide Caught
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-900">
          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${completionPct}%` }} />
        </div>
        <span className="shrink-0 text-slate-500">
          {caughtInView}/{searchFiltered.length || '…'} caught
        </span>
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-6 gap-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-1.5">
        {visible.map((s) => {
          const caught = caughtPokemonIds.has(s.pokemonId);
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => setSelected(s)}
              className={[
                'flex flex-col items-center rounded border p-0.5',
                selected?.name === s.name ? 'border-cyan-400' : 'border-slate-700',
              ].join(' ')}
            >
              <div className="relative">
                <img
                  src={getSpriteUrl(s.pokemonId)}
                  alt={s.name}
                  className="h-10 w-10"
                  style={{ imageRendering: 'pixelated' }}
                />
                {caught && <span className="absolute -right-0.5 -top-0.5 text-emerald-400">✓</span>}
              </div>
              <span className="truncate text-[8px] text-slate-400">#{s.pokemonId}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="max-h-[50%] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-retro text-[9px] text-slate-200">
              #{selected.pokemonId} {selected.name}
            </span>
            <button type="button" onClick={() => setSelected(null)} className="text-[10px] text-slate-400 hover:text-slate-200">
              close
            </button>
          </div>
          <SpeciesReference
            species={selected.name}
            generationCap={gameTitle && gameTitle.generation !== HOME_GENERATION ? gameTitle.generation : undefined}
          />
        </div>
      )}
    </div>
  );
}
