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
import { SpeciesReference } from './SpeciesReference';
import { useClickOutside } from '../hooks/useClickOutside';

const GEN = Generations.get(9);
const ALL_TYPES = [...GEN.types].map((t) => t.name).filter((t) => t !== '???');
const BADGE_COLORS = ['#22d3ee', '#f472b6', '#fbbf24', '#a78bfa', '#34d399'];
const TILE_PX = 56;

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

function dexRangeLabel(tiles: (Tile | null)[]): string | null {
  const nums = tiles.filter((t): t is Tile => t !== null).map((t) => t.regionalNumber ?? t.pokemonId);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return `#${String(min).padStart(4, '0')}–${String(max).padStart(4, '0')}`;
}

/**
 * The unified Living Dex (PRD 6.8) — one tile per species across the whole
 * dex, greyed out until caught. Clicking a tile catches it (or catches
 * another one, if already owned) instantly — no confirmation step, matching
 * the fast tap-to-track feel of pokedextracker.com. Hovering a tile reveals
 * a small detail button that opens reference/specimen info without
 * triggering a catch, in a side drawer (partial by default, expandable to
 * full page) rather than an easy-to-miss strip at the bottom.
 *
 * "Organize" and "Filter" are deliberately separate controls: Organize only
 * changes how the same tiles are arranged/grouped (view mode, Separate
 * Box), Filter changes which tiles are excluded from view — a different
 * kind of operation the PRD (6.8 vs 6.9) already treats as distinct.
 *
 * Box grouping survives as a purely visual/organizational layer (chunked to
 * the game's real box dimensions, user-nameable) rather than literal PC
 * slot storage: National/Regional/Type order is dex-defined, so only
 * Custom View allows rearranging/deleting whole box groups — the "sandbox"
 * the rest of the views don't have room for.
 */
