import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Generations, toID } from '@smogon/calc';
import { db, type VaultEntry } from '../db/schema';
import { getSpriteUrl, getEvolutionChain, getLevelUpMoves, type EvolutionChainData, type LevelUpMove } from '../services/pokeapi';
import { markFainted } from '../services/nuzlocke';
import { recordSnapshot } from '../services/versionHistory';
import { checkTransferLegality, executeTransfer } from '../services/transfer';
import { StatBar } from './StatBar';

const GEN = Generations.get(9);
const STAT_LABELS: [keyof VaultEntry['ivs'], string][] = [
  ['hp', 'HP'],
  ['atk', 'ATK'],
  ['def', 'DEF'],
  ['spa', 'SPA'],
  ['spd', 'SPD'],
  ['spe', 'SPE'],
];

function externalLinks(species: string) {
  const bulbapediaName = species.replace(/\s+/g, '_');
  return {
    bulbapedia: `https://bulbapedia.bulbagarden.net/wiki/${bulbapediaName}_(Pok%C3%A9mon)`,
    serebii: `https://www.serebii.net/pokedex-sv/${toID(species)}/`,
  };
}

interface InfoPanelProps {
  entry: VaultEntry;
  nuzlocke: boolean;
  onClose: () => void;
}

/**
 * Per-Pokémon Info Panel (PRD 6.12): reference layer (base stats via the
 * dynamic StatBar from PRD 6.14, evolution tree, level-up learnset, external
 * links) plus the live tracking layer (held item, tags, evolution
 * reservation, breeding lock, fainted). Closing/reopening this panel never
 * touches the box grid's own scroll/filter state (PRD 6.12) since it's a
 * sibling overlay, not a route change.
 */
