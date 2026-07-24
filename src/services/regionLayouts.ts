/**
 * Original, hand-authored region topology for the geographic Map view —
 * NOT extracted, traced, or derived from any game screenshot, ROM asset,
 * or third-party map image. What's encoded here is factual game-world
 * geography (which route connects which two towns, what kind of terrain
 * it is) — the same kind of fact any strategy guide states in prose
 * ("Route 1 connects Pallet Town to Viridian City") — laid out on an
 * original abstract grid of this app's own design. The visual rendering
 * (RegionMap.tsx) draws its own tile art from these facts; nothing here
 * is copyrighted expression, and nothing it produces is either.
 *
 * `col`/`row` are an approximate topological grid, not real coordinates —
 * they preserve relative position (north/south/east/west of neighbors)
 * well enough to read as "the shape of Kanto," without claiming pixel
 * accuracy to any canonical map.
 */
export type RegionNodeKind = 'town' | 'route' | 'cave' | 'forest' | 'water' | 'landmark';

export interface RegionNode {
  /** Matches the PokeAPI location slug this node represents, so selecting it wires straight into the existing encounter/trainer lookup. */
  locationName: string;
  label: string;
  kind: RegionNodeKind;
  col: number;
  row: number;
  /** locationName of every directly-connected neighbor, for drawing route lines. */
  connections: string[];
}

