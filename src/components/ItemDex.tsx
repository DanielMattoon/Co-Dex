import { useEffect, useMemo, useState } from 'react';
import { getItemDetail, listAllItemNames, type ItemDetail } from '../services/pokeapi';

/**
 * Item Dex (PRD 6.15) — searchable item reference sourced live from PokéAPI
 * and cached locally. In-game location data isn't included here; PokéAPI
 * exposes that only via per-location encounter endpoints, which is a
 * separate, heavier data pull left for a future pass.
 */
export function ItemDex() {
  const [names, setNames] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAllItemNames()
      .then(setNames)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load item list'));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names.slice(0, 50);
    return names.filter((n) => n.includes(q.replace(/\s+/g, '-'))).slice(0, 50);
  }, [names, query]);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    setError(null);
    getItemDetail(selected)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load item'));
  }, [selected]);

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search items…"
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
      />
      {error && <p className="text-red-400">{error}</p>}
      <div className="flex flex-1 gap-2 overflow-hidden">
        <ul className="w-1/2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => setSelected(name)}
                className={[
                  'w-full px-2 py-1 text-left hover:bg-slate-700/60',
                  selected === name ? 'bg-slate-700/60 text-cyan-300' : 'text-slate-300',
                ].join(' ')}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
        <div className="w-1/2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          {!selected && <p className="text-slate-500">Pick an item.</p>}
          {selected && !detail && !error && <p className="text-slate-500">Loading…</p>}
          {detail && (
            <div className="flex flex-col gap-1.5">
              <p className="font-retro text-[9px] text-slate-200">{detail.name}</p>
              <p className="text-slate-500">{detail.category}</p>
              <p className="text-amber-300">{detail.cost > 0 ? `₽${detail.cost}` : 'Not sold'}</p>
              <p className="text-slate-300">{detail.shortEffect}</p>
              {detail.flingPower !== null && (
                <p className="text-slate-500">
                  Fling: {detail.flingPower} power{detail.flingEffect ? ` (${detail.flingEffect})` : ''}
                </p>
              )}
              {detail.attributes.length > 0 && <p className="text-slate-500">Attributes: {detail.attributes.join(', ')}</p>}
              {detail.heldByPokemon.length > 0 && (
                <p className="text-slate-500">Held in the wild by: {detail.heldByPokemon.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
