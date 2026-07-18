/**
 * Route/encounter/item coordinate data. In production this is generated at
 * build time from the pret decompilation projects (PRD 4.1/7.1) — never
 * fetched live, never reverse-engineered per-user. This file is a hand-typed
 * placeholder for one sample route so the Map Guide engine has something to
 * render before that ETL pipeline exists.
 */

export interface EncounterZone {
  id: string;
  /** Pixel-space bounds in the flat L.CRS.Simple grid: [[y0,x0],[y1,x1]] */
  bounds: [[number, number], [number, number]];
  kind: 'grass' | 'water' | 'cave';
  encounters: { species: string; pokemon_id: number; rate: number }[];
}

export interface RosterMember {
  species: string;
  level: number;
  moves: string[];
}

export interface MapMarker {
  id: string;
  position: [number, number];
  kind: 'item' | 'trainer' | 'gym';
  label: string;
  /** Gym Leader / Boss walkthrough roster (PRD 7.3) — trainer/gym markers only. */
  roster?: RosterMember[];
}

export interface RouteMapData {
  routeId: string;
  name: string;
  gridSize: [number, number];
  zones: EncounterZone[];
  markers: MapMarker[];
}

/**
 * Every route the Map Guide currently knows about, for the catch-location
 * picker on a Vault entry (PRD 6.12's "select where you found it," tied to
 * real Map data instead of freeform-only text). Today that's just the one
 * hand-typed sample route above — real per-game route lists aren't built
 * yet (see the file-level comment), so this list will grow as that ETL
 * pipeline lands rather than staying stuck at one entry.
 */
export function listKnownRoutes(): RouteMapData[] {
  return [SAMPLE_ROUTE];
}

export const SAMPLE_ROUTE: RouteMapData = {
  routeId: 'kanto_route_1',
  name: 'Route 1',
  gridSize: [320, 240],
  zones: [
    {
      id: 'route1_grass_north',
      bounds: [
        [40, 40],
        [120, 200],
      ],
      kind: 'grass',
      encounters: [
        { species: 'Pidgey', pokemon_id: 16, rate: 55 },
        { species: 'Rattata', pokemon_id: 19, rate: 45 },
      ],
    },
    {
      id: 'route1_grass_south',
      bounds: [
        [180, 40],
        [260, 200],
      ],
      kind: 'grass',
      encounters: [
        { species: 'Pidgey', pokemon_id: 16, rate: 40 },
        { species: 'Rattata', pokemon_id: 19, rate: 60 },
      ],
    },
  ],
  markers: [
    { id: 'route1_item_1', position: [30, 210], kind: 'item', label: 'Potion' },
    {
      id: 'route1_trainer_1',
      position: [150, 220],
      kind: 'trainer',
      label: 'Youngster Joey',
      roster: [{ species: 'Rattata', level: 4, moves: ['Tackle', 'Tail Whip'] }],
    },
    {
      id: 'route1_gym_brock',
      position: [90, 290],
      kind: 'gym',
      label: 'Gym Leader Brock',
      roster: [
        { species: 'Geodude', level: 12, moves: ['Tackle', 'Defense Curl'] },
        { species: 'Onix', level: 14, moves: ['Tackle', 'Screech', 'Bind', 'Rock Throw'] },
      ],
    },
  ],
};
