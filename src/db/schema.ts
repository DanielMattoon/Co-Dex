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
}

export interface TrainerProfile {
  id: string;
  active_game_instance_id: string | null;
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
  reservation_status: ReservationStatus;
  history_log: HistoryLogEntry[];
  is_sandbox_anomalous: boolean;
}

export interface MapProgress {
  id: string;
  routeId: string;
  game_instance_id: string;
  firstEncounterLogged: boolean;
  itemChecklist: Record<string, boolean>;
}

export const db = new Dexie('CoDexDatabase') as Dexie & {
  game_titles: EntityTable<GameTitle, 'game_title_id'>;
  game_instances: EntityTable<GameInstance, 'game_instance_id'>;
  trainer_profile: EntityTable<TrainerProfile, 'id'>;
  vault: EntityTable<VaultEntry, 'uuid'>;
  map_progress: EntityTable<MapProgress, 'id'>;
};

db.version(1).stores({
  game_titles: 'game_title_id, generation',
  game_instances: 'game_instance_id, game_title_id',
  trainer_profile: 'id',
  vault:
    'uuid, pokemon_id, current_game_instance_id, origin_game_instance_id, box_index, shiny, dead, is_sandbox_anomalous',
  map_progress: 'id, routeId, game_instance_id',
});
