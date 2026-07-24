import Dexie, { type EntityTable } from 'dexie';

export interface GameTitle {
  game_title_id: string;
  name: string;
  /**
   * Highest National Dex generation this title's world recognizes — species
   * released after this generation didn't exist yet when this game shipped,
   * so National View excludes them and the Transfer Engine blocks moving
   * them in. Pokémon HOME (the default dex, no single generation cutoff)
   * uses HOME_GENERATION, a sentinel high enough to never exclude anything.
   */
  generation: number;
  box_count: number;
  boxes_slots: number;
  /** Real in-game box grid width (columns) — every mainline title since Gen 3 uses a 6-wide, 5-tall box. */
  box_width: number;
  /**
   * PokeAPI regional Pokédex resource name(s) for this title, in display
   * order (e.g. Kalos titles split across 3 sub-dexes: central/coastal/
   * mountain). Drives the Living Dex's Regional View (PRD 6.8).
   */
  pokedex_slugs: string[];
  /** True only for titles that can receive a Pokémon GO transfer directly (Let's Go Pikachu/Eevee, HOME). */
  allows_pokemon_go: boolean;
  /**
   * True for titles with a real National Dex feature broader than their own
   * region (every mainline game through Gen 7: Kanto through Alola all let
   * you eventually see/catch species beyond their own region). False for
   * titles whose Pokédex is permanently capped to their own region with no
   * such expansion — Let's Go Pikachu/Eevee, Sword/Shield onward (the
   * "Dexit" games), Brilliant Diamond/Shining Pearl, Legends: Arceus,
   * Scarlet/Violet. For those, National View just IS the Regional View —
   * using `generation` as a cutoff would otherwise show hundreds of species
   * (e.g. all of Kanto through Sword/Shield) that title's world never had.
   */
  has_expanded_national_dex: boolean;
  /** Sequential real-world release order (0 = earliest) — game_title_id is an arbitrary string, not sortable, so title pickers need this to show games chronologically. */
  release_order: number;
}

/** Pokémon HOME has no real generation ceiling — every species released so far fits. */
export const HOME_GENERATION = 9999;

export interface GameInstance {
  game_instance_id: string;
  game_title_id: string;
  isNuzlockeMode: boolean;
  created_date: string;
  /** Set once a Nuzlocke run is declared won (PRD 12.4's "first Nuzlocke victory" badge). */
  is_victory: boolean;
  /** User-chosen nickname for this save, shown as "{custom_name} (Game Title)" wherever the Dex is picked; null shows just the game title, unchanged. */
  custom_name: string | null;
}

export interface TrainerProfile {
  id: string;
  active_game_instance_id: string | null;
  /** Shown on the Public Profile / Trophy Case (PRD 12.1). */
  trainer_name: string;
  /** Completed Link Cable trades (PRD 12.4's trade-count badge tier), incremented on each executed swap. */
  link_cable_trade_count: number;
}

