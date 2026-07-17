import { SAMPLE_ROUTE } from './mapData';

export interface CatchNextTarget {
  species: string;
  pokemonId: number;
  routeName: string;
  rate: number;
}

/**
 * "Catch Next" generator (PRD 6.11) — scans known encounter data for
 * species not yet caught and surfaces one at random with its spawn route,
 * linking into the Map Guide. Scoped to whatever routes exist in
 * mapData.ts's placeholder data (one sample route for now, per PRD 4.1's
 * "one game fully working end-to-end" decision) — a real build would scan
 * every route in the active game.
 */
export function getCatchNextTarget(caughtIds: Set<number>): CatchNextTarget | null {
  const candidates = SAMPLE_ROUTE.zones.flatMap((zone) =>
    zone.encounters.map((enc) => ({ ...enc, routeName: SAMPLE_ROUTE.name })),
  );
  const uncaught = candidates.filter((c) => !caughtIds.has(c.pokemon_id));
  if (uncaught.length === 0) return null;

  const pick = uncaught[Math.floor(Math.random() * uncaught.length)];
  return { species: pick.species, pokemonId: pick.pokemon_id, routeName: pick.routeName, rate: pick.rate };
}
