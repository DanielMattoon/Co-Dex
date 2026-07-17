import { Generations, toID } from '@smogon/calc';
import type { TeamSlot } from '../db/schema';

const GEN = Generations.get(9);
export const ALL_TYPES = [...GEN.types].map((t) => t.name).filter((t) => t !== '???');

export type MatchupCategory = 'weak' | 'resist' | 'immune' | 'neutral';

export interface TypeMatchup {
  type: string;
  category: MatchupCategory;
  multiplier: number;
}

export interface TeammateCoverage {
  species: string;
  matchups: TypeMatchup[];
}

export interface SynergyReport {
  teammates: TeammateCoverage[];
  /** How many teammates are weak (>=2x) to each attacking type — higher = a bigger team-wide liability. */
  sharedWeaknesses: { type: string; count: number }[];
  /** Defending types no team move hits super-effectively, approximated against a pure single type (PRD 8.5). */
  coverageGaps: string[];
}

function defensiveMultiplier(defenderTypes: string[], attackingType: string): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    const eff = GEN.types.get(toID(attackingType))?.effectiveness[defType as never] ?? 1;
    multiplier *= eff;
  }
  return multiplier;
}

function categorize(multiplier: number): MatchupCategory {
  if (multiplier === 0) return 'immune';
  if (multiplier >= 2) return 'weak';
  if (multiplier < 1) return 'resist';
  return 'neutral';
}

/**
 * Team Synergy Analyzer (PRD 8.5) — extends the single-Pokémon Damage
 * Calculator's type chart (PRD 8.2's "Combat Data Engine" consolidation
 * note) to a full party: combined weaknesses/resistances/immunities plus a
 * move-coverage gap check. Coverage is approximated against pure single
 * types rather than all 171 dual-type combinations — enough to answer "does
 * this team have any answer to Fairy," which is the PRD's own example.
 */
export function analyzeTeamSynergy(slots: TeamSlot[]): SynergyReport {
  const filled = slots.filter((s) => s.species.trim());

  const teammates: TeammateCoverage[] = filled.map((slot) => {
    const species = GEN.species.get(toID(slot.species));
    const types = species?.types ?? ['Normal'];
    const matchups: TypeMatchup[] = ALL_TYPES.map((atkType) => {
      const multiplier = defensiveMultiplier([...types], atkType);
      return { type: atkType, category: categorize(multiplier), multiplier };
    });
    return { species: slot.species, matchups };
  });

  const sharedWeaknesses = ALL_TYPES.map((type) => ({
    type,
    count: teammates.filter((t) => t.matchups.find((m) => m.type === type)?.category === 'weak').length,
  }))
    .filter((w) => w.count > 0)
    .sort((a, b) => b.count - a.count);

  const teamMoveTypes = new Set<string>();
  for (const slot of filled) {
    for (const moveName of slot.moves) {
      if (!moveName.trim()) continue;
      const move = GEN.moves.get(toID(moveName));
      if (move && move.category !== 'Status') teamMoveTypes.add(move.type);
    }
  }

  const coverageGaps = ALL_TYPES.filter((defType) => {
    const bestAgainst = [...teamMoveTypes].reduce((best, atkType) => {
      const eff = GEN.types.get(toID(atkType))?.effectiveness[defType as never] ?? 1;
      return Math.max(best, eff);
    }, 0);
    return bestAgainst <= 1;
  });

  return { teammates, sharedWeaknesses, coverageGaps };
}
