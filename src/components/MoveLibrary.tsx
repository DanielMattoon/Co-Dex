import { useEffect, useMemo, useState } from 'react';
import { Generations } from '@smogon/calc';
import { getMoveGenerationMap } from '../services/pokeapi';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, HOME_GENERATION } from '../db/schema';

const GEN = Generations.get(9);

interface MoveRow {
  name: string;
  type: string;
  category: string;
  basePower: number;
  generation: number | null;
}

/**
 * Move Library — every move that exists by the active game's generation
 * (PRD's request to back the Transfer Engine's move-legality check with a
 * browsable reference, same pattern as Item Dex). Generation comes from
 * PokeAPI's /generation resources (exact); type/category/power come from
 * the same @smogon/calc dataset the Damage Calc and Teambuilder use.
 */
export function MoveLibrary() {
  const { gameInstance } = useActiveGameInstance();
  const gameTitle = useLiveQuery(
    () => (gameInstance ? db.game_titles.get(gameInstance.game_title_id) : undefined),
    [gameInstance],
  );

  const [moveGenerations, setMoveGenerations] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    getMoveGenerationMap().then(setMoveGenerations);
  }, []);

  const allMoves: MoveRow[] = useMemo(() => {
    return [...GEN.moves]
      .map((m) => ({
        name: m.name,
        type: m.type,
        category: m.category ?? 'Status',
        basePower: m.basePower,
        // m.id is Showdown-style (hyphens stripped, "aerialace"), but
        // PokeAPI's /generation move lists use hyphenated slugs
        // ("aerial-ace") — derive the lookup key from the display name
        // instead of m.id, or every multi-word move fails to match.
        generation: moveGenerations.get(m.name.toLowerCase().replace(/\s+/g, '-')) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [moveGenerations]);

  const visible = allMoves.filter((m) => {
    if (gameTitle) {
      // A move missing from every /generation list is a special mechanic
      // (Z-move, Max Move) rather than an ordinary dateable move — those
      // didn't exist before Gen 7/8, so treat "unresolved" as "too modern"
      // for any specific title; only HOME's unlimited generation shows them.
      if (m.generation !== null && m.generation > gameTitle.generation) return false;
      if (m.generation === null && gameTitle.generation !== HOME_GENERATION) return false;
    }
    if (typeFilter && m.type !== typeFilter) return false;
    if (query.trim() && !m.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const allTypes = [...new Set(allMoves.map((m) => m.type))].sort();

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <p className="text-slate-500">
        {gameTitle ? `Moves that exist in ${gameTitle.name} (Gen ${gameTitle.generation === HOME_GENERATION ? 'HOME — all' : gameTitle.generation})` : 'Loading…'} — {visible.length}/{allMoves.length}
      </p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search moves…"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        >
          <option value="">All types</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-900/95 text-slate-500">
            <tr>
              <th className="p-1.5 text-left">Move</th>
              <th className="p-1.5 text-left">Type</th>
              <th className="p-1.5 text-left">Category</th>
              <th className="p-1.5 text-right">Power</th>
              <th className="p-1.5 text-right">Gen</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.name} className="border-t border-slate-800 text-slate-300 hover:bg-slate-800/60">
                <td className="p-1.5">{m.name}</td>
                <td className="p-1.5">{m.type}</td>
                <td className="p-1.5">{m.category}</td>
                <td className="p-1.5 text-right">{m.basePower > 0 ? m.basePower : '—'}</td>
                <td className="p-1.5 text-right text-slate-500">{m.generation ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-3 text-slate-500">No moves match.</p>}
      </div>
    </div>
  );
}