export interface IVs {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface EVs {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface ReservationStatus {
  is_reserved: boolean;
  target_evolution_id: string | null;
}

export interface BreedingProjectLock {
  is_locked: boolean;
  notes: string | null;
}

export interface HistoryLogEntry {
  timestamp: string;
  action: string;
  details: string;
}

export interface VaultEntry {
  uuid: string;
  species: string;
  pokemon_id: number;
  nickname: string | null;
  level: number;
  hp: number;
  dead: boolean;
  gender: 'male' | 'female' | 'genderless';
  shiny: boolean;
  form: string;
  catchLocation: string | null;
  origin_game_instance_id: string;
  current_game_instance_id: string;
  box_index: number;
  captured_date: string;
  ivs: IVs;
  evs: EVs;
  moves: string[];
  held_item: string | null;
  tags: string[];
  /** Poké Ball type, freeform (Smart-Map Importer/query grammar `ball:"X"`, PRD 15.1, 15.3). */
  ball: string | null;
  /** True if this specimen's origin is Pokémon GO — GO-origin specimens can only transfer directly to a title with allows_pokemon_go. */
  origin_pokemon_go: boolean;
  reservation_status: ReservationStatus;
  breeding_project_lock: BreedingProjectLock;
  history_log: HistoryLogEntry[];
  is_sandbox_anomalous: boolean;
  /** Floating-point Relative Priority Index for Custom View drag-reordering (PRD 6.3, 6.8). */
  sort_priority: number;
}

export interface MapProgress {
  id: string;
  routeId: string;
  game_instance_id: string;
  firstEncounterLogged: boolean;
  itemChecklist: Record<string, boolean>;
}

/** Custom name for a box (PRD 6.1 — "Custom names are always allowed"). */
export interface BoxLabel {
  id: string;
  game_instance_id: string;
  box_number: number;
  name: string;
}

/**
 * A completed shiny hunt (PRD 15.4's luck-ratio scatterplot needs real
 * encounters-vs-odds data points, not just the current hunt's live state).
 * Logged once, on catch, by the Shiny Hunt Companion (PRD 11.2).
 */
export interface ShinyHuntLogEntry {
  id: string;
  species: string;
  pokemon_id: number;
  encounters: number;
  per_encounter_probability: number;
  timestamp: string;
}

/**
 * Game Collection catalog entry (PRD 22) — static reference data, one row
 * per released title. `category` matches PRD 22.4's generic schema so
 * cards/movies/merch can reuse this table later without a re-architecture,
 * even though only 'game' is populated in v1.
 */
export interface CollectibleCatalogItem {
  catalog_id: string;
  category: 'game' | 'card' | 'movie' | 'merch';
  name: string;
  platform: string;
  region: string;
  release_year: number;
  /** True for the 37 core RPGs (Red through Violet); false for every spin-off. Shelf defaults to mainline-only. */
  is_mainline: boolean;
  /**
   * Groups multi-entry spin-off series (Mystery Dungeon, Ranger, Stadium,
   * Pokkén, ...) under one shared key so the Shelf can collapse them into a
   * single family tile — the same slide-open/collapse mechanic the Pokédex
   * grid uses for multi-form species — instead of flooding the grid with
   * one tile per sub-title. Null for standalone spin-offs and all mainline
   * titles (which are never grouped).
   */
  franchise: string | null;
  /** True world-release chronological order across the whole catalog, 0 = earliest. Not the same sequence as release_year, which is display-only (NA year). */
  release_order: number;
  /** True for eShop/storefront-only titles that never had a physical cartridge or disc release — lets the console filter isolate them as "Digital" instead of lumping them under whichever hardware they ran on. */
  digital_only: boolean;
}

export interface CollectibleGrading {
  is_graded: boolean;
  company: string | null;
  grade: string | null;
  cert_number: string | null;
}

export interface CollectibleAcquisition {
  purchase_price: number | null;
  purchase_date: string | null;
  source: string | null;
}

export interface CollectibleDisposition {
  is_sold: boolean;
  sold_price: number | null;
  sold_date: string | null;
  sold_via: string | null;
}

/** A physical owned copy of a catalog item (PRD 22.2) — a title can have several. */
export interface CollectibleCopy {
  copy_id: string;
  catalog_id: string;
  condition: string;
  grading: CollectibleGrading;
  acquisition: CollectibleAcquisition;
  disposition: CollectibleDisposition;
  linked_game_instance_id: string | null;
  notes: string;
  tags: string[];
}

/** One party slot in a built Team (PRD 8.1, 8.3). */
export interface TeamSlot {
  species: string;
  level: number;
  item: string;
  ability: string;
  nature: string;
  moves: string[];
  evs: EVs;
  ivs: IVs;
}

export interface Team {
  team_id: string;
  name: string;
  /** Teams belong to a save now — switching the active Dex switches Team too, same as Map. */
  game_instance_id: string;
  slots: TeamSlot[];
  created_date: string;
  updated_date: string;
}

export interface VersionHistoryEntry {
  id?: number;
  timestamp: string;
  action: string;
  summary: string;
  /**
   * A snapshot of every other table at the moment this entry was recorded,
   * keyed by table name — generic so new tables are covered automatically
   * (PRD 14.3) without editing this type. Absent on compacted entries: a
   * rough daily summary survives, but it's no longer revertible (pruning
   * policy).
   */
  snapshot: Record<string, unknown[]> | null;
  compacted: boolean;
}

/**
 * Durable "before" state for a Mark All / Unmark All action, scoped to one
 * dex or one box within it (PRD 6.1/6.8's Revert to Selected). Kept in its
 * own table, one row per scope (overwritten on the next mass action in that
 * same scope) rather than folded into Version History's pruned, time-boxed
 * snapshots — this has to keep working "no matter how long it's been."
 */
export interface MassActionSnapshot {
  /** `${game_instance_id}::ALL` for a whole-dex action, `${game_instance_id}::box-${n}` for one box. */
  scope_key: string;
  game_instance_id: string;
  pokemon_ids: number[];
  timestamp: string;
  entries: VaultEntry[];
}

export const db = new Dexie('CoDexDatabase') as Dexie & {
  game_titles: EntityTable<GameTitle, 'game_title_id'>;
  game_instances: EntityTable<GameInstance, 'game_instance_id'>;
  trainer_profile: EntityTable<TrainerProfile, 'id'>;
  vault: EntityTable<VaultEntry, 'uuid'>;
  map_progress: EntityTable<MapProgress, 'id'>;
  version_history: EntityTable<VersionHistoryEntry, 'id'>;
  collectible_catalog: EntityTable<CollectibleCatalogItem, 'catalog_id'>;
  collectible_copies: EntityTable<CollectibleCopy, 'copy_id'>;
  teams: EntityTable<Team, 'team_id'>;
  box_labels: EntityTable<BoxLabel, 'id'>;
  shiny_hunt_log: EntityTable<ShinyHuntLogEntry, 'id'>;
  mass_action_snapshots: EntityTable<MassActionSnapshot, 'scope_key'>;
};

db.version(1).stores({
  game_titles: 'game_title_id, generation',
  game_instances: 'game_instance_id, game_title_id',
  trainer_profile: 'id',
  vault:
    'uuid, pokemon_id, current_game_instance_id, origin_game_instance_id, box_index, shiny, dead, is_sandbox_anomalous',
  map_progress: 'id, routeId, game_instance_id',
});

db.version(2).stores({
  version_history: '++id, timestamp',
});

db.version(3).stores({
  collectible_catalog: 'catalog_id, category, platform',
  collectible_copies: 'copy_id, catalog_id',
});

db.version(4).stores({
  teams: 'team_id, created_date',
});

db.version(5).stores({
  box_labels: 'id, game_instance_id',
});

db.version(6).stores({
  shiny_hunt_log: 'id, pokemon_id, timestamp',
});

db.version(7).stores({
  teams: 'team_id, created_date, game_instance_id',
});

db.version(8).stores({
  mass_action_snapshots: 'scope_key, game_instance_id',
});