export const KANTO_LAYOUT: RegionNode[] = [
  { locationName: 'pallet-town', label: 'Pallet Town', kind: 'town', col: 2, row: 11, connections: ['kanto-route-1', 'kanto-route-21'] },
  { locationName: 'kanto-route-1', label: 'Route 1', kind: 'route', col: 2, row: 10, connections: ['pallet-town', 'viridian-city'] },
  { locationName: 'viridian-city', label: 'Viridian City', kind: 'town', col: 2, row: 9, connections: ['kanto-route-1', 'kanto-route-2', 'kanto-route-22'] },
  { locationName: 'kanto-route-2', label: 'Route 2', kind: 'route', col: 2, row: 8, connections: ['viridian-city', 'viridian-forest', 'pewter-city'] },
  { locationName: 'viridian-forest', label: 'Viridian Forest', kind: 'forest', col: 2.6, row: 8, connections: ['kanto-route-2'] },
  { locationName: 'pewter-city', label: 'Pewter City', kind: 'town', col: 2, row: 7, connections: ['kanto-route-2', 'kanto-route-3'] },
  { locationName: 'kanto-route-3', label: 'Route 3', kind: 'route', col: 3, row: 7, connections: ['pewter-city', 'mt-moon'] },
  { locationName: 'mt-moon', label: 'Mt. Moon', kind: 'cave', col: 4, row: 7, connections: ['kanto-route-3', 'kanto-route-4'] },
  { locationName: 'kanto-route-4', label: 'Route 4', kind: 'route', col: 5, row: 7, connections: ['mt-moon', 'cerulean-city'] },
  { locationName: 'cerulean-city', label: 'Cerulean City', kind: 'town', col: 6, row: 7, connections: ['kanto-route-4', 'kanto-route-24', 'kanto-route-5', 'kanto-route-9'] },
  { locationName: 'kanto-route-24', label: 'Route 24', kind: 'route', col: 6, row: 6, connections: ['cerulean-city', 'kanto-route-25'] },
  { locationName: 'kanto-route-25', label: 'Route 25', kind: 'route', col: 6.5, row: 5.5, connections: ['kanto-route-24'] },
  { locationName: 'cerulean-cave', label: 'Cerulean Cave', kind: 'cave', col: 6, row: 5, connections: [] },
  { locationName: 'kanto-route-9', label: 'Route 9', kind: 'route', col: 7, row: 7, connections: ['cerulean-city', 'kanto-route-10'] },
  { locationName: 'kanto-route-10', label: 'Route 10', kind: 'route', col: 7, row: 8, connections: ['kanto-route-9', 'rock-tunnel', 'kanto-power-plant'] },
  { locationName: 'rock-tunnel', label: 'Rock Tunnel', kind: 'cave', col: 7, row: 9, connections: ['kanto-route-10', 'lavender-town'] },
  { locationName: 'kanto-power-plant', label: 'Power Plant', kind: 'landmark', col: 8, row: 8, connections: ['kanto-route-10'] },
  { locationName: 'kanto-route-5', label: 'Route 5', kind: 'route', col: 6, row: 8, connections: ['cerulean-city', 'saffron-city'] },
  { locationName: 'kanto-route-6', label: 'Route 6', kind: 'route', col: 6, row: 10, connections: ['saffron-city', 'vermilion-city'] },
  { locationName: 'vermilion-city', label: 'Vermilion City', kind: 'town', col: 6, row: 11, connections: ['kanto-route-6', 'kanto-route-11', 'ss-anne'] },
  { locationName: 'ss-anne', label: 'S.S. Anne', kind: 'landmark', col: 5, row: 11, connections: ['vermilion-city'] },
  { locationName: 'kanto-route-11', label: 'Route 11', kind: 'route', col: 7, row: 11, connections: ['vermilion-city', 'digletts-cave'] },
  { locationName: 'digletts-cave', label: "Diglett's Cave", kind: 'cave', col: 7, row: 10, connections: ['kanto-route-11'] },
  { locationName: 'saffron-city', label: 'Saffron City', kind: 'town', col: 6, row: 9, connections: ['kanto-route-5', 'kanto-route-6', 'kanto-route-7', 'kanto-route-8'] },
  { locationName: 'kanto-route-7', label: 'Route 7', kind: 'route', col: 5, row: 9, connections: ['saffron-city', 'celadon-city'] },
  { locationName: 'celadon-city', label: 'Celadon City', kind: 'town', col: 4, row: 9, connections: ['kanto-route-7', 'kanto-route-16'] },
  { locationName: 'kanto-route-8', label: 'Route 8', kind: 'route', col: 7, row: 9, connections: ['saffron-city', 'lavender-town'] },
  { locationName: 'lavender-town', label: 'Lavender Town', kind: 'town', col: 8, row: 9, connections: ['kanto-route-8', 'rock-tunnel', 'kanto-route-12', 'pokemon-tower'] },
  { locationName: 'pokemon-tower', label: 'Pokémon Tower', kind: 'landmark', col: 8, row: 8.3, connections: ['lavender-town'] },
  { locationName: 'kanto-route-12', label: 'Route 12', kind: 'route', col: 8, row: 10, connections: ['lavender-town', 'kanto-route-13'] },
  { locationName: 'kanto-route-13', label: 'Route 13', kind: 'route', col: 8, row: 11, connections: ['kanto-route-12', 'kanto-route-14'] },
  { locationName: 'kanto-route-14', label: 'Route 14', kind: 'route', col: 7, row: 11.5, connections: ['kanto-route-13', 'kanto-route-15'] },
  { locationName: 'kanto-route-15', label: 'Route 15', kind: 'route', col: 6, row: 12, connections: ['kanto-route-14', 'fuchsia-city'] },
  { locationName: 'fuchsia-city', label: 'Fuchsia City', kind: 'town', col: 5, row: 12, connections: ['kanto-route-15', 'kanto-route-18', 'kanto-route-19', 'kanto-safari-zone'] },
  { locationName: 'kanto-safari-zone', label: 'Safari Zone', kind: 'landmark', col: 5, row: 13, connections: ['fuchsia-city'] },
  { locationName: 'kanto-route-16', label: 'Route 16', kind: 'route', col: 4, row: 10, connections: ['celadon-city', 'kanto-route-17'] },
  { locationName: 'kanto-route-17', label: 'Route 17', kind: 'route', col: 4, row: 11, connections: ['kanto-route-16', 'kanto-route-18'] },
  { locationName: 'kanto-route-18', label: 'Route 18', kind: 'route', col: 4, row: 12, connections: ['kanto-route-17', 'fuchsia-city'] },
  { locationName: 'kanto-route-19', label: 'Route 19', kind: 'water', col: 5, row: 13, connections: ['fuchsia-city', 'kanto-sea-route-20'] },
  { locationName: 'kanto-sea-route-20', label: 'Route 20', kind: 'water', col: 4, row: 13, connections: ['kanto-route-19', 'seafoam-islands', 'cinnabar-island'] },
  { locationName: 'seafoam-islands', label: 'Seafoam Islands', kind: 'cave', col: 4, row: 12.3, connections: ['kanto-sea-route-20'] },
  { locationName: 'cinnabar-island', label: 'Cinnabar Island', kind: 'town', col: 3, row: 13, connections: ['kanto-sea-route-20', 'kanto-route-21', 'pokemon-mansion'] },
  { locationName: 'pokemon-mansion', label: 'Pokémon Mansion', kind: 'landmark', col: 3, row: 13.7, connections: ['cinnabar-island'] },
  { locationName: 'kanto-route-21', label: 'Route 21', kind: 'water', col: 2.5, row: 12, connections: ['cinnabar-island', 'pallet-town'] },
  { locationName: 'kanto-route-22', label: 'Route 22', kind: 'route', col: 1, row: 9, connections: ['viridian-city', 'kanto-route-23'] },
  { locationName: 'kanto-route-23', label: 'Route 23', kind: 'route', col: 1, row: 8, connections: ['kanto-route-22', 'kanto-victory-road-1'] },
  { locationName: 'kanto-victory-road-1', label: 'Victory Road', kind: 'cave', col: 1, row: 7, connections: ['kanto-route-23', 'indigo-plateau'] },
  { locationName: 'indigo-plateau', label: 'Indigo Plateau', kind: 'landmark', col: 1, row: 6, connections: ['kanto-victory-road-1'] },
];

export const REGION_LAYOUTS: Record<string, RegionNode[]> = {
  kanto: KANTO_LAYOUT,
};