export function SpeciesGrid({ entries, gameInstanceId, gameTitle, nuzlocke, matchingPokemonIds }: SpeciesGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('national');
  const [separateBox, setSeparateBox] = useState(true);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [nationalSpecies, setNationalSpecies] = useState<SpeciesWithId[]>([]);
  const [regionalDex, setRegionalDex] = useState<Tile[]>([]);
  const [rareSpecies, setRareSpecies] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Map<number, OriginBadge[]>>(new Map());
  const [boxLabels, setBoxLabels] = useState<Map<number, string>>(new Map());

  const [shinyOnly, setShinyOnly] = useState(false);
  const [rareOnly, setRareOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [anomalousOnly, setAnomalousOnly] = useState(false);
  const [hideCaught, setHideCaught] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const [expandedPokemonId, setExpandedPokemonId] = useState<number | null>(null);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);

  const [editingBoxNumber, setEditingBoxNumber] = useState<number | null>(null);
  const [boxLabelDraft, setBoxLabelDraft] = useState('');
  const [confirmingDeleteBox, setConfirmingDeleteBox] = useState<number | null>(null);

  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set());
  const [taggingSelection, setTaggingSelection] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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
  const boxWidth = gameTitle?.box_width ?? 6;
  const capacity = gameTitle ? gameTitle.box_count * gameTitle.boxes_slots : 0;
  const overCapacity = capacity > 0 && entries.length > capacity;

  // National/Type/Custom View are accurate to the active game: a title only
  // "knows about" species that existed by its own generation (Regional View
  // is already game-specific by construction; Pokémon HOME's generation
  // sentinel never excludes anything, so it alone shows the full roster).
  const baseTiles: Tile[] = useMemo(() => {
    if (viewMode === 'regional' && regionalDex.length > 0) return regionalDex;
    const all = nationalSpecies.map((s) => ({ pokemonId: s.pokemonId, name: s.name }));
    if (!gameTitle) return all;
    return all.filter((t) => getGeneration(t.pokemonId) <= gameTitle.generation);
  }, [viewMode, regionalDex, nationalSpecies, gameTitle]);

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
      if (anomalousOnly && !owned.some((o) => o.is_sandbox_anomalous)) return false;
      if (typeFilter && !speciesType(t.name).includes(typeFilter)) return false;
      if (matchingPokemonIds && !matchingPokemonIds.has(t.pokemonId)) return false;
      return true;
    });
  }, [baseTiles, viewMode, isCustom, entries, ownedByPokemonId, hideCaught, shinyOnly, rareOnly, rareSpecies, flaggedOnly, anomalousOnly, typeFilter, matchingPokemonIds]);

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

  async function catchTile(tile: Tile) {
    await quickCatch({
      gameInstanceId,
      species: titleCase(tile.name),
      pokemonId: tile.pokemonId,
      level: 5,
      shiny: false,
      nickname: null,
      ball: null,
    });
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
    void catchTile(tile);
  }

  function handleDetailClick(tile: Tile, e: ReactMouseEvent) {
    e.stopPropagation();
    setMultiSelected(new Set());
    setSelectedUuid(null);
    setExpandedPokemonId(tile.pokemonId);
  }

  function closeDrawer() {
    setExpandedPokemonId(null);
    setSelectedUuid(null);
    setDrawerExpanded(false);
  }

  const selectedSpecimenIds = useMemo(() => entries.filter((en) => multiSelected.has(en.pokemon_id)).map((en) => en.uuid), [entries, multiSelected]);

  async function handleToggleShinySelection() {
    await bulkToggleShiny(selectedSpecimenIds);
  }

  async function handleToggleFaintedSelection() {
    await bulkToggleFainted(selectedSpecimenIds);
  }

  async function handleAddTagToSelection() {
    await bulkAddTag(selectedSpecimenIds, tagDraft);
    setTagDraft('');
    setTaggingSelection(false);
  }

  async function handleClearSelection() {
    await bulkDelete(selectedSpecimenIds);
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

  const expandedTile = expandedPokemonId !== null ? tiles.find((t) => t.pokemonId === expandedPokemonId) ?? baseTiles.find((t) => t.pokemonId === expandedPokemonId) : undefined;
  const expandedSpecies = expandedPokemonId !== null ? (ownedByPokemonId.get(expandedPokemonId) ?? []) : [];
  const selected = entries.find((e) => e.uuid === selectedUuid) ?? null;
  const drawerOpen = expandedPokemonId !== null;

  function renderTile(tile: Tile) {
    const owned = ownedByPokemonId.get(tile.pokemonId) ?? [];
    const isOwned = owned.length > 0;
    const isShiny = owned.some((o) => o.shiny);
    const isAnomalous = owned.some((o) => o.is_sandbox_anomalous);
    const tileBadges = badges.get(tile.pokemonId) ?? [];
    const isMultiSelected = multiSelected.has(tile.pokemonId);
    const isReservedTarget = reservedTargetSpecies.has(toID(tile.name));
    const isLocked = owned.some((o) => o.breeding_project_lock?.is_locked);

    return (
      <div
        key={tile.pokemonId}
        ref={(el) => {
          if (el) tileRefs.current.set(tile.pokemonId, el);
          else tileRefs.current.delete(tile.pokemonId);
        }}
        role="button"
        tabIndex={0}
        onClick={(e) => handleTileClick(tile, e)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          handleTileClick(tile, e as unknown as ReactMouseEvent);
        }}
        title={titleCase(tile.name)}
        className={[
          'group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded border p-0.5 outline-none',
          isMultiSelected
            ? 'border-amber-400 bg-amber-500/10'
            : expandedPokemonId === tile.pokemonId
              ? 'border-cyan-400 bg-slate-900/80'
              : 'border-slate-700 bg-slate-900/60 hover:border-slate-500',
          isLocked ? 'ring-1 ring-amber-400/60' : '',
          isReservedTarget ? 'border-dashed border-amber-400' : '',
          isAnomalous ? 'warning-pulse border-red-500' : '',
        ].join(' ')}
      >
        <img
          src={getSpriteUrl(tile.pokemonId, isShiny)}
          alt={tile.name}
          className={['h-full w-full object-contain', isOwned ? '' : 'opacity-30 grayscale'].join(' ')}
          style={{ imageRendering: 'pixelated' }}
        />
        <span className="truncate text-[8px] text-slate-500">#{tile.regionalNumber ?? tile.pokemonId}</span>
        {owned.length > 1 && <span className="absolute bottom-0.5 right-0.5 rounded-full bg-slate-950/80 px-1 text-[8px] text-cyan-300">×{owned.length}</span>}
        {tileBadges.length > 0 && (
          <span className="absolute bottom-0.5 left-0.5 flex gap-0.5" title={tileBadges.map((b) => b.gameTitleName).join(', ')}>
            {tileBadges.slice(0, 3).map((b, i) => (
              <span key={b.gameInstanceId} className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: BADGE_COLORS[i % BADGE_COLORS.length] }} />
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => handleDetailClick(tile, e)}
          title={`${titleCase(tile.name)} details`}
          className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full border border-slate-600 bg-slate-950/90 text-[9px] leading-none text-cyan-300 hover:bg-slate-800 group-hover:flex group-focus-within:flex"
        >
          ⓘ
        </button>
      </div>
    );
  }

  useClickOutside(organizeOpen, 'data-organize-dropdown', () => setOrganizeOpen(false));
  useClickOutside(filterOpen, 'data-filter-dropdown', () => setFilterOpen(false));

  return (
    <div className="flex h-full gap-3 text-xs">
      <div className={['flex h-full flex-col gap-2 overflow-hidden', drawerOpen && drawerExpanded ? 'hidden' : 'flex-1'].join(' ')}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" data-organize-dropdown>
            <button
              type="button"
              onClick={() => {
                setOrganizeOpen((v) => !v);
                setFilterOpen(false);
              }}
              className={[
                'rounded border px-2.5 py-1 text-[10px]',
                organizeOpen ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60',
              ].join(' ')}
            >
              Organize {organizeOpen ? '▲' : '▼'}
            </button>
            {organizeOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-max min-w-[240px] rounded-lg border border-slate-700 bg-slate-900/98 p-2.5 shadow-2xl">
                <p className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">View</p>
                <div className="flex flex-wrap gap-1.5">
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
                </div>
                {isCustom && <p className="mt-2 text-slate-500">Custom View is your sandbox — full reorder/rename/delete on box groups.</p>}
              </div>
            )}
          </div>

          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setFilterOpen((v) => !v);
                setOrganizeOpen(false);
              }}
              disabled={isCustom}
              className={[
                'rounded border px-2.5 py-1 text-[10px]',
                filterOpen ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60 disabled:opacity-30',
              ].join(' ')}
            >
              Filter {filterOpen ? '▲' : '▼'}
            </button>
            {filterOpen && !isCustom && (
              <div className="absolute left-0 top-full z-20 mt-1 w-max min-w-[240px] rounded-lg border border-slate-700 bg-slate-900/98 p-2.5 shadow-2xl">
                <p className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Filter (excludes tiles)</p>
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
                  <button type="button" onClick={() => setAnomalousOnly((v) => !v)} className={['rounded border px-2 py-0.5 text-[10px]', anomalousOnly ? 'border-red-500/60 bg-red-500/20 text-red-300' : 'border-slate-700 text-slate-400'].join(' ')}>
                    Anomalous
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
              </div>
            )}
          </div>

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

        {multiSelected.size > 0 && !taggingSelection && !confirmingClear && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300">
            <span>{multiSelected.size} species selected</span>
            <button type="button" onClick={() => void handleToggleShinySelection()} className="rounded border border-amber-400/60 px-2 py-0.5 hover:bg-amber-500/20">
              Toggle Shiny
            </button>
            <button type="button" onClick={() => void handleToggleFaintedSelection()} className="rounded border border-amber-400/60 px-2 py-0.5 hover:bg-amber-500/20">
              Toggle Fainted
            </button>
            <button type="button" onClick={() => setTaggingSelection(true)} className="rounded border border-amber-400/60 px-2 py-0.5 hover:bg-amber-500/20">
              Add Tag…
            </button>
            <button type="button" onClick={() => setConfirmingClear(true)} className="rounded border border-red-400/60 px-2 py-0.5 text-red-300 hover:bg-red-500/20">
              Clear…
            </button>
            <button type="button" onClick={() => setMultiSelected(new Set())} className="ml-auto rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:bg-slate-800/60">
              Deselect
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
          <div className="flex flex-wrap gap-3">
            {viewMode === 'type'
              ? typeGroups.map((group) => (
                  <div key={group.type}>
                    <p className="mb-1 font-retro text-[9px] capitalize text-slate-300">{group.type}</p>
                    <div
                      className="grid auto-rows-min gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1.5"
                      style={{ gridTemplateColumns: `repeat(${boxWidth}, ${TILE_PX}px)` }}
                    >
                      {group.tiles.map((tile) => renderTile(tile))}
                    </div>
                  </div>
                ))
              : boxGroups.map((group) => {
                  const range = dexRangeLabel(group.tiles);
                  const ownedCount = group.tiles.filter((t) => t && ownedByPokemonId.has(t.pokemonId)).length;
                  return (
                    <div key={group.boxNumber}>
                      <div className="mb-1 flex items-center gap-2">
                        {editingBoxNumber === group.boxNumber ? (
                          <>
                            <input
                              value={boxLabelDraft}
                              onChange={(e) => setBoxLabelDraft(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && void saveBoxLabel()}
                              autoFocus
                              className="w-32 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-200 outline-none focus:border-cyan-400"
                            />
                            <button type="button" onClick={() => void saveBoxLabel()} className="text-cyan-300">✓</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => startEditBoxLabel(group)} className="font-retro text-[9px] text-slate-300 hover:text-cyan-300">
                            {group.label} {!isCustom && range && <span className="text-slate-500">{range}</span>} <span className="text-slate-500">({ownedCount}/{group.tiles.length})</span>
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
                        <div className="mb-1 w-max min-w-[260px] rounded-lg border border-red-900/50 bg-red-950/30 p-2">
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

                      <div
                        className="grid auto-rows-min gap-1 rounded-lg border border-slate-700 bg-slate-800/40 p-1.5"
                        style={{ gridTemplateColumns: `repeat(${boxWidth}, ${TILE_PX}px)` }}
                      >
                        {group.tiles.map((tile, i) =>
                          tile ? (
                            renderTile(tile)
                          ) : (
                            <div key={`empty-${group.boxNumber}-${i}`} className="aspect-square rounded border border-dashed border-slate-800/60 bg-slate-900/20" />
                          ),
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      {drawerOpen && expandedTile && (
        <div className={['flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800/60', drawerExpanded ? 'w-full' : 'w-full shrink-0 sm:w-[380px]'].join(' ')}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-2">
            <p className="font-retro text-[9px] text-slate-200">
              {selected ? selected.species : titleCase(expandedTile.name)}
              {!selected && expandedSpecies.length > 0 && <span className="text-slate-500"> — {expandedSpecies.length} owned</span>}
            </p>
            <div className="flex items-center gap-2">
              {selected && (
                <button type="button" onClick={() => setSelectedUuid(null)} className="text-[10px] text-slate-400 hover:text-slate-200">
                  ← back
                </button>
              )}
              {isCustom && !selected && expandedSpecies.length > 0 && (
                <span className="flex flex-col text-slate-500">
                  <button type="button" onClick={() => void reorderSpecies(expandedPokemonId!, 'up')} className="hover:text-cyan-300">▲</button>
                  <button type="button" onClick={() => void reorderSpecies(expandedPokemonId!, 'down')} className="hover:text-cyan-300">▼</button>
                </span>
              )}
              <button type="button" onClick={() => setDrawerExpanded((v) => !v)} title={drawerExpanded ? 'Shrink' : 'Expand to full page'} className="text-[10px] text-slate-400 hover:text-cyan-300">
                {drawerExpanded ? '⤡ shrink' : '⤢ expand'}
              </button>
              <button type="button" onClick={closeDrawer} className="text-[10px] text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {selected ? (
              <InfoPanel entry={selected} nuzlocke={nuzlocke} onClose={() => setSelectedUuid(null)} />
            ) : expandedSpecies.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {expandedSpecies.map((e) => (
                  <li key={e.uuid}>
                    <button
                      type="button"
                      onClick={() => setSelectedUuid(e.uuid)}
                      className="flex flex-col items-center rounded border border-slate-700 bg-slate-900/50 p-1 hover:border-slate-500"
                    >
                      <img src={getSpriteUrl(e.pokemon_id, e.shiny)} alt={e.species} className="h-10 w-10" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-[8px] text-slate-400">
                        {e.nickname ?? `Lv.${e.level}`} {e.shiny && <span className="text-amber-300">★</span>}
                        {e.is_sandbox_anomalous && <span className="text-red-400"> ⚠</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <SpeciesReference species={titleCase(expandedTile.name)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
