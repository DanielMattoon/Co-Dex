import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Generations, toID } from '@smogon/calc';
import type { GameTitle, VaultEntry } from '../db/schema';
import { getSpriteUrl, getSpeciesFlags, getRegionalDex, listAllSpeciesWithIds, type SpeciesWithId } from '../services/pokeapi';
import { getOriginBadgesForSpecies, type OriginBadge } from '../services/originBadges';
import { bulkAddTag, bulkDelete, bulkToggleFainted, bulkToggleShiny } from '../services/bulkEdit';
import { quickCatch } from '../services/quickCatch';
import {
  deleteCustomBoxGroup,
  getBoxLabels,
  getGeneration,
  moveCustomBoxGroup,
  moveInCustomOrder,
  setBoxLabel,
} from '../services/boxes';
import { InfoPanel } from './InfoPanel';

const GEN = Generations.get(9);
const ALL_TYPES = [...GEN.types].map((t) => t.name).filter((t) => t !== '???');
const BADGE_COLORS = ['#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#34d399'];

type ViewMode = 'national' | 'regional' | 'type' | 'custom';

interface Tile {
  pokemonId: number;
  name: string;
  regionalNumber?: number;
}

interface BoxGroup {
  boxNumber: number;
  label: string;
  tiles: (Tile | null)[];
}

interface SpeciesGridProps {
  entries: VaultEntry[];
  gameInstanceId: string;
  gameTitle: GameTitle | undefined;
  nuzlocke: boolean;
  /** When set (query bar active), tiles are additionally restricted to these owned species. */
  matchingPokemonIds: Set<number> | null;
}