export function InfoPanel({ entry, nuzlocke, onClose }: InfoPanelProps) {
  const [evolution, setEvolution] = useState<EvolutionChainData | null>(null);
  const [levelUpMoves, setLevelUpMoves] = useState<LevelUpMove[] | null>(null);
  const [heldItem, setHeldItem] = useState(entry.held_item ?? '');
  const [tagInput, setTagInput] = useState('');

  const instances = useLiveQuery(() => db.game_instances.toArray(), []) ?? [];
  const titles = useLiveQuery(() => db.game_titles.toArray(), []) ?? [];
  const titleById = useMemo(() => new Map(titles.map((t) => [t.game_title_id, t])), [titles]);
  const otherInstances = instances.filter((i) => i.game_instance_id !== entry.current_game_instance_id);

  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferMode, setTransferMode] = useState<'strict' | 'sandbox'>('strict');
  const [sandboxAck, setSandboxAck] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (!transferTargetId && otherInstances.length > 0) setTransferTargetId(otherInstances[0].game_instance_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherInstances.length]);

  const transferTargetTitle = (() => {
    const instance = otherInstances.find((i) => i.game_instance_id === transferTargetId);
    return instance ? titleById.get(instance.game_title_id) : undefined;
  })();
  const transferCheck = transferTargetTitle ? checkTransferLegality(entry, transferTargetTitle) : null;

  async function handleTransfer() {
    if (!transferTargetTitle) return;
    setTransferError(null);
    setTransferring(true);
    try {
      const result = await executeTransfer(entry, transferTargetId, transferTargetTitle, transferMode);
      if (!result.ok) {
        setTransferError(result.error ?? 'Transfer blocked.');
      } else {
        setSandboxAck(false);
        onClose();
      }
    } finally {
      setTransferring(false);
    }
  }

  useEffect(() => {
    setHeldItem(entry.held_item ?? '');
    setEvolution(null);
    setLevelUpMoves(null);
    getEvolutionChain(entry.species).then(setEvolution).catch(() => setEvolution({ species: [], edges: [] }));
    getLevelUpMoves(entry.species).then(setLevelUpMoves).catch(() => setLevelUpMoves([]));
  }, [entry.uuid, entry.species, entry.held_item]);

  const species = GEN.species.get(toID(entry.species));
  const baseStats = species?.baseStats;

  async function saveHeldItem() {
    await recordSnapshot('held_item', `${entry.species}'s held item set to ${heldItem || '(none)'}`);
    await db.vault.update(entry.uuid, { held_item: heldItem || null });
  }

  async function addTag() {
    const tag = tagInput.trim();
    if (!tag || entry.tags.includes(tag)) return;
    await recordSnapshot('tag_add', `Tagged ${entry.species} "${tag}"`);
    await db.vault.update(entry.uuid, { tags: [...entry.tags, tag] });
    setTagInput('');
  }

  async function removeTag(tag: string) {
    await recordSnapshot('tag_remove', `Removed tag "${tag}" from ${entry.species}`);
    await db.vault.update(entry.uuid, { tags: entry.tags.filter((t) => t !== tag) });
  }

  async function toggleReservation(targetSpecies: string) {
    const isCurrentTarget = entry.reservation_status.target_evolution_id === targetSpecies;
    await recordSnapshot(
      'evolution_reservation',
      isCurrentTarget
        ? `Cleared evolution reservation on ${entry.species}`
        : `Reserved ${entry.species} to evolve into ${targetSpecies}`,
    );
    await db.vault.update(entry.uuid, {
      reservation_status: isCurrentTarget
        ? { is_reserved: false, target_evolution_id: null }
        : { is_reserved: true, target_evolution_id: targetSpecies },
    });
  }

  const links = externalLinks(entry.species);
  const nextEvolutions = evolution?.edges.filter((e) => e.from === entry.species) ?? [];

  return (
    <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs">
      <div className="mb-2 flex items-center gap-3">
        <img
          src={getSpriteUrl(entry.pokemon_id, entry.shiny)}
          alt={entry.species}
          className="h-16 w-16"
          style={{ imageRendering: 'pixelated' }}
        />
        <div>
          <p className="font-retro text-[9px] text-slate-200">
            {entry.species} {entry.shiny && <span className="text-amber-300">★</span>}
          </p>
          <p className="text-slate-500">Lv. {entry.level}</p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto self-start text-[10px] text-slate-400 hover:text-slate-200">
          close
        </button>
      </div>

      {entry.is_sandbox_anomalous && (
        <div className="warning-pulse mb-2 rounded border border-red-500 bg-red-950/40 p-2 text-red-300">
          Anomalous State — this specimen reached its current game via a Sandbox Mode transfer that wasn't strictly legal. Never
          confuse it with legitimate progress.
        </div>
      )}

      {entry.catchLocation && <p className="mb-2 text-slate-500">Caught: {entry.catchLocation}</p>}

      {baseStats && (
        <div className="mb-3 flex flex-col gap-1">
          {STAT_LABELS.map(([key, label]) => (
            <StatBar key={key} label={label} value={baseStats[key]} />
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            const nextLocked = !entry.breeding_project_lock?.is_locked;
            await recordSnapshot('breeding_lock', `${entry.species} breeding lock turned ${nextLocked ? 'on' : 'off'}`);
            await db.vault.update(entry.uuid, {
              breeding_project_lock: { is_locked: nextLocked, notes: entry.breeding_project_lock?.notes ?? null },
            });
          }}
          className={[
            'rounded border px-2 py-1 text-[10px]',
            entry.breeding_project_lock?.is_locked
              ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
          ].join(' ')}
        >
          {entry.breeding_project_lock?.is_locked ? 'Unlock breeding' : 'Lock for breeding'}
        </button>
        {nuzlocke && !entry.dead && (
          <button
            type="button"
            onClick={() => void markFainted(entry.uuid)}
            className="rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
          >
            Mark fainted
          </button>
        )}
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Held item</p>
        <div className="flex gap-2">
          <input
            value={heldItem}
            onChange={(e) => setHeldItem(e.target.value)}
            placeholder="(none)"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={() => void saveHeldItem()}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            Set
          </button>
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Transfer (PRD 5.1 — Strict/Sandbox)</p>
        {otherInstances.length === 0 ? (
          <p className="text-slate-600">No other saves to transfer to yet — create one from Backup → Saves.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={transferTargetId}
                onChange={(e) => {
                  setTransferTargetId(e.target.value);
                  setTransferError(null);
                  setSandboxAck(false);
                }}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 outline-none focus:border-cyan-400"
              >
                {otherInstances.map((i) => (
                  <option key={i.game_instance_id} value={i.game_instance_id}>
                    {titleById.get(i.game_title_id)?.name ?? i.game_title_id}
                  </option>
                ))}
              </select>
              <div className="flex overflow-hidden rounded border border-slate-700">
                <button
                  type="button"
                  onClick={() => { setTransferMode('strict'); setSandboxAck(false); setTransferError(null); }}
                  className={['px-2 py-1', transferMode === 'strict' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:bg-slate-800/60'].join(' ')}
                >
                  Strict
                </button>
                <button
                  type="button"
                  onClick={() => { setTransferMode('sandbox'); setTransferError(null); }}
                  className={['px-2 py-1', transferMode === 'sandbox' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:bg-slate-800/60'].join(' ')}
                >
                  Sandbox
                </button>
              </div>
            </div>

            {transferCheck && !transferCheck.legal && (
              <p className={transferMode === 'strict' ? 'text-red-400' : 'text-amber-400'}>{transferCheck.reasons.join(' ')}</p>
            )}
            {transferMode === 'sandbox' && transferCheck && !transferCheck.legal && (
              <label className="flex items-center gap-1.5 text-amber-300">
                <input type="checkbox" checked={sandboxAck} onChange={(e) => setSandboxAck(e.target.checked)} />
                I understand this will flag the specimen Anomalous and simulate an illegal transfer.
              </label>
            )}
            {transferError && <p className="text-red-400">{transferError}</p>}

            <button
              type="button"
              onClick={() => void handleTransfer()}
              disabled={
                transferring ||
                !transferTargetTitle ||
                (transferMode === 'strict' && !!transferCheck && !transferCheck.legal) ||
                (transferMode === 'sandbox' && !!transferCheck && !transferCheck.legal && !sandboxAck)
              }
              className="self-start rounded border border-cyan-500/50 bg-cyan-500/20 px-3 py-1 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              {transferring ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Tags</p>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => void removeTag(tag)}
              className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-300"
              title="Remove tag"
            >
              {tag} ×
            </button>
          ))}
          {entry.tags.length === 0 && <span className="text-slate-600">No tags yet.</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addTag()}
            placeholder="Add a tag…"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={() => void addTag()}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            Add
          </button>
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Evolution</p>
        {evolution === null && <p className="text-slate-600">Loading…</p>}
        {evolution && evolution.species.length <= 1 && <p className="text-slate-600">Doesn't evolve.</p>}
        {evolution && nextEvolutions.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {nextEvolutions.map((edge) => {
              const reserved = entry.reservation_status.target_evolution_id === edge.to;
              return (
                <li
                  key={edge.to}
                  className={[
                    'flex items-center justify-between rounded border p-1.5',
                    reserved ? 'border-dashed border-amber-400' : 'border-slate-700',
                  ].join(' ')}
                >
                  <span className="text-slate-300">
                    → {edge.to}
                    {edge.minLevel && <span className="text-slate-500"> (Lv. {edge.minLevel})</span>}
                    {edge.item && <span className="text-slate-500"> ({edge.item})</span>}
                    {edge.requiresTrade && <span className="text-amber-400"> (trade)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleReservation(edge.to)}
                    className={[
                      'rounded border px-2 py-0.5 text-[10px]',
                      reserved
                        ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                        : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
                    ].join(' ')}
                  >
                    {reserved ? 'Unreserve' : 'Reserve'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Level-up learnset</p>
        {levelUpMoves === null && <p className="text-slate-600">Loading…</p>}
        {levelUpMoves && levelUpMoves.length === 0 && <p className="text-slate-600">No level-up moves found.</p>}
        {levelUpMoves && levelUpMoves.length > 0 && (
          <div className="max-h-24 overflow-y-auto">
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {levelUpMoves.map((m) => (
                <li key={m.move} className="text-slate-400">
                  {m.move} <span className="text-slate-600">Lv.{m.level}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-3 text-slate-500">
        <a href={links.bulbapedia} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300">
          Bulbapedia ↗
        </a>
        <a href={links.serebii} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300">
          Serebii ↗
        </a>
      </div>
    </div>
  );
}
