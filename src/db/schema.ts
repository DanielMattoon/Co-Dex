import Dexie, { type EntityTable } from 'dexie';

export interface GameTitle {
  game_title_id: string;
  name: string;
  generation: number;
  box_count: number;
  boxes_slots: number;
}

export interface GameInstance {
  game_instance_id: string;
  game_title_id: string;
  isNuzlockeMode: boolean;
  created_date: string;
  /** Set once a Nuzlocke run is declared won (PRD 12.4's "first Nuzlocke victory" badge). */
  is_victory: boolean;
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
