import { useEffect, useState } from 'react';
import type { VaultEntry } from '../db/schema';
import { getSpriteUrl } from '../services/pokeapi';
import { boxToGlobalIndex, deleteBox, getBoxLabels, setBoxLabel } from '../services/boxes';
import { getOriginBadgesForSpecies, type OriginBadge } from '../services/originBadges';
import { InfoPanel } from './InfoPanel';

interface BoxGridProps {
  entries: VaultEntry[];
  boxSize: number;
  boxCount: number;
  nuzlocke: boolean;
  gameInstanceId: string;
}

const BADGE_COLORS = ['#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#34d399'];

/**
 * The PC Box grid (PRD 6) — a fixed-size grid of slots per box, matching the
 * source game's real box capacity, with real sprites from the PokéAPI/sprites
 * CDN (PRD 3 rule 2). box_index is a flat global slot number; this component
 * is the only place that translates it into (box, local slot) coordinates.
 */
export function BoxGrid({ entries, boxSize, boxCount, nuzlocke, gameInstanceId }: BoxGridProps) {
  const [boxNumber, setBoxNumber] = useState(1);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [labels, setLabels] = useState<Map<number, string>>(new Map());
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [badges, setBadges] = useState<Map<number, OriginBadge[]>>(new Map());

  const byGlobalIndex = new Map(entries.map((e) => [e.box_index, e]));
  const slots = Array.from({ length: boxSize }, (_, localSlot) => {
    const globalIndex = boxToGlobalIndex(boxNumber, localSlot, boxSize);
    return byGlobalIndex.get(globalIndex) ?? null;
  });
  const occupiedInBox = slots.filter(Boolean).length;
  const selected = entries.find((e) => e.uuid === selectedUuid) ?? null;
  const boxLabel = labels.get(boxNumber);

  useEffect(() => {
    getBoxLabels(gameInstanceId).then(setLabels);
  }, [gameInstanceId, entries]);

  useEffect(() => {
    const ids = [...new Set(slots.filter((e): e is VaultEntry => e !== null).map((e) => e.pokemon_id))];
    getOriginBadgesForSpecies(ids, gameInstanceId).then(setBadges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxNumber, entries, gameInstanceId]);

  function startEditLabel() {
    setLabelDraft(boxLabel ?? `Box ${boxNumber}`);
    setEditingLabel(true);
  }

  async function saveLabel() {
    await setBoxLabel(gameInstanceId, boxNumber, labelDraft.trim() || `Box ${boxNumber}`);
    setLabels(await getBoxLabels(gameInstanceId));
    setEditingLabel(false);
  }

  async function handleDeleteBox(mode: 'migrate' | 'delete') {
    await deleteBox(gameInstanceId, boxNumber, boxSize, mode);
    setLabels(await getBoxLabels(gameInstanceId));
    setConfirmingDelete(false);
    setSelectedUuid(null);
  }

  const rangeStart = (boxNumber - 1) * boxSize + 1;
  const rangeEnd = boxNumber * boxSize;

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
        {editingLabel ? (
          <div className="flex items-center gap-1">
            <input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveLabel()}
              autoFocus
              className="w-28 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-slate-200 outline-none focus:border-cyan-400"
            />
            <button type="button" onClick={() => void saveLabel()} className="text-cyan-300">
              ✓
            </button>
          </div>
        ) : (
          <button type="button" onClick={startEditLabel} className="font-retro text-[9px] text-slate-300 hover:text-cyan-300">
            {boxLabel ?? `Box ${boxNumber}`}{' '}
            <span className="text-slate-500">
              {String(rangeStart).padStart(4, '0')}–{String(rangeEnd).padStart(4, '0')} ({occupiedInBox}/{boxSize})
            </span>
          </button>
        )}
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
        {slots.map((entry, localSlot) => {
          const speciesBadges = entry ? badges.get(entry.pokemon_id) ?? [] : [];
          return (
            <button
              key={localSlot}
              type="button"
              disabled={!entry}
              onClick={() => entry && setSelectedUuid(entry.uuid)}
              className={[
                'relative flex aspect-square items-center justify-center rounded border',
                entry
                  ? selectedUuid === entry.uuid
                    ? 'border-cyan-400 bg-slate-900/80'
                    : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'
                  : 'border-slate-800/60 bg-slate-900/20',
                entry?.breeding_project_lock?.is_locked ? 'ring-1 ring-amber-400/60' : '',
                entry?.reservation_status?.is_reserved ? 'border-dashed border-amber-400' : '',
              ].join(' ')}
            >
              {entry && (
                <>
                  <img
                    src={getSpriteUrl(entry.pokemon_id, entry.shiny)}
                    alt={entry.species}
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  {speciesBadges.length > 0 && (
                    <span className="absolute bottom-0.5 left-0.5 flex gap-0.5" title={speciesBadges.map((b) => b.gameTitleName).join(', ')}>
                      {speciesBadges.slice(0, 3).map((b, i) => (
                        <span
                          key={b.gameInstanceId}
                          className="h-1.5 w-1.5 rounded-sm"
                          style={{ backgroundColor: BADGE_COLORS[i % BADGE_COLORS.length] }}
                        />
                      ))}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {confirmingDelete && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-2">
          <p className="mb-2 text-red-300">
            {occupiedInBox > 0
              ? `This box has ${occupiedInBox} specimen${occupiedInBox > 1 ? 's' : ''}. Migrate them to open slots elsewhere, or delete permanently?`
              : 'Delete this empty box?'}
          </p>
          <div className="flex flex-wrap gap-2">
            {occupiedInBox > 0 && (
              <button
                type="button"
                onClick={() => void handleDeleteBox('migrate')}
                className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
              >
                Migrate & delete box
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDeleteBox('delete')}
              className="rounded border border-red-500/50 bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30"
            >
              Delete permanently
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirmingDelete && !selected && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="self-start text-[10px] text-slate-600 hover:text-red-400"
        >
          Delete this box…
        </button>
      )}

      {selected && <InfoPanel entry={selected} nuzlocke={nuzlocke} onClose={() => setSelectedUuid(null)} />}
    </div>
  );
}
