import { useEffect, useMemo, useState } from 'react';
import { Generations, toID } from '@smogon/calc';
import type { VaultEntry } from '../db/schema';
import { getSpriteUrl, getSpeciesFlags } from '../services/pokeapi';
import { moveInCustomOrder } from '../services/boxes';
import { InfoPanel } from './InfoPanel';

const GEN = Generations.get(9);
const ALL_TYPES = [...GEN.types].map((t) => t.name).filter((t) => t !== '???');

type SortMode = 'national' | 'type' | 'custom';

interface LivingDexListProps {
  entries: VaultEntry[];
  nuzlocke: boolean;
}

/**
 * Alternate Living Dex browsing modes (PRD 6.8) layered over the same Vault
 * data the Box grid shows — National Dex order, grouped by Type, or the
 * user's own Custom order (PRD 6.3's floating-point priority index, exposed
 * here as up/down reorder buttons rather than literal drag gestures).
 * Regional Dex order isn't included: it needs a per-game regional dex
 * mapping this build doesn't have (PRD 4.1 scopes real per-game reference
 * data as a separate ETL problem).
 */
export function LivingDexList({ entries, nuzlocke }: LivingDexListProps) {
  const [sortMode, setSortMode] = useState<SortMode>('national');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [shinyOnly, setShinyOnly] = useState(false);
  const [rareOnly, setRareOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [rareSpecies, setRareSpecies] = useState<Set<string>>(new Set());

  useEffect(() => {
    const uniqueSpecies = [...new Set(entries.map((e) => e.species))];
    Promise.all(uniqueSpecies.map((s) => getSpeciesFlags(s).then((f) => ({ s, f })).catch(() => null))).then((results) => {
      const rare = new Set<string>();
      for (const r of results) {
        if (r && (r.f.isLegendary || r.f.isMythical)) rare.add(r.s);
      }
      setRareSpecies(rare);
    });
  }, [entries]);

  function speciesType(species: string): string[] {
    return GEN.species.get(toID(species))?.types ?? [];
  }

  const filtered = entries.filter((e) => {
    if (shinyOnly && !e.shiny) return false;
    if (rareOnly && !rareSpecies.has(e.species)) return false;
    if (flaggedOnly && e.tags.length === 0) return false;
    if (typeFilter && !speciesType(e.species).includes(typeFilter)) return false;
    return true;
  });

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortMode === 'national') return list.sort((a, b) => a.pokemon_id - b.pokemon_id);
    if (sortMode === 'custom') return list.sort((a, b) => a.sort_priority - b.sort_priority);
    // type: group alphabetically by primary type, then by dex number within the group.
    return list.sort((a, b) => {
      const ta = speciesType(a.species)[0] ?? '';
      const tb = speciesType(b.species)[0] ?? '';
      return ta === tb ? a.pokemon_id - b.pokemon_id : ta.localeCompare(tb);
    });
  }, [filtered, sortMode]);

  const selected = entries.find((e) => e.uuid === selectedUuid) ?? null;
  const customOrderUuids = sortMode === 'custom' ? sorted.map((e) => e.uuid) : [];

  async function reorder(uuid: string, direction: 'up' | 'down') {
    await moveInCustomOrder(customOrderUuids, uuid, direction);
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {(['national', 'type', 'custom'] as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className={[
              'rounded border px-2 py-0.5 text-[10px] capitalize',
              sortMode === mode
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setShinyOnly((v) => !v)}
          className={[
            'rounded border px-2 py-0.5 text-[10px]',
            shinyOnly ? 'border-amber-400/60 bg-amber-500/20 text-amber-300' : 'border-slate-700 text-slate-400',
          ].join(' ')}
        >
          ★ Shiny
        </button>
        <button
          type="button"
          onClick={() => setRareOnly((v) => !v)}
          className={[
            'rounded border px-2 py-0.5 text-[10px]',
            rareOnly ? 'border-purple-400/60 bg-purple-500/20 text-purple-300' : 'border-slate-700 text-slate-400',
          ].join(' ')}
        >
          Legendary/Mythical
        </button>
        <button
          type="button"
          onClick={() => setFlaggedOnly((v) => !v)}
          className={[
            'rounded border px-2 py-0.5 text-[10px]',
            flaggedOnly ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400',
          ].join(' ')}
        >
          Flagged
        </button>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 outline-none focus:border-cyan-400"
        >
          <option value="">All types</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-1.5">
        {sorted.length === 0 && <p className="p-2 text-slate-500">No specimens match these filters.</p>}
        <ul className="flex flex-col gap-1">
          {sorted.map((entry, i) => (
            <li key={entry.uuid} className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/50 p-1">
              <button type="button" onClick={() => setSelectedUuid(entry.uuid)} className="flex flex-1 items-center gap-2 text-left">
                <img
                  src={getSpriteUrl(entry.pokemon_id, entry.shiny)}
                  alt={entry.species}
                  className="h-8 w-8"
                  style={{ imageRendering: 'pixelated' }}
                />
                <span className="text-slate-200">
                  #{entry.pokemon_id} {entry.species} {entry.shiny && <span className="text-amber-300">★</span>}
                </span>
                <span className="ml-auto text-slate-500">Lv.{entry.level}</span>
              </button>
              {sortMode === 'custom' && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => void reorder(entry.uuid, 'up')}
                    className="text-slate-500 hover:text-cyan-300 disabled:opacity-20"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={i === sorted.length - 1}
                    onClick={() => void reorder(entry.uuid, 'down')}
                    className="text-slate-500 hover:text-cyan-300 disabled:opacity-20"
                  >
                    ▼
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {selected && <InfoPanel entry={selected} nuzlocke={nuzlocke} onClose={() => setSelectedUuid(null)} />}
    </div>
  );
}