function titleCase(name: string): string {
  return name.split(/[\s-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

function speciesType(name: string): string[] {
  return GEN.species.get(toID(name))?.types ?? [];
}

/**
 * The unified Living Dex (PRD 6.8) — one tile per species across the whole
 * dex, greyed out until caught, exactly like the box grid it replaces used
 * to be per-slot. Box grouping survives as a purely visual/organizational
 * layer (chunked into the game's real box size, user-nameable) rather than
 * literal PC slot storage: National/Regional/Type order is dex-defined, so
 * only Custom View allows rearranging/deleting whole box groups — the
 * "sandbox" the rest of the views don't have room for.
 */
export function SpeciesGrid({ entries, gameInstanceId, gameTitle, nuzlocke, matchingPokemonIds }: SpeciesGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('national');
  const [separateBox, setSeparateBox] = useState(true);
  const [nationalSpecies, setNationalSpecies] = useState<SpeciesWithId[]>([]);
  const [regionalDex, setRegionalDex] = useState<Tile[]>([]);
  const [rareSpecies, setRareSpecies] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Map<number, OriginBadge[]>>(new Map());
  const [boxLabels, setBoxLabels] = useState<Map<number, string>>(new Map());

  const [shinyOnly, setShinyOnly] = useState(false);
  const [rareOnly, setRareOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [hideCaught, setHideCaught] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const [expandedPokemonId, setExpandedPokemonId] = useState<number | null>(null);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [catching, setCatching] = useState<Tile | null>(null);
  const [catchLevel, setCatchLevel] = useState(5);
  const [catchShiny, setCatchShiny] = useState(false);
  const [catchNickname, setCatchNickname] = useState('');
  const [catchBall, setCatchBall] = useState('');

  const [editingBoxNumber, setEditingBoxNumber] = useState<number | null>(null);
  const [boxLabelDraft, setBoxLabelDraft] = useState('');
  const [confirmingDeleteBox, setConfirmingDeleteBox] = useState<number | null>(null);

  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set());
  const [taggingSelection, setTaggingSelection] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const dragState = useRef<{ startX: number; startY: number } | null>(null);

  useEffect(() => {
    listAllSpeciesWithIds().then(setNationalSpecies).catch(() => setNationalSpecies([]));
  }, []);

  useEffect(() => {
    if (!gameTitle) {
      setRegionalDex([]);
      return;
    }
    getRegionalDex(gameTitle.pokedex_slugs)
      .then((dex) => setRegionalDex(dex.map((d) => ({ pokemonId: d.pokemonId, name: d.name, regionalNumber: d.regionalNumber }))))
      .catch((e) => {
        console.error('[SpeciesGrid] regional dex fetch failed, falling back to National View data', e);
        setRegionalDex([]);
      });
  }, [gameTitle]);

  useEffect(() => {
    getBoxLabels(gameInstanceId).then(setBoxLabels);
  }, [gameInstanceId, viewMode]);

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

  const boxSize = gameTitle?.boxes_slots ?? 30;
  const capacity = gameTitle ? gameTitle.box_count * gameTitle.boxes_slots : 0;
  const overCapacity = capacity > 0 && entries.length > capacity;

  const baseTiles: Tile[] = useMemo(() => {
    if (viewMode === 'regional' && regionalDex.length > 0) return regionalDex;
    return nationalSpecies.map((s) => ({ pokemonId: s.pokemonId, name: s.name }));
  }, [viewMode, regionalDex, nationalSpecies]);

  const ownedByPokemonId = useMemo(() => {
    const map = new Map<number, VaultEntry[]>();
    for (const e of entries) {
      const list = map.get(e.pokemon_id) ?? [];
      list.push(e);
      map.set(e.pokemon_id, list);
    }
    return map;
  }, [entries]);

  const reservedTargetSpecies = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.reservation_status.is_reserved && e.reservation_status.target_evolution_id) {
        set.add(toID(e.reservation_status.target_evolution_id));
      }
    }
    return set;
  }, [entries]);

  useEffect(() => {
    const ids = baseTiles.map((t) => t.pokemonId);
    if (ids.length === 0) return;
    getOriginBadgesForSpecies(ids, gameInstanceId).then(setBadges);
  }, [baseTiles, gameInstanceId]);

  // Custom View is the sandbox: it always shows the true, unfiltered order
  // (filters are hidden while active) so box-group boundaries here always
  // match the real persisted sort_priority order — filtering first would
  // corrupt reorders/moves against a subset that isn't the true sequence.
  const isCustom = viewMode === 'custom';

  const tiles = useMemo(() => {
    let list = baseTiles;

    if (viewMode === 'type') {
      list = [...list].sort((a, b) => {
        const ta = speciesType(a.name)[0] ?? '';
        const tb = speciesType(b.name)[0] ?? '';
        return ta === tb ? a.pokemonId - b.pokemonId : ta.localeCompare(tb);
      });
    } else if (isCustom) {
      const priorityByPokemonId = new Map<number, number>();
      for (const e of entries) {
        const existing = priorityByPokemonId.get(e.pokemon_id);
        if (existing === undefined || e.sort_priority < existing) priorityByPokemonId.set(e.pokemon_id, e.sort_priority);
      }
      list = [...list].sort((a, b) => {
        const pa = priorityByPokemonId.get(a.pokemonId);
        const pb = priorityByPokemonId.get(b.pokemonId);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return a.pokemonId - b.pokemonId;
      });
      return list; // sandbox: no filters applied
    } else if (viewMode === 'regional') {
      list = [...list].sort((a, b) => (a.regionalNumber ?? 0) - (b.regionalNumber ?? 0));
    } else {
      list = [...list].sort((a, b) => a.pokemonId - b.pokemonId);
    }

    return list.filter((t) => {
      const owned = ownedByPokemonId.get(t.pokemonId) ?? [];
      const isOwned = owned.length > 0;
      if (hideCaught && isOwned) return false;
      if (shinyOnly && !owned.some((o) => o.shiny)) return false;
      if (rareOnly && !rareSpecies.has(titleCase(t.name)) && !rareSpecies.has(t.name)) return false;
      if (flaggedOnly && !owned.some((o) => o.tags.length > 0)) return false;
      if (typeFilter && !speciesType(t.name).includes(typeFilter)) return false;
      if (matchingPokemonIds && !matchingPokemonIds.has(t.pokemonId)) return false;
      return true;
    });
  }, [baseTiles, viewMode, isCustom, entries, ownedByPokemonId, hideCaught, shinyOnly, rareOnly, rareSpecies, flaggedOnly, typeFilter, matchingPokemonIds]);

  // --- Box-group chunking (National/Regional/Custom) ---
  const boxGroups: BoxGroup[] = useMemo(() => {
    if (viewMode === 'type') return [];
    const groups: BoxGroup[] = [];
    let current: (Tile | null)[] = [];
    let currentGen: number | null = null;
    let boxNumber = 1;

    function pushBox() {
      if (current.length === 0) return;
      groups.push({ boxNumber, label: boxLabels.get(boxNumber) ?? `Box ${boxNumber}`, tiles: current });
      boxNumber++;
      current = [];
    }

    for (const tile of tiles) {
      const gen = getGeneration(tile.pokemonId);
      if (viewMode === 'national' && separateBox && currentGen !== null && gen !== currentGen && current.length > 0) {
        while (current.length < boxSize) current.push(null);
        pushBox();
      } else if (current.length >= boxSize) {
        pushBox();
      }
      current.push(tile);
      currentGen = gen;
    }
    pushBox();
    return groups;
  }, [tiles, viewMode, separateBox, boxSize, boxLabels]);

  const typeGroups = useMemo(() => {
    if (viewMode !== 'type') return [];
    const groups: { type: string; tiles: Tile[] }[] = [];
    let currentType: string | null = null;
    let current: Tile[] = [];
    for (const tile of tiles) {
      const t = speciesType(tile.name)[0] ?? 'unknown';
      if (currentType !== null && t !== currentType) {
        groups.push({ type: currentType, tiles: current });
        current = [];
      }
      current.push(tile);
      currentType = t;
    }
    if (current.length > 0 && currentType) groups.push({ type: currentType, tiles: current });
    return groups;
  }, [tiles, viewMode]);

  useEffect(() => {
    setMultiSelected(new Set());
    setTaggingSelection(false);
    setConfirmingClear(false);
    setEditingBoxNumber(null);
    setConfirmingDeleteBox(null);
  }, [viewMode]);

  useEffect(() => {
    if (multiSelected.size === 0) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      const uuids = entries.filter((en) => multiSelected.has(en.pokemon_id)).map((en) => en.uuid);
      if (uuids.length === 0) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void bulkToggleShiny(uuids);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        void bulkToggleFainted(uuids);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setTaggingSelection(true);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setConfirmingClear(true);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [multiSelected, entries]);

  function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function updateSelectionFromDrag(startX: number, startY: number, endX: number, endY: number) {
    const dragRect = new DOMRect(Math.min(startX, endX), Math.min(startY, endY), Math.abs(endX - startX), Math.abs(endY - startY));
    const next = new Set<number>();
    for (const [pokemonId, el] of tileRefs.current) {
      if (!ownedByPokemonId.has(pokemonId)) continue;
      if (rectsIntersect(dragRect, el.getBoundingClientRect())) next.add(pokemonId);
    }
    setMultiSelected(next);
  }

  function handleGridMouseDown(e: ReactMouseEvent) {
    if (!e.shiftKey) return;
    e.preventDefault();
    setSelectedUuid(null);
    setExpandedPokemonId(null);
    dragState.current = { startX: e.clientX, startY: e.clientY };

    function onMove(moveEvent: MouseEvent) {
      if (!dragState.current) return;
      updateSelectionFromDrag(dragState.current.startX, dragState.current.startY, moveEvent.clientX, moveEvent.clientY);
    }
    function onUp() {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleTileClick(tile: Tile, e: ReactMouseEvent) {
    const owned = ownedByPokemonId.get(tile.pokemonId) ?? [];
    if (e.shiftKey && owned.length > 0) {
      setSelectedUuid(null);
      setExpandedPokemonId(null);
      setMultiSelected((prev) => {
        const next = new Set(prev);
        if (next.has(tile.pokemonId)) next.delete(tile.pokemonId);
        else next.add(tile.pokemonId);
        return next;
      });
      return;
    }
    setMultiSelected(new Set());
    if (owned.length > 0) {
      setExpandedPokemonId(tile.pokemonId);
      setSelectedUuid(null);
    } else {
      openQuickCatch(tile);
    }
  }

  function openQuickCatch(tile: Tile) {
    setCatching(tile);
    setCatchLevel(5);
    setCatchShiny(false);
    setCatchNickname('');
    setCatchBall('');
    setExpandedPokemonId(null);
  }

  async function confirmCatch() {
    if (!catching) return;
    await quickCatch({
      gameInstanceId,
      species: titleCase(catching.name),
      pokemonId: catching.pokemonId,
      level: catchLevel,
      shiny: catchShiny,
      nickname: catchNickname.trim() || null,
      ball: catchBall.trim() || null,
    });
    setCatching(null);
  }

  async function handleAddTagToSelection() {
    const uuids = entries.filter((en) => multiSelected.has(en.pokemon_id)).map((en) => en.uuid);
    await bulkAddTag(uuids, tagDraft);
    setTagDraft('');
    setTaggingSelection(false);
  }

  async function handleClearSelection() {
    const uuids = entries.filter((en) => multiSelected.has(en.pokemon_id)).map((en) => en.uuid);
    await bulkDelete(uuids);
    setMultiSelected(new Set());
    setConfirmingClear(false);
  }

  function startEditBoxLabel(group: BoxGroup) {
    setEditingBoxNumber(group.boxNumber);
    setBoxLabelDraft(group.label);
  }

  async function saveBoxLabel() {
    if (editingBoxNumber === null) return;
    await setBoxLabel(gameInstanceId, editingBoxNumber, boxLabelDraft.trim() || `Box ${editingBoxNumber}`);
    setBoxLabels(await getBoxLabels(gameInstanceId));
    setEditingBoxNumber(null);
  }

  // Representative (lowest-priority) specimen per owned species, in Custom
  // View tile order — the true order used for reorder/move-group actions.
  const customOrderUuids = useMemo(() => {
    if (!isCustom) return [];
    const uuids: string[] = [];
    for (const t of tiles) {
      const owned = ownedByPokemonId.get(t.pokemonId);
      if (owned && owned.length > 0) {
        const lead = owned.reduce((a, b) => (a.sort_priority <= b.sort_priority ? a : b));
        uuids.push(lead.uuid);
      }
    }
    return uuids;
  }, [isCustom, tiles, ownedByPokemonId]);

  async function reorderSpecies(pokemonId: number, direction: 'up' | 'down') {
    const owned = ownedByPokemonId.get(pokemonId);
    if (!owned || owned.length === 0) return;
    const lead = owned.reduce((a, b) => (a.sort_priority <= b.sort_priority ? a : b));
    await moveInCustomOrder(customOrderUuids, lead.uuid, direction);
  }

  async function moveBoxGroup(boxNumber: number, direction: 'up' | 'down') {
    await moveCustomBoxGroup(customOrderUuids, boxSize, boxNumber, direction);
  }

  async function handleDeleteBoxGroup(group: BoxGroup, mode: 'migrate' | 'delete') {
    const uuids: string[] = [];
    for (const t of group.tiles) {
      if (!t) continue;
      const owned = ownedByPokemonId.get(t.pokemonId) ?? [];
      uuids.push(...owned.map((o) => o.uuid));
    }
    await deleteCustomBoxGroup(gameInstanceId, uuids, mode);
    setConfirmingDeleteBox(null);
  }

  const expandedSpecies = expandedPokemonId !== null ? (ownedByPokemonId.get(expandedPokemonId) ?? []) : [];
  const selected = entries.find((e) => e.uuid === selectedUuid) ?? null;

  function renderTile(tile: Tile) {
    const owned = ownedByPokemonId.get(tile.pokemonId) ?? [];
    const isOwned = owned.length > 0;
    const isShiny = owned.some((o) => o.shiny);
    const tileBadges = badges.get(tile.pokemonId) ?? [];
    const isMultiSelected = multiSelected.has(tile.pokemonId);
    const isReservedTarget = reservedTargetSpecies.has(toID(tile.name));
    const isLocked = owned.some((o) => o.breeding_project_lock?.is_locked);

    return (
      <button
        key={tile.pokemonId}
        ref={(el) => {
          if (el) tileRefs.current.set(tile.pokemonId, el);
          else tileRefs.current.delete(tile.pokemonId);
        }}
        type="button"
        onClick={(e) => handleTileClick(tile, e)}
        title={titleCase(tile.name)}
        className={[
          'relative flex aspect-square flex-col items-center justify-center rounded border p-0.5',
          isMultiSelected
            ? 'border-amber-400 bg-amber-500/10'
            : expandedPokemonId === tile.pokemonId
              ? 'border-cyan-400 bg-slate-900/80'
              : 'border-slate-700 bg-slate-900/60 hover:border-slate-500',
          isLocked ? 'ring-1 ring-amber-400/60' : '',
          isReservedTarget ? 'border-dashed border-amber-400' : '',
        ].join(' ')}
      >
        <img
          src={getSpriteUrl(tile.pokemonId, isShiny)}
          alt={tile.name}
          className={['h-full w-full object-contain', isOwned ? '' : 'opacity-30 grayscale'].join(' ')}
          style={{ imageRendering: 'pixelated' }}
        />
        <span className="truncate text-[8px] text-slate-500">#{tile.regionalNumber ?? tile.pokemonId}</span>
        {owned.length > 1 && <span className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/80 px-1 text-[8px] text-cyan-300">×{owned.length}</span>}
        {tileBadges.length > 0 && (
          <span className="absolute bottom-0.5 left-0.5 flex gap-0.5" title={tileBadges.map((b) => b.gameTitleName).join(', ')}>
            {tileBadges.slice(0, 3).map((b, i) => (
              <span key={b.gameInstanceId} className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: BADGE_COLORS[i % BADGE_COLORS.length] }} />
            ))}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['national', 'regional', 'type', 'custom'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={[
              'rounded border px-2 py-0.5 text-[10px] capitalize',
              viewMode === mode ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {mode}
          </button>
        ))}
        {viewMode === 'national' && (
          <button
            type="button"
            onClick={() => setSeparateBox((v) => !v)}
            className={['rounded border px-2 py-0.5 text-[10px]', separateBox ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400'].join(' ')}
          >
            Separate Box
          </button>
        )}
        <span className="ml-auto text-slate-500">
          {entries.length > 0 && `${new Set(entries.map((e) => e.pokemon_id)).size}/${baseTiles.length || '…'} caught`}
        </span>
      </div>

      {overCapacity && (
        <div className="warning-pulse rounded-lg border border-red-500 bg-red-950/40 p-2 text-red-300">
          {entries.length} specimens on hand exceeds {gameTitle?.name}'s real storage capacity ({capacity}). Something's off — check for
          duplicates or specimens that should have been traded/released.
        </div>
      )}

      {isCustom ? (
        <p className="text-slate-500">Custom View is your sandbox — full reorder/rename/delete on box groups, filters hidden so the true order always stays visible.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setShinyOnly((v) => !v)} className={['rounded border px-2 py-0.5 text-[10px]', shinyOnly ? 'border-amber-400/60 bg-amber-500/20 text-amber-300' : 'border-slate-700 text-slate-400'].join(' ')}>
            ★ Shiny
          </button>
          <button type="button" onClick={() => setRareOnly((v) => !v)} className={['rounded border px-2 py-0.5 text-[10px]', rareOnly ? 'border-purple-400/60 bg-purple-500/20 text-purple-300' : 'border-slate-700 text-slate-400'].join(' ')}>
            Legendary/Mythical
          </button>
          <button type="button" onClick={() => setFlaggedOnly((v) => !v)} className={['rounded border px-2 py-0.5 text-[10px]', flaggedOnly ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400'].join(' ')}>
            Flagged
          </button>
          <button type="button" onClick={() => setHideCaught((v) => !v)} className={['rounded border px-2 py-0.5 text-[10px]', hideCaught ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400'].join(' ')}>
            Hide Caught
          </button>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 outline-none focus:border-cyan-400">
            <option value="">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {multiSelected.size > 0 && !taggingSelection && !confirmingClear && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300">
          <span>{multiSelected.size} species selected</span>
          <span className="text-slate-500">Shift+drag or Shift+click to adjust · (S) shiny · (C) fainted · (H) tag · (Del) clear</span>
          <button type="button" onClick={() => setMultiSelected(new Set())} className="ml-auto rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:bg-slate-800/60">
            Clear selection
          </button>
        </div>
      )}
      {taggingSelection && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAddTagToSelection()}
            autoFocus
            placeholder={`Tag all specimens of ${multiSelected.size} species…`}
            className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-amber-400"
          />
          <button type="button" onClick={() => void handleAddTagToSelection()} className="rounded border border-amber-400 px-2 py-1 text-amber-300">
            Add
          </button>
          <button type="button" onClick={() => { setTaggingSelection(false); setTagDraft(''); }} className="rounded border border-slate-700 px-2 py-1 text-slate-400">
            Cancel
          </button>
        </div>
      )}
      {confirmingClear && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-2">
          <p className="mb-2 text-red-300">Clear every specimen of {multiSelected.size} selected species permanently? This can be undone from Version History.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleClearSelection()} className="rounded border border-red-500/50 bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30">
              Clear permanently
            </button>
            <button type="button" onClick={() => setConfirmingClear(false)} className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div ref={gridRef} onMouseDown={handleGridMouseDown} className="flex-1 select-none overflow-y-auto">
        {viewMode === 'type'
          ? typeGroups.map((group) => (
              <div key={group.type} className="mb-2">
                <p className="mb-1 font-retro text-[9px] capitalize text-slate-300">{group.type}</p>
                <div className="grid auto-rows-min gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}>
                  {group.tiles.map((tile) => renderTile(tile))}
                </div>
              </div>
            ))
          : boxGroups.map((group) => (
              <div key={group.boxNumber} className="mb-2">
                <div className="mb-1 flex items-center gap-2">
                  {editingBoxNumber === group.boxNumber ? (
                    <>
                      <input
                        value={boxLabelDraft}
                        onChange={(e) => setBoxLabelDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void saveBoxLabel()}
                        autoFocus
                        className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-200 outline-none focus:border-cyan-400"
                      />
                      <button type="button" onClick={() => void saveBoxLabel()} className="text-cyan-300">✓</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startEditBoxLabel(group)} className="font-retro text-[9px] text-slate-300 hover:text-cyan-300">
                      {group.label} <span className="text-slate-500">({group.tiles.filter((t) => t && ownedByPokemonId.has(t.pokemonId)).length}/{group.tiles.length})</span>
                    </button>
                  )}
                  {isCustom && (
                    <div className="ml-auto flex items-center gap-1.5 text-slate-500">
                      <button type="button" disabled={group.boxNumber === 1} onClick={() => void moveBoxGroup(group.boxNumber, 'up')} className="hover:text-cyan-300 disabled:opacity-20">◀</button>
                      <button type="button" disabled={group.boxNumber === boxGroups.length} onClick={() => void moveBoxGroup(group.boxNumber, 'down')} className="hover:text-cyan-300 disabled:opacity-20">▶</button>
                      <button type="button" onClick={() => setConfirmingDeleteBox(group.boxNumber)} className="text-[10px] hover:text-red-400">Delete…</button>
                    </div>
                  )}
                </div>

                {confirmingDeleteBox === group.boxNumber && (
                  <div className="mb-1 rounded-lg border border-red-900/50 bg-red-950/30 p-2">
                    <p className="mb-2 text-red-300">Migrate this box's specimens to the end of Custom order, or delete them permanently?</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleDeleteBoxGroup(group, 'migrate')} className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30">
                        Migrate & delete box
                      </button>
                      <button type="button" onClick={() => void handleDeleteBoxGroup(group, 'delete')} className="rounded border border-red-500/50 bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30">
                        Delete permanently
                      </button>
                      <button type="button" onClick={() => setConfirmingDeleteBox(null)} className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid auto-rows-min gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}>
                  {group.tiles.map((tile, i) =>
                    tile ? (
                      renderTile(tile)
                    ) : (
                      <div key={`empty-${group.boxNumber}-${i}`} className="aspect-square rounded border border-dashed border-slate-800/60 bg-slate-900/20" />
                    ),
                  )}
                </div>
              </div>
            ))}
      </div>

      {catching && (
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-2">
          <div className="mb-2 flex items-center gap-2">
            <img src={getSpriteUrl(catching.pokemonId, catchShiny)} alt={catching.name} className="h-10 w-10" style={{ imageRendering: 'pixelated' }} />
            <p className="text-emerald-300">Catch {titleCase(catching.name)}?</p>
            <button type="button" onClick={() => setCatching(null)} className="ml-auto text-[10px] text-slate-400 hover:text-slate-200">
              cancel
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-slate-300">
              Level
              <input type="number" min={1} max={100} value={catchLevel} onChange={(e) => setCatchLevel(Math.max(1, Math.min(100, Number(e.target.value))))} className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-200" />
            </label>
            <label className="flex items-center gap-1 text-slate-300">
              <input type="checkbox" checked={catchShiny} onChange={(e) => setCatchShiny(e.target.checked)} /> Shiny
            </label>
            <input value={catchNickname} onChange={(e) => setCatchNickname(e.target.value)} placeholder="Nickname (optional)" className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200" />
            <input value={catchBall} onChange={(e) => setCatchBall(e.target.value)} placeholder="Ball (optional)" className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-200" />
            <button type="button" onClick={() => void confirmCatch()} className="ml-auto rounded border border-emerald-500/50 bg-emerald-500/20 px-3 py-1 text-emerald-300 hover:bg-emerald-500/30">
              Catch!
            </button>
          </div>
        </div>
      )}

      {expandedPokemonId !== null && expandedSpecies.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-retro text-[9px] text-slate-200">{expandedSpecies[0].species} — {expandedSpecies.length} owned</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openQuickCatch({ pokemonId: expandedPokemonId, name: toID(expandedSpecies[0].species) })} className="text-[10px] text-emerald-400 hover:underline">
                + Catch another
              </button>
              {isCustom && (
                <span className="flex flex-col text-slate-500">
                  <button type="button" onClick={() => void reorderSpecies(expandedPokemonId, 'up')} className="hover:text-cyan-300">▲</button>
                  <button type="button" onClick={() => void reorderSpecies(expandedPokemonId, 'down')} className="hover:text-cyan-300">▼</button>
                </span>
              )}
              <button type="button" onClick={() => setExpandedPokemonId(null)} className="text-[10px] text-slate-400 hover:text-slate-200">
                close
              </button>
            </div>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {expandedSpecies.map((e) => (
              <li key={e.uuid}>
                <button
                  type="button"
                  onClick={() => setSelectedUuid(e.uuid)}
                  className={['flex flex-col items-center rounded border p-1', selectedUuid === e.uuid ? 'border-cyan-400 bg-slate-900/80' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500'].join(' ')}
                >
                  <img src={getSpriteUrl(e.pokemon_id, e.shiny)} alt={e.species} className="h-10 w-10" style={{ imageRendering: 'pixelated' }} />
                  <span className="text-[8px] text-slate-400">
                    {e.nickname ?? `Lv.${e.level}`} {e.shiny && <span className="text-amber-300">★</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && <InfoPanel entry={selected} nuzlocke={nuzlocke} onClose={() => setSelectedUuid(null)} />}
    </div>
  );
}
