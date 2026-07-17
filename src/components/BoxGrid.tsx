import { useState } from 'react';
import type { VaultEntry } from '../db/schema';
import { getSpriteUrl } from '../services/pokeapi';
import { boxToGlobalIndex } from '../services/boxes';
import { markFainted } from '../services/nuzlocke';
import { db } from '../db/schema';
import { recordSnapshot } from '../services/versionHistory';

interface BoxGridProps {
  entries: VaultEntry[];
  boxSize: number;
  boxCount: number;
  nuzlocke: boolean;
}

/**
 * The PC Box grid (PRD 6) — a fixed-size grid of slots per box, matching the
 * source game's real box capacity, with real sprites from the PokéAPI/sprites
 * CDN (PRD 3 rule 2). box_index is a flat global slot number; this component
 * is the only place that translates it into (box, local slot) coordinates.
 */
export function BoxGrid({ entries, boxSize, boxCount, nuzlocke }: BoxGridProps) {
  const [boxNumber, setBoxNumber] = useState(1);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  const byGlobalIndex = new Map(entries.map((e) => [e.box_index, e]));
  const slots = Array.from({ length: boxSize }, (_, localSlot) => {
    const globalIndex = boxToGlobalIndex(boxNumber, localSlot, boxSize);
    return byGlobalIndex.get(globalIndex) ?? null;
  });
  const occupiedInBox = slots.filter(Boolean).length;
  const selected = entries.find((e) => e.uuid === selectedUuid) ?? null;

  async function toggleBreedingLock(entry: VaultEntry) {
    const nextLocked = !entry.breeding_project_lock?.is_locked;
    await recordSnapshot('breeding_lock', `${entry.species} breeding lock turned ${nextLocked ? 'on' : 'off'}`);
    await db.vault.update(entry.uuid, {
      breeding_project_lock: { is_locked: nextLocked, notes: entry.breeding_project_lock?.notes ?? null },
    });
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={boxNumber <= 1}
          onClick={() => setBoxNumber((b) => Math.max(1, b - 1))}
          className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60 disabled:opacity-30"
        >
          ◀
        </button>
        <span className="font-retro text-[9px] text-slate-300">
          Box {boxNumber} ({occupiedInBox}/{boxSize})
        </span>
        <button
          type="button"
          disabled={boxNumber >= boxCount}
          onClick={() => setBoxNumber((b) => Math.min(boxCount, b + 1))}
          className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60 disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1.5">
        {slots.map((entry, localSlot) => (
          <button
            key={localSlot}
            type="button"
            disabled={!entry}
            onClick={() => entry && setSelectedUuid(entry.uuid)}
            className={[
              'flex aspect-square items-center justify-center rounded border',
              entry
                ? selectedUuid === entry.uuid
                  ? 'border-cyan-400 bg-slate-900/80'
                  : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                : 'border-slate-800/60 bg-slate-900/20',
              entry?.breeding_project_lock?.is_locked ? 'ring-1 ring-amber-400/60' : '',
            ].join(' ')}
          >
            {entry && (
              <img
                src={getSpriteUrl(entry.pokemon_id, entry.shiny)}
                alt={entry.species}
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 flex items-center gap-3">
            <img
              src={getSpriteUrl(selected.pokemon_id, selected.shiny)}
              alt={selected.species}
              className="h-16 w-16"
              style={{ imageRendering: 'pixelated' }}
            />
            <div>
              <p className="font-retro text-[9px] text-slate-200">
                {selected.species} {selected.shiny && <span className="text-amber-300">★</span>}
              </p>
              <p className="text-slate-500">Lv. {selected.level}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUuid(null)}
              className="ml-auto self-start text-[10px] text-slate-400 hover:text-slate-200"
            >
              close
            </button>
          </div>
          {selected.catchLocation && <p className="mb-2 text-slate-500">Caught: {selected.catchLocation}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleBreedingLock(selected)}
              className={[
                'rounded border px-2 py-1 text-[10px]',
                selected.breeding_project_lock?.is_locked
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
              ].join(' ')}
            >
              {selected.breeding_project_lock?.is_locked ? 'Unlock breeding' : 'Lock for breeding'}
            </button>
            {nuzlocke && !selected.dead && (
              <button
                type="button"
                onClick={() => void markFainted(selected.uuid)}
                className="rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
              >
                Mark fainted
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
