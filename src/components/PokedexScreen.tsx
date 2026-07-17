import { useEffect, useState } from 'react';
import { getSpriteUrl, listAllSpeciesWithIds, type SpeciesWithId } from '../services/pokeapi';
import { SpeciesReference } from './SpeciesReference';

interface PokedexScreenProps {
  caughtPokemonIds: Set<number>;
}

/**
 * The Static Pokédex (PRD 6.13) — a fully separate, read-only reference
 * dex. No UUIDs, no checkboxes: just caught/uncaught at a glance across the
 * whole National Dex for the active save, independent of box placement.
 * Selecting an entry reuses SpeciesReference, the same reference layer the
 * Info Panel shows for owned specimens.
 */
export function PokedexScreen({ caughtPokemonIds }: PokedexScreenProps) {
  const [species, setSpecies] = useState<SpeciesWithId[]>([]);
  const [hideCaught, setHideCaught] = useState(false);
  const [selected, setSelected] = useState<SpeciesWithId | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    listAllSpeciesWithIds().then(setSpecies);
  }, []);

  const visible = species
    .filter((s) => !hideCaught || !caughtPokemonIds.has(s.pokemonId))
    .filter((s) => !query.trim() || s.name.includes(query.trim().toLowerCase()));

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

      <p className="text-slate-500">
        {[...caughtPokemonIds].filter((id) => species.some((s) => s.pokemonId === id)).length}/{species.length || '…'}{' '}
        caught
      </p>

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
                caught ? '' : 'opacity-40 grayscale',
              ].join(' ')}
            >
              <img
                src={getSpriteUrl(s.pokemonId)}
                alt={s.name}
                className="h-8 w-8"
                style={{ imageRendering: 'pixelated' }}
              />
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
          <SpeciesReference species={selected.name} />
        </div>
      )}
    </div>
  );
}
