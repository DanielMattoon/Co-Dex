import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Generations, toID } from '@smogon/calc';
import { db, HOME_GENERATION, type GameTitle, type VaultEntry } from '../db/schema';
import {
  getSpriteUrl,
  getSpeciesFlags,
  getSpeciesFormDataBulk,
  getRegionalDex,
  listAllSpeciesWithIds,
  type SpeciesWithId,
  type SpeciesVariety,
} from '../services/pokeapi';
import { getOriginBadgesForSpecies, type OriginBadge } from '../services/originBadges';
import { bulkAddTag, bulkDelete, bulkToggleFainted, bulkToggleShiny } from '../services/bulkEdit';
import { quickCatch } from '../services/quickCatch';
import { markAll, unmarkAll, revertToSelected, type MarkAllTarget } from '../services/massActions';
import {
  deleteCustomBoxGroup,
  getBoxLabels,
  getGeneration,
  getVarietyGeneration,
  isCosmeticVariety,
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
const TILE_PX = 80;

type ViewMode = 'national' | 'regional' | 'type' | 'custom';

interface Tile {
  pokemonId: number;
  name: string;
  regionalNumber?: number;
  /** Set only when Gender View has physically split this tile into its own Male/Female slot. */
  gender?: 'male' | 'female';
  /** Set only when the Variant Slide has physically pushed this specific form out as its own tile. */
  variety?: SpeciesVariety;
  /** Set only when the Duplicate Slide has physically pushed this specific owned specimen out as its own tile. */
  specimen?: VaultEntry;
  /** True on exactly one specimen tile per slid-open duplicate group — the one that keeps the collapse control. */
  duplicateSlideAnchor?: boolean;
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

function formVarietyLabel(variety: SpeciesVariety, baseName: string): string {
  if (variety.label) return variety.label.charAt(0).toUpperCase() + variety.label.slice(1);
  if (variety.name === baseName || variety.isDefault) return 'Default';
  const suffix = variety.name.startsWith(baseName) ? variety.name.slice(baseName.length) : variety.name;
  return suffix
    .replace(/^-/, '')
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** Sprite for a physical tile — form-layer entries (Unown's letters, cosmetic costumes) carry a pre-resolved sprite URL since their numeric IDs aren't valid pokemon/sprite IDs. */
function tileSpriteUrl(pokemonId: number, variety: SpeciesVariety | undefined, shiny: boolean): string {
  if (variety?.spriteUrl && !shiny) return variety.spriteUrl;
  return getSpriteUrl(pokemonId, shiny);
}

function dexRangeLabel(tiles: (Tile | null)[]): string | null {
  const nums = tiles.filter((t): t is Tile => t !== null).map((t) => t.regionalNumber ?? t.pokemonId);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return `#${String(min).padStart(4, '0')}–${String(max).padStart(4, '0')}`;
}

/** What a specimen has beyond a bare quick-catch default — the gate for whether a −/release needs a confirm. */
function specimenRealDataReasons(e: VaultEntry): string[] {
  const reasons: string[] = [];
  if (e.nickname) reasons.push('a nickname');
  if (e.level !== 5) reasons.push(`level ${e.level}`);
  if (e.moves.length > 0) reasons.push('moves');
  if (e.held_item) reasons.push('a held item');
  if (e.tags.length > 0) reasons.push('tags');
  if (e.ball) reasons.push('a recorded Poké Ball');
  if (e.shiny) reasons.push('shiny status');
  if (e.catchLocation) reasons.push('a catch location');
  if (e.reservation_status.is_reserved) reasons.push('an evolution reservation');
  if (e.breeding_project_lock?.is_locked) reasons.push('a breeding lock');
  if (Object.values(e.ivs).some((v) => v !== 0)) reasons.push('IVs');
  if (Object.values(e.evs).some((v) => v !== 0)) reasons.push('EVs');
  return reasons;
}

/**
 * The unified Living Dex (PRD 6.8) — one tile per species across the whole
 * dex, greyed out until caught. A persistent top-left "− N +" stepper is
 * the main way to add/remove duplicates once a species is owned (plain tile
 * click still catches the first one). Hovering reveals a detail button that
 * opens reference/specimen info without catching.
 *
 * Forms sharing a National Dex number (Shellos' sea forms, Unown's letters,
 * Deoxys' formes, regional forms — filtered to only what already exists in
 * the active game's generation) slide open as real, physical tiles pushed
 * in right next to the base tile, collapsible again with the same control.
 * A master "Slide All Forms" toggle does this to every multi-form species
 * at once and remembers the prior state so it can be reverted.
 *
 * Gender View physically splits every mixed-gender species into its own
 * Male and Female tile so an incomplete pair reads as a real gap — it
 * layers into the SAME game-accurate box grid (more tiles just means more
 * boxes), it doesn't replace it.
 *
 * Mark All / Unmark All / Revert to Selected exist at both the whole-dex
 * level and per box, backed by a dedicated, unpruned snapshot table so
 * Revert keeps working no matter how long it's been (PRD 6.1, 6.8).
 */
export function SpeciesGrid({ entries, gameInstanceId, gameTitle, nuzlocke, matchingPokemonIds }: SpeciesGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('national');
  const [separateBox, setSeparateBox] = useState(true);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [nationalSpecies, setNationalSpecies] = useState<SpeciesWithId[]>([]);
  const [regionalDex, setRegionalDex] = useState<Tile[]>([]);
  const [rareSpecies, setRareSpecies] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Map<number, OriginBadge[]>>(new Map());
  const [boxLabels, setBoxLabels] = useState<Map<number, string>>(new Map());
  const [varietiesByPokemonId, setVarietiesByPokemonId] = useState<Map<number, SpeciesVariety[]>>(new Map());
  const [genderRateByPokemonId, setGenderRateByPokemonId] = useState<Map<number, number>>(new Map());
  const [genderView, setGenderView] = useState(false);
  const [slidOpenTiles, setSlidOpenTiles] = useState<Set<number>>(new Set());
  const [slidOpenBeforeMaster, setSlidOpenBeforeMaster] = useState<Set<number> | null>(null);
  const [openBadgeFor, setOpenBadgeFor] = useState<number | null>(null);
  const [slidOpenDuplicates, setSlidOpenDuplicates] = useState<Set<string>>(new Set());

  const allInstances = useLiveQuery(() => db.game_instances.toArray(), []) ?? [];
  const allTitles = useLiveQuery(() => db.game_titles.toArray(), []) ?? [];
  const gameTitleById = useMemo(() => new Map(allTitles.map((t) => [t.game_title_id, t])), [allTitles]);

  const [shinyOnly, setShinyOnly] = useState(false);
  const [rareOnly, setRareOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [anomalousOnly, setAnomalousOnly] = useState(false);
  const [hideCaught, setHideCaught] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const [expandedPokemonId, setExpandedPokemonId] = useState<number | null>(null);
  const [expandedGender, setExpandedGender] = useState<'male' | 'female' | null>(null);
  const [expandedVarietyName, setExpandedVarietyName] = useState<string | null>(null);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);

  const [editingBoxNumber, setEditingBoxNumber] = useState<number | null>(null);
  const [boxLabelDraft, setBoxLabelDraft] = useState('');
  const [confirmingDeleteBox, setConfirmingDeleteBox] = useState<number | null>(null);
  const [confirmingRelease, setConfirmingRelease] = useState<{ uuid: string; species: string; reasons: string[] } | null>(null);
  const [confirmingMassAction, setConfirmingMassAction] = useState<{ scopeKey: string; pokemonIds: number[]; label: string } | null>(null);
  const [massActionMessage, setMassActionMessage] = useState<string | null>(null);

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
  // "knows about" species that existed by its own generation (Pokémon
  // HOME's generation sentinel never excludes anything, so it alone shows
  // the full roster). Titles without a real National Dex feature (Let's Go
  // onward's "Dexit" games, Brilliant Diamond/Shining Pearl, Legends:
  // Arceus) have no broader universe than their own region at all — for
  // those, National View just IS the Regional View, since a generation
  // cutoff would otherwise show hundreds of species that title's world
  // never had (e.g. Brilliant Diamond showing all ~1000 species through
  // Gen 8 instead of just Sinnoh's ~493).
  const baseTiles: Tile[] = useMemo(() => {
    if (gameTitle && !gameTitle.has_expanded_national_dex && regionalDex.length > 0) return regionalDex;
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

  // A tile's "relevant" varieties: every form sharing its Dex number that
  // isn't a battle-only cosmetic form (Mega/Gmax) and already existed by
  // the active game's generation — "no Galarian Meowth in FireRed."
  function relevantVarieties(tile: Tile): SpeciesVariety[] {
    const all = varietiesByPokemonId.get(tile.pokemonId) ?? [];
    if (all.length <= 1) return all;
    const baseGen = getGeneration(tile.pokemonId);
    const cap = gameTitle && gameTitle.generation !== HOME_GENERATION ? gameTitle.generation : Infinity;
    return all.filter((v) => !isCosmeticVariety(v.name, tile.name) && getVarietyGeneration(v.name, baseGen) <= cap);
  }

  const variantsByTile = useMemo(() => {
    const variants = new Map<number, SpeciesVariety[]>();
    for (const t of baseTiles) variants.set(t.pokemonId, relevantVarieties(t));
    return variants;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTiles, varietiesByPokemonId, gameTitle]);

  /**
   * Ownership for exactly the physical tile shown. A slid-open sub-tile
   * (Unown's letters, Pikachu's cosplay forms) shares its Dex-number's
   * pokemon_id with every OTHER form of that same species — the `form`
   * field is what actually tells them apart, so it's filtered on whenever
   * a specific variety/form is being shown. The collapsed tile aggregates
   * across every relevant form sharing this Dex number (Deoxys collapsed
   * shows "owned" if ANY of its formes are). Gender is checked last; an
   * untagged catch (still 'genderless') surfaces on BOTH gendered tiles
   * rather than silently disappearing.
   */
  function ownedForTile(tile: Tile): VaultEntry[] {
    if (tile.specimen) return [tile.specimen];
    let list: VaultEntry[];
    if (tile.variety) {
      list = (ownedByPokemonId.get(tile.variety.pokemonId) ?? []).filter((e) => e.form === tile.variety!.name);
    } else {
      const varieties = variantsByTile.get(tile.pokemonId) ?? [];
      const ids = varieties.length > 1 ? [...new Set(varieties.map((v) => v.pokemonId))] : [tile.pokemonId];
      list = ids.flatMap((id) => ownedByPokemonId.get(id) ?? []);
    }
    return tile.gender ? list.filter((e) => e.gender === tile.gender || e.gender === 'genderless') : list;
  }

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

  // Variant Slide (PRD 6.6) + Gender View data — which forms share each
  // tile's National Dex number, and its gender rate, off the same PokeAPI
  // response. Fetched once per species (concurrency-capped, cached forever
  // afterward) for whatever's currently visible.
  useEffect(() => {
    let cancelled = false;
    if (baseTiles.length === 0) return;
    getSpeciesFormDataBulk(baseTiles.map((t) => t.name)).then((byName) => {
      if (cancelled) return;
      const vMap = new Map<number, SpeciesVariety[]>();
      const gMap = new Map<number, number>();
      for (const t of baseTiles) {
        const data = byName.get(t.name);
        vMap.set(t.pokemonId, data?.varieties ?? []);
        if (data) gMap.set(t.pokemonId, data.genderRate);
      }
      setVarietiesByPokemonId(vMap);
      setGenderRateByPokemonId(gMap);
    });
    return () => {
      cancelled = true;
    };
  }, [baseTiles]);

  // Custom View is the sandbox: it always shows the true, unfiltered order
  // (filters, Gender View, and the Variant Slide are all hidden while
  // active) so box-group boundaries here always match the real persisted
  // sort_priority order of what's actually owned.
  const isCustom = viewMode === 'custom';

  // Species-level sort + species-level filters (type/rare/query) — ownership,
  // gender, and form-slide expansion aren't resolved yet.
  const sortedTiles = useMemo(() => {
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
      return [...list].sort((a, b) => {
        const pa = priorityByPokemonId.get(a.pokemonId);
        const pb = priorityByPokemonId.get(b.pokemonId);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return a.pokemonId - b.pokemonId;
      }); // sandbox: no filters applied
    } else if (viewMode === 'regional') {
      list = [...list].sort((a, b) => (a.regionalNumber ?? 0) - (b.regionalNumber ?? 0));
    } else {
      list = [...list].sort((a, b) => a.pokemonId - b.pokemonId);
    }

    return list.filter((t) => {
      if (rareOnly && !rareSpecies.has(titleCase(t.name)) && !rareSpecies.has(t.name)) return false;
      if (typeFilter && !speciesType(t.name).includes(typeFilter)) return false;
      if (matchingPokemonIds && !matchingPokemonIds.has(t.pokemonId)) return false;
      return true;
    });
  }, [baseTiles, viewMode, isCustom, entries, rareOnly, rareSpecies, typeFilter, matchingPokemonIds]);

  // Variant Slide — a slid-open species pushes every one of its forms in as
  // its own physical tile, right next to where the single tile used to be.
  const variantExpandedTiles = useMemo(() => {
    if (isCustom || viewMode === 'type') return sortedTiles;
    const out: Tile[] = [];
    for (const t of sortedTiles) {
      const varieties = variantsByTile.get(t.pokemonId) ?? [];
      if (varieties.length > 1 && slidOpenTiles.has(t.pokemonId)) {
        for (const v of varieties) out.push({ ...t, variety: v });
      } else {
        out.push(t);
      }
    }
    return out;
  }, [sortedTiles, isCustom, viewMode, variantsByTile, slidOpenTiles]);

  // Gender View — physically splits every mixed-gender species (gender_rate
  // 1–7; excludes always-one-gender and genderless species) into its own
  // Male and Female tile. This layers into the box grid rather than
  // replacing it — more tiles just means more boxes, same as the game.
  const genderExpandedTiles = useMemo(() => {
    if (!genderView || isCustom || viewMode === 'type') return variantExpandedTiles;
    const out: Tile[] = [];
    for (const t of variantExpandedTiles) {
      const rate = genderRateByPokemonId.get(t.pokemonId);
      if (rate !== undefined && rate >= 1 && rate <= 7) {
        out.push({ ...t, gender: 'male' });
        out.push({ ...t, gender: 'female' });
      } else {
        out.push(t);
      }
    }
    return out;
  }, [variantExpandedTiles, genderView, isCustom, viewMode, genderRateByPokemonId]);

  // Ownership-dependent filters, applied per physical tile — resolved AFTER
  // both expansions so hiding "caught" only hides a specific filled slot.
  const tiles = useMemo(() => {
    if (isCustom) return genderExpandedTiles;
    return genderExpandedTiles.filter((t) => {
      const owned = ownedForTile(t);
      const isOwned = owned.length > 0;
      if (hideCaught && isOwned) return false;
      if (shinyOnly && !owned.some((o) => o.shiny)) return false;
      if (flaggedOnly && !owned.some((o) => o.tags.length > 0)) return false;
      if (anomalousOnly && !owned.some((o) => o.is_sandbox_anomalous)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderExpandedTiles, isCustom, hideCaught, shinyOnly, flaggedOnly, anomalousOnly, ownedByPokemonId]);

  /** Groups multiple owned duplicates as one bucket to slide open — scoped per form/gender slot, so sliding one variety's duplicates never affects a sibling form's. */
  function duplicateBucketKey(tile: Tile): string {
    return `${tile.pokemonId}-${tile.gender ?? 'x'}-${tile.variety?.name ?? 'd'}`;
  }

  // Duplicate Slide — the same push-over mechanic as the Variant Slide, one
  // level down: sliding a species open pushes each individually-owned
  // specimen in as its own tile (collapsible back with the same control).
  const duplicateExpandedTiles = useMemo(() => {
    if (isCustom || viewMode === 'type') return tiles;
    const out: Tile[] = [];
    for (const t of tiles) {
      const owned = ownedForTile(t);
      const key = duplicateBucketKey(t);
      if (owned.length > 1 && slidOpenDuplicates.has(key)) {
        owned.forEach((specimen, i) => out.push({ ...t, specimen, duplicateSlideAnchor: i === 0 }));
      } else {
        out.push(t);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, isCustom, viewMode, slidOpenDuplicates, ownedByPokemonId, variantsByTile]);

  function toggleDuplicateSlide(tile: Tile, e: ReactMouseEvent) {
    e.stopPropagation();
    const key = duplicateBucketKey(tile);
    setSlidOpenDuplicates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- Box-group chunking (National/Regional/Custom) — same real
  // game-accurate box_width/boxes_slots math the game itself uses; Gender
  // View, the Variant Slide, and the Duplicate Slide just mean there are
  // more physical tiles to chunk, so more boxes appear, exactly like adding
  // Pokémon does today.
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

    for (const tile of duplicateExpandedTiles) {
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
  }, [duplicateExpandedTiles, viewMode, separateBox, boxSize, boxLabels]);

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

  // Generation Jumper (National View, every title — most useful on HOME's
  // full 9-generation span) — per-generation owned/total counts, click to
  // scroll straight to that generation's first tile.
  const generationCounts = useMemo(() => {
    if (viewMode !== 'national') return [];
    const maxGen = gameTitle && gameTitle.generation !== HOME_GENERATION ? gameTitle.generation : 9;
    const out: { gen: number; owned: number; total: number; firstPokemonId: number | null }[] = [];
    for (let g = 1; g <= maxGen; g++) {
      const inGen = baseTiles.filter((t) => getGeneration(t.pokemonId) === g);
      const owned = inGen.filter((t) => (ownedByPokemonId.get(t.pokemonId) ?? []).length > 0).length;
      out.push({ gen: g, owned, total: inGen.length, firstPokemonId: inGen[0]?.pokemonId ?? null });
    }
    return out;
  }, [viewMode, baseTiles, ownedByPokemonId, gameTitle]);

  function jumpToGeneration(pokemonId: number | null) {
    if (pokemonId === null) return;
    tileRefs.current.get(pokemonId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  /**
   * A collapsed multi-form tile has to catch AS a specific form (its
   * default one) rather than a bare 'default' form string — otherwise a
   * catch made before ever sliding a species open wouldn't match any of
   * its forms' `form` field once slid open later, and would effectively
   * vanish from every individual form tile (it'd still count toward the
   * collapsed aggregate, but never resolve back to "Unown-A is caught").
   */
  function resolveDefaultVariety(pokemonId: number): SpeciesVariety | undefined {
    const varieties = variantsByTile.get(pokemonId) ?? [];
    if (varieties.length <= 1) return undefined;
    return varieties.find((v) => v.isDefault) ?? varieties[0];
  }

  async function catchOneForTile(tile: Tile) {
    const variety = tile.variety ?? resolveDefaultVariety(tile.pokemonId);
    await quickCatch({
      gameInstanceId,
      species: titleCase(variety?.name ?? tile.name),
      pokemonId: variety?.pokemonId ?? tile.pokemonId,
      level: 5,
      shiny: false,
      nickname: null,
      ball: null,
      gender: tile.gender ?? 'genderless',
      form: variety?.name ?? 'default',
    });
  }

  /** Tapping a tile toggles catch state: uncaught catches one, already-caught releases one (confirming first if it's been adjusted off default) — adding a 2nd/3rd duplicate is a detail-panel action now, not a tap. */
  function releaseOneForTile(tile: Tile) {
    const owned = ownedForTile(tile);
    if (owned.length === 0) return;
    const target = owned.reduce((a, b) => (a.captured_date >= b.captured_date ? a : b));
    const reasons = specimenRealDataReasons(target);
    if (reasons.length === 0) {
      void bulkDelete([target.uuid]);
    } else {
      setConfirmingRelease({ uuid: target.uuid, species: target.species, reasons });
    }
  }

  function handleTileClick(tile: Tile, e: ReactMouseEvent) {
    if (tile.specimen) {
      // A slid-open specimen tile IS a specific duplicate already — tapping
      // it releases that one (same confirm-if-adjusted gate), rather than
      // opening its detail (that's what the ⓘ button is for now).
      if (!e.shiftKey) handleRemoveDrawerSpecimen(tile.specimen);
      return;
    }
    const owned = ownedForTile(tile);
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
      releaseOneForTile(tile);
    } else {
      void catchOneForTile(tile);
    }
  }

  async function confirmRelease() {
    if (!confirmingRelease) return;
    await bulkDelete([confirmingRelease.uuid]);
    setConfirmingRelease(null);
  }

  function toggleTileSlide(pokemonId: number, e: ReactMouseEvent) {
    e.stopPropagation();
    setSlidOpenTiles((prev) => {
      const next = new Set(prev);
      if (next.has(pokemonId)) next.delete(pokemonId);
      else next.add(pokemonId);
      return next;
    });
  }

  const multiFormPokemonIds = useMemo(() => {
    const set = new Set<number>();
    for (const [id, vs] of variantsByTile) if (vs.length > 1) set.add(id);
    return set;
  }, [variantsByTile]);

  function slideAllOpen() {
    setSlidOpenBeforeMaster(new Set(slidOpenTiles));
    setSlidOpenTiles(new Set(multiFormPokemonIds));
  }
  function collapseAllSlides() {
    setSlidOpenBeforeMaster(new Set(slidOpenTiles));
    setSlidOpenTiles(new Set());
  }
  function revertSlides() {
    if (slidOpenBeforeMaster) setSlidOpenTiles(slidOpenBeforeMaster);
  }

  function handleDetailClick(tile: Tile, e: ReactMouseEvent) {
    e.stopPropagation();
    setMultiSelected(new Set());
    setSelectedUuid(tile.specimen?.uuid ?? null);
    setExpandedPokemonId(tile.variety?.pokemonId ?? tile.pokemonId);
    setExpandedGender(tile.gender ?? null);
    // A form-layer variety (Unown's letters, cosplay costumes) shares its
    // Dex-number pokemon_id with every sibling form, so the drawer needs the
    // form name too, not just the id, to show only THIS form's specimens.
    setExpandedVarietyName(tile.variety && !tile.variety.isDefault ? tile.variety.name : null);
  }

  // The "select a duplicate" page (not the ID page for one specific
  // specimen) is where add/remove duplicate controls live.
  async function catchAnotherInDrawer(name: string | undefined) {
    if (expandedPokemonId === null || !name) return;
    const variety = expandedVarietyName ? undefined : resolveDefaultVariety(expandedPokemonId);
    await quickCatch({
      gameInstanceId,
      species: titleCase(variety?.name ?? name),
      pokemonId: variety?.pokemonId ?? expandedPokemonId,
      level: 5,
      shiny: false,
      nickname: null,
      ball: null,
      gender: expandedGender ?? 'genderless',
      form: expandedVarietyName ?? variety?.name ?? 'default',
    });
  }

  function handleRemoveDrawerSpecimen(entry: VaultEntry) {
    const reasons = specimenRealDataReasons(entry);
    if (reasons.length === 0) {
      void bulkDelete([entry.uuid]);
    } else {
      setConfirmingRelease({ uuid: entry.uuid, species: entry.species, reasons });
    }
  }

  function closeDrawer() {
    setExpandedPokemonId(null);
    setExpandedGender(null);
    setExpandedVarietyName(null);
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

  // --- Mark All / Unmark All / Revert to Selected (whole dex + per box) ---
  function uniqueTargetsFromTiles(list: (Tile | null)[]): MarkAllTarget[] {
    const byId = new Map<number, MarkAllTarget>();
    for (const t of list) {
      if (!t || byId.has(t.pokemonId)) continue;
      const variety = resolveDefaultVariety(t.pokemonId);
      byId.set(t.pokemonId, {
        pokemonId: variety?.pokemonId ?? t.pokemonId,
        species: titleCase(variety?.name ?? t.name),
        gender: 'genderless',
        form: variety?.name ?? 'default',
      });
    }
    return [...byId.values()];
  }

  async function handleMarkAll(scopeKey: string, targets: MarkAllTarget[]) {
    await markAll(scopeKey, gameInstanceId, targets);
    setMassActionMessage(null);
  }

  function requestUnmarkAll(scopeKey: string, targets: MarkAllTarget[], label: string) {
    setConfirmingMassAction({ scopeKey, pokemonIds: targets.map((t) => t.pokemonId), label });
  }

  async function confirmUnmarkAll() {
    if (!confirmingMassAction) return;
    await unmarkAll(confirmingMassAction.scopeKey, gameInstanceId, confirmingMassAction.pokemonIds);
    setConfirmingMassAction(null);
    setMassActionMessage(null);
  }

  async function handleRevertToSelected(scopeKey: string) {
    const ok = await revertToSelected(scopeKey);
    setMassActionMessage(ok ? null : 'Nothing to revert here yet — Revert restores the state from the last Mark All/Unmark All in this scope.');
  }

  const dexScopeKey = `${gameInstanceId}::ALL`;
  const dexTargets = useMemo(() => uniqueTargetsFromTiles(sortedTiles), [sortedTiles]);

  const expandedTileForDrawer =
    expandedPokemonId !== null ? tiles.find((t) => (t.variety?.pokemonId ?? t.pokemonId) === expandedPokemonId) : undefined;
  const expandedName =
    expandedPokemonId !== null
      ? expandedTileForDrawer?.variety?.name ??
        expandedTileForDrawer?.name ??
        baseTiles.find((t) => t.pokemonId === expandedPokemonId)?.name ??
        [...variantsByTile.values()].flat().find((v) => v.pokemonId === expandedPokemonId)?.name
      : undefined;
  const expandedSpecies =
    expandedPokemonId !== null
      ? (ownedByPokemonId.get(expandedPokemonId) ?? [])
          .filter((e) => !expandedGender || e.gender === expandedGender)
          .filter((e) => !expandedVarietyName || e.form === expandedVarietyName)
      : [];
  const selected = entries.find((e) => e.uuid === selectedUuid) ?? null;
  const drawerOpen = expandedPokemonId !== null;

  useClickOutside(openBadgeFor !== null, 'data-badge-dropdown', () => setOpenBadgeFor(null));

  function renderTile(tile: Tile) {
    const varieties = variantsByTile.get(tile.pokemonId) ?? [];
    const hasVariants = varieties.length > 1;
    const slidOpen = slidOpenTiles.has(tile.pokemonId);
    const displayId = tile.variety?.pokemonId ?? tile.pokemonId;
    const displayName = tile.variety?.name ?? tile.name;
    const owned = ownedForTile(tile);
    const isOwned = owned.length > 0;
    const isShiny = owned.some((o) => o.shiny);
    const isAnomalous = owned.some((o) => o.is_sandbox_anomalous);
    const tileBadges = badges.get(tile.pokemonId) ?? [];
    const isMultiSelected = multiSelected.has(tile.pokemonId);
    const isReservedTarget = reservedTargetSpecies.has(toID(tile.name));
    const isLocked = owned.some((o) => o.breeding_project_lock?.is_locked);
    const dupKey = duplicateBucketKey(tile);
    const dupSlidOpen = slidOpenDuplicates.has(dupKey);
    const showDuplicateToggle = tile.specimen ? tile.duplicateSlideAnchor === true : owned.length > 1;
    // variety.name (not pokemonId) is what's guaranteed unique here — every
    // form-layer entry (Unown's 28 letters) shares one base pokemonId, so
    // keying on pokemonId collided every one of them into the same React key.
    // A specimen's own uuid is added on top since a slid-open duplicate
    // group shares everything else about the tile.
    const tileKey = `${tile.pokemonId}-${tile.gender ?? 'x'}-${tile.variety?.name ?? 'd'}-${tile.specimen?.uuid ?? 's'}`;
    const genderMark = tile.gender ? (tile.gender === 'male' ? ' ♂' : ' ♀') : '';
    const formMark = tile.variety ? ` (${formVarietyLabel(tile.variety, tile.name)})` : '';

    return (
      <div
        key={tileKey}
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
        title={`${titleCase(displayName)}${genderMark}${formMark}`}
        className={[
          'group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded border p-0.5 outline-none',
          isMultiSelected
            ? 'border-amber-400 bg-amber-500/10'
            : expandedPokemonId === displayId
              ? 'border-yellow-300 bg-slate-900/80'
              : isReservedTarget
                ? 'border-blue-400'
                : tile.gender === 'male'
                  ? 'border-sky-800/60 bg-slate-900/60 hover:border-sky-500'
                  : tile.gender === 'female'
                    ? 'border-pink-800/60 bg-slate-900/60 hover:border-pink-500'
                    : 'border-slate-700 bg-slate-900/60 hover:border-slate-500',
          isLocked ? 'ring-1 ring-amber-400/60' : '',
          isAnomalous ? 'warning-pulse border-red-500' : '',
        ].join(' ')}
        style={{ width: TILE_PX, height: TILE_PX }}
      >
        <img
          src={tileSpriteUrl(displayId, tile.variety, isShiny)}
          alt={displayName}
          className={['h-full w-full object-contain', isOwned ? '' : 'opacity-30 grayscale'].join(' ')}
          style={{ imageRendering: 'pixelated' }}
        />
        <span className="truncate text-[8px] text-slate-500">
          #{tile.regionalNumber ?? tile.pokemonId}
          {genderMark}
        </span>
        {owned.length > 1 && (
          <span className="absolute left-0.5 top-0.5 z-10 rounded bg-slate-950/90 px-1 text-[8px] leading-none text-slate-200">×{owned.length}</span>
        )}
        {hasVariants && (!tile.variety || tile.variety.isDefault) && (
          <button
            type="button"
            onClick={(e) => toggleTileSlide(tile.pokemonId, e)}
            title={slidOpen ? `Collapse ${varieties.length} forms back into one tile` : `Slide open ${varieties.length} forms as their own tiles`}
            className="absolute bottom-0.5 right-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-violet-700/60 bg-slate-950/90 text-[9px] leading-none text-violet-300 hover:bg-violet-900/60"
          >
            {slidOpen ? '◂' : '▸'}
          </button>
        )}
        {showDuplicateToggle && (
          <button
            type="button"
            onClick={(e) => toggleDuplicateSlide(tile, e)}
            title={dupSlidOpen ? 'Collapse duplicates back into one tile' : `Slide open ${owned.length} duplicates as their own tiles`}
            className={[
              'absolute bottom-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-blue-700/60 bg-slate-950/90 text-[9px] leading-none text-blue-300 hover:bg-blue-900/60',
              hasVariants && (!tile.variety || tile.variety.isDefault) ? 'right-[18px]' : 'right-0.5',
            ].join(' ')}
          >
            {dupSlidOpen ? '◂' : '▸'}
          </button>
        )}
        {tileBadges.length > 0 && (
          <button
            type="button"
            data-badge-dropdown
            onClick={(e) => {
              e.stopPropagation();
              setOpenBadgeFor((v) => (v === tile.pokemonId ? null : tile.pokemonId));
            }}
            title="Which of your Dexes have this species — click to open"
            className="absolute bottom-0.5 left-0.5 z-10 flex gap-0.5 rounded bg-slate-950/40 p-0.5"
          >
            {tileBadges.slice(0, 3).map((b, i) => (
              <span key={b.gameInstanceId} className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: BADGE_COLORS[i % BADGE_COLORS.length] }} />
            ))}
          </button>
        )}
        {openBadgeFor === tile.pokemonId && (
          <div
            data-badge-dropdown
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-full left-0 z-30 mb-1 w-40 rounded border border-slate-700 bg-slate-900/98 p-1.5 text-[9px] shadow-2xl"
          >
            <p className="mb-1 text-slate-500">Owned in:</p>
            {allInstances.map((inst) => {
              const t = gameTitleById.get(inst.game_title_id);
              const hasIt = inst.game_instance_id === gameInstanceId ? isOwned : tileBadges.some((b) => b.gameInstanceId === inst.game_instance_id);
              return (
                <div key={inst.game_instance_id} className="flex items-center gap-1.5 py-0.5">
                  <span className={hasIt ? 'text-emerald-400' : 'text-slate-600'}>{hasIt ? '✓' : '—'}</span>
                  <span className="text-slate-300">{t?.name ?? inst.game_title_id}</span>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={(e) => handleDetailClick(tile, e)}
          title={`${titleCase(displayName)} details`}
          className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full border border-slate-600 bg-slate-950/90 text-[9px] leading-none text-cyan-300 hover:bg-slate-800 group-hover:flex group-focus-within:flex"
        >
          ⓘ
        </button>
      </div>
    );
  }

  useClickOutside(organizeOpen, 'data-organize-dropdown', () => setOrganizeOpen(false));
  useClickOutside(filterOpen, 'data-filter-dropdown', () => setFilterOpen(false));
  useClickOutside(bulkOpen, 'data-bulk-dropdown', () => setBulkOpen(false));

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
                setBulkOpen(false);
              }}
              className={[
                'rounded border px-2.5 py-1 text-[10px]',
                organizeOpen ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60',
              ].join(' ')}
            >
              Organize {organizeOpen ? '▲' : '▼'}
            </button>
            {organizeOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-max min-w-[260px] rounded-lg border border-slate-700 bg-slate-900/98 p-2.5 shadow-2xl">
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
                  <button
                    type="button"
                    onClick={() => setGenderView((v) => !v)}
                    disabled={isCustom || viewMode === 'type'}
                    title="Physically splits every mixed-gender species into its own Male and Female tile within the same box grid."
                    className={['rounded border px-2 py-0.5 text-[10px]', genderView ? 'border-pink-400/60 bg-pink-500/20 text-pink-300' : 'border-slate-700 text-slate-400 disabled:opacity-30'].join(' ')}
                  >
                    Gender View
                  </button>
                </div>
                {!isCustom && viewMode !== 'type' && multiFormPokemonIds.size > 0 && (
                  <>
                    <p className="mb-1 mt-2 text-[9px] uppercase tracking-wide text-slate-500">Variant Slide ({multiFormPokemonIds.size} species)</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={slideAllOpen} className="rounded border border-violet-500/50 bg-violet-500/20 px-2 py-0.5 text-violet-300 hover:bg-violet-500/30">
                        Slide All Forms
                      </button>
                      <button type="button" onClick={collapseAllSlides} className="rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:bg-slate-800/60">
                        Collapse All
                      </button>
                      {slidOpenBeforeMaster && (
                        <button type="button" onClick={revertSlides} className="rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:bg-slate-800/60">
                          Revert
                        </button>
                      )}
                    </div>
                  </>
                )}
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
                setBulkOpen(false);
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

          <div className="relative" data-bulk-dropdown>
            <button
              type="button"
              onClick={() => {
                setBulkOpen((v) => !v);
                setOrganizeOpen(false);
                setFilterOpen(false);
              }}
              className={[
                'rounded border px-2.5 py-1 text-[10px]',
                bulkOpen ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60',
              ].join(' ')}
            >
              Bulk {bulkOpen ? '▲' : '▼'}
            </button>
            {bulkOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-max min-w-[220px] rounded-lg border border-slate-700 bg-slate-900/98 p-2.5 shadow-2xl">
                <p className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">This whole dex</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void handleMarkAll(dexScopeKey, dexTargets)} className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-0.5 text-cyan-300 hover:bg-cyan-500/30">
                    Mark All
                  </button>
                  <button type="button" onClick={() => requestUnmarkAll(dexScopeKey, dexTargets, 'this whole dex')} className="rounded border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-red-300 hover:bg-red-500/30">
                    Unmark All
                  </button>
                  <button type="button" onClick={() => void handleRevertToSelected(dexScopeKey)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:bg-slate-800/60">
                    Revert to Selected
                  </button>
                </div>
                <p className="mt-2 text-slate-500">Mark/Unmark All catches or clears the default form of every species currently in view. Each box also has its own Mark/Unmark/Revert in its header.</p>
              </div>
            )}
          </div>

          <span className="ml-auto text-slate-500">
            {entries.length > 0 && `${new Set(entries.map((e) => e.pokemon_id)).size}/${baseTiles.length || '…'} caught`}
          </span>
        </div>

        {viewMode === 'national' && generationCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {generationCounts.map((g) => (
              <button
                key={g.gen}
                type="button"
                onClick={() => jumpToGeneration(g.firstPokemonId)}
                title={`Jump to Generation ${g.gen}`}
                className="rounded border border-slate-700 px-1.5 py-0.5 text-[9px] text-slate-400 hover:border-cyan-400 hover:text-cyan-300"
              >
                Gen {g.gen} <span className="text-slate-500">{g.owned}/{g.total}</span>
              </button>
            ))}
          </div>
        )}

        {overCapacity && (
          <div className="warning-pulse rounded-lg border border-red-500 bg-red-950/40 p-2 text-red-300">
            {entries.length} specimens on hand exceeds {gameTitle?.name}'s real storage capacity ({capacity}). Something's off — check for
            duplicates or specimens that should have been traded/released.
          </div>
        )}

        {massActionMessage && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-400">
            {massActionMessage}
            <button type="button" onClick={() => setMassActionMessage(null)} className="ml-2 text-cyan-300 hover:underline">
              dismiss
            </button>
          </div>
        )}

        {confirmingMassAction && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-2">
            <p className="mb-2 text-red-300">
              Unmark All in {confirmingMassAction.label}? This releases every specimen of {confirmingMassAction.pokemonIds.length} species there. Revert to Selected will bring them back afterward, no matter how long it's been.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void confirmUnmarkAll()} className="rounded border border-red-500/50 bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30">
                Unmark All
              </button>
              <button type="button" onClick={() => setConfirmingMassAction(null)} className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                Cancel
              </button>
            </div>
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
        {confirmingRelease && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-2">
            <p className="mb-2 text-red-300">
              Release this {confirmingRelease.species}? It has {confirmingRelease.reasons.join(', ')} — this can be undone from Version History.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void confirmRelease()} className="rounded border border-red-500/50 bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30">
                Release
              </button>
              <button type="button" onClick={() => setConfirmingRelease(null)} className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60">
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
                  const ownedCount = group.tiles.filter((t) => t && ownedForTile(t).length > 0).length;
                  const boxScopeKey = `${gameInstanceId}::box-${group.boxNumber}`;
                  const boxTargets = uniqueTargetsFromTiles(group.tiles);
                  return (
                    <div key={group.boxNumber}>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
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
                        <div className="flex items-center gap-1 text-[9px] text-slate-500">
                          <button type="button" onClick={() => void handleMarkAll(boxScopeKey, boxTargets)} title="Mark All in this box" className="hover:text-cyan-300">✓all</button>
                          <button type="button" onClick={() => requestUnmarkAll(boxScopeKey, boxTargets, group.label)} title="Unmark All in this box" className="hover:text-red-400">✗all</button>
                          <button type="button" onClick={() => void handleRevertToSelected(boxScopeKey)} title="Revert this box to before the last Mark/Unmark All" className="hover:text-cyan-300">↺</button>
                        </div>
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
                            <div key={`empty-${group.boxNumber}-${i}`} className="aspect-square rounded border border-dashed border-slate-800/60 bg-slate-900/20" style={{ width: TILE_PX, height: TILE_PX }} />
                          ),
                        )}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>

      {drawerOpen && expandedName && (
        <div className={['flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800/60', drawerExpanded ? 'w-full' : 'w-full shrink-0 sm:w-[380px]'].join(' ')}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-2">
            <p className="font-retro text-[9px] text-slate-200">
              {selected ? selected.species : titleCase(expandedName)}
              {expandedGender && <span className="text-slate-500"> {expandedGender === 'male' ? '♂' : '♀'}</span>}
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
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void catchAnotherInDrawer(expandedName)}
                  className="self-start rounded border border-cyan-700/60 px-2 py-0.5 text-cyan-300 hover:bg-cyan-900/40"
                >
                  + Add another duplicate
                </button>
                <ul className="grid grid-cols-4 gap-2">
                  {expandedSpecies.map((e) => (
                    <li key={e.uuid} className="relative">
                      <button
                        type="button"
                        onClick={() => setSelectedUuid(e.uuid)}
                        className="flex w-full flex-col items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/50 p-2 hover:border-slate-500"
                      >
                        <img src={getSpriteUrl(e.pokemon_id, e.shiny)} alt={e.species} className="h-16 w-16" style={{ imageRendering: 'pixelated' }} />
                        <span className="text-[9px] leading-tight text-slate-300">{e.nickname ?? `Lv.${e.level}`}</span>
                        <span className="text-[9px] text-slate-500">
                          {e.shiny && <span className="text-amber-300">★ </span>}
                          {e.is_sandbox_anomalous && <span className="text-red-400">⚠</span>}
                          {!e.shiny && !e.is_sandbox_anomalous && `Lv.${e.level}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDrawerSpecimen(e)}
                        title="Remove this one"
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-red-700/60 bg-slate-950 text-[10px] text-red-300 hover:bg-red-900/60"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <SpeciesReference species={titleCase(expandedName)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
