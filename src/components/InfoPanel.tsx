import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Generations, toID } from '@smogon/calc';
import { db, type VaultEntry } from '../db/schema';
import {
  getSpriteUrl,
  getEvolutionChain,
  getLevelUpMoves,
  listAllItemNames,
  type EvolutionChainData,
  type EvolutionEdge,
  type LevelUpMove,
} from '../services/pokeapi';
import { markFainted } from '../services/nuzlocke';
import { recordSnapshot } from '../services/versionHistory';
import { checkTransferLegality, executeTransfer, type LegalityCheck } from '../services/transfer';
import { listKnownRoutes } from '../services/mapData';
import { quickCatch } from '../services/quickCatch';
import { bulkDelete } from '../services/bulkEdit';
import { StatBar } from './StatBar';
import { SpeciesPicker } from './SpeciesPicker';

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
  const [catchLocationDraft, setCatchLocationDraft] = useState(entry.catchLocation ?? '');
  const knownRoutes = listKnownRoutes();
  const [itemNames, setItemNames] = useState<string[]>([]);

  useEffect(() => {
    listAllItemNames().then(setItemNames).catch(() => setItemNames([]));
  }, []);

  // Same species/form/gender, in this same save — the pool the +/- stepper
  // increments/decrements, mirroring the Living Dex tile's own +/- control.
  const duplicates = useLiveQuery(
    () =>
      db.vault
        .where('current_game_instance_id')
        .equals(entry.current_game_instance_id)
        .and((e) => e.pokemon_id === entry.pokemon_id && e.form === entry.form && e.gender === entry.gender)
        .toArray(),
    [entry.current_game_instance_id, entry.pokemon_id, entry.form, entry.gender],
  ) ?? [entry];

  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function addDuplicate() {
    await quickCatch({
      gameInstanceId: entry.current_game_instance_id,
      species: entry.species,
      pokemonId: entry.pokemon_id,
      level: 5,
      shiny: false,
      nickname: null,
      ball: null,
      gender: entry.gender,
      form: entry.form,
    });
  }

  function removeDuplicateReasons(e: VaultEntry): string[] {
    const reasons: string[] = [];
    if (e.nickname) reasons.push('a nickname');
    if (e.level !== 5) reasons.push(`level ${e.level}`);
    if (e.moves.length > 0) reasons.push('moves');
    if (e.held_item) reasons.push('a held item');
    if (e.tags.length > 0) reasons.push('tags');
    if (e.shiny) reasons.push('shiny status');
    if (e.reservation_status.is_reserved) reasons.push('an evolution reservation');
    return reasons;
  }

  async function removeThisSpecimen() {
    await bulkDelete([entry.uuid]);
    onClose();
  }

  function handleMinusClick() {
    if (removeDuplicateReasons(entry).length === 0) {
      void removeThisSpecimen();
    } else {
      setConfirmingRemove(true);
    }
  }

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

  const [transferCheck, setTransferCheck] = useState<LegalityCheck | null>(null);
  useEffect(() => {
    if (!transferTargetTitle) {
      setTransferCheck(null);
      return;
    }
    let cancelled = false;
    checkTransferLegality(entry, transferTargetTitle).then((result) => {
      if (!cancelled) setTransferCheck(result);
    });
    return () => {
      cancelled = true;
    };
  }, [entry, transferTargetTitle]);

  async function toggleGoOrigin() {
    await recordSnapshot('go_origin', `${entry.species} ${entry.origin_pokemon_go ? 'unmarked' : 'marked'} as Pokémon GO origin`);
    await db.vault.update(entry.uuid, { origin_pokemon_go: !entry.origin_pokemon_go });
  }

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
    setCatchLocationDraft(entry.catchLocation ?? '');
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

  async function saveCatchLocation() {
    const value = catchLocationDraft.trim() || null;
    await recordSnapshot('catch_location', `${entry.species}'s catch location set to ${value ?? '(none)'}`);
    await db.vault.update(entry.uuid, { catchLocation: value });
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

  // Every downstream species reachable from this one, however many hops
  // away — Bulbasaur can reserve Ivysaur (1 hop) or Venusaur (2 hops), not
  // just its immediate next stage.
  function downstreamEvolutions(edges: EvolutionEdge[], from: string): { to: string; hops: number; path: EvolutionEdge[] }[] {
    const results: { to: string; hops: number; path: EvolutionEdge[] }[] = [];
    function walk(species: string, path: EvolutionEdge[]) {
      for (const edge of edges.filter((e) => e.from === species)) {
        const nextPath = [...path, edge];
        results.push({ to: edge.to, hops: nextPath.length, path: nextPath });
        walk(edge.to, nextPath);
      }
    }
    walk(from, []);
    return results;
  }
  const reachableEvolutions = evolution ? downstreamEvolutions(evolution.edges, entry.species) : [];

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
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleMinusClick}
              title="Remove one (this specimen)"
              className="flex h-5 w-5 items-center justify-center rounded border border-red-700/60 text-red-300 hover:bg-red-900/40"
            >
              −
            </button>
            <span className="text-slate-400">{duplicates.length} owned</span>
            <button
              type="button"
              onClick={() => void addDuplicate()}
              title="Add another duplicate"
              className="flex h-5 w-5 items-center justify-center rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/40"
            >
              +
            </button>
          </div>
        </div>
        <button type="button" onClick={onClose} className="ml-auto self-start text-[10px] text-slate-400 hover:text-slate-200">
          close
        </button>
      </div>

      {confirmingRemove && (
        <div className="mb-2 rounded border border-red-900/50 bg-red-950/30 p-2 text-red-300">
          <p className="mb-2">Remove this {entry.species}? It has {removeDuplicateReasons(entry).join(', ')} — this can be undone from Version History.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void removeThisSpecimen()} className="rounded border border-red-500/50 bg-red-500/20 px-2 py-1 hover:bg-red-500/30">
              Remove
            </button>
            <button type="button" onClick={() => setConfirmingRemove(false)} className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60">
              Cancel
            </button>
          </div>
        </div>
      )}

      {entry.is_sandbox_anomalous && (
        <div className="warning-pulse mb-2 rounded border border-red-500 bg-red-950/40 p-2 text-red-300">
          Anomalous State — this specimen reached its current game via a Sandbox Mode transfer that wasn't strictly legal. Never
          confuse it with legitimate progress.
        </div>
      )}

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Caught at</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={catchLocationDraft}
            onChange={(e) => setCatchLocationDraft(e.target.value)}
            placeholder="Route / location…"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
          />
          {knownRoutes.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && setCatchLocationDraft(e.target.value)}
              title="Pick from the Map Guide's known routes (still a short, growing list — most locations need to be typed in freeform for now)"
              className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 outline-none focus:border-cyan-400"
            >
              <option value="">From Map…</option>
              {knownRoutes.map((r) => (
                <option key={r.routeId} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void saveCatchLocation()}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            Set
          </button>
        </div>
      </div>

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
        <button
          type="button"
          onClick={() => void toggleGoOrigin()}
          className={[
            'rounded border px-2 py-1 text-[10px]',
            entry.origin_pokemon_go
              ? 'border-blue-400/60 bg-blue-500/20 text-blue-300'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
          ].join(' ')}
        >
          {entry.origin_pokemon_go ? '📱 GO Origin' : 'Tag as GO Origin'}
        </button>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Held item</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <SpeciesPicker
              instanceId={`held-item-${entry.uuid}`}
              value={heldItem}
              onChange={setHeldItem}
              options={itemNames}
              placeholder="(none)"
            />
          </div>
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
        <p className="mb-1 text-slate-500">Evolution — reserve any stage in the line, not just the next one</p>
        {evolution === null && <p className="text-slate-600">Loading…</p>}
        {evolution && evolution.species.length <= 1 && <p className="text-slate-600">Doesn't evolve.</p>}
        {evolution && reachableEvolutions.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {reachableEvolutions.map((r) => {
              const reserved = entry.reservation_status.target_evolution_id === r.to;
              const lastLeg = r.path[r.path.length - 1];
              return (
                <li
                  key={r.to}
                  className={[
                    'flex items-center justify-between rounded border p-1.5',
                    reserved ? 'border-dashed border-amber-400' : 'border-slate-700',
                  ].join(' ')}
                >
                  <span className="text-slate-300">
                    {'→ '.repeat(r.hops)}
                    {r.to}
                    {r.hops > 1 && <span className="text-slate-500"> ({r.hops} stages)</span>}
                    {lastLeg.minLevel && <span className="text-slate-500"> (Lv. {lastLeg.minLevel})</span>}
                    {lastLeg.item && <span className="text-slate-500"> ({lastLeg.item})</span>}
                    {r.path.some((e) => e.requiresTrade) && <span className="text-amber-400"> (trade)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleReservation(r.to)}
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
