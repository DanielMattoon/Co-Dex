import type { SpeciesEggData } from './pokeapi';

export interface EggCompatibilityResult {
  compatible: boolean;
  reason: string;
}

const UNDISCOVERED_GROUP = 'no-eggs';
const DITTO_GROUP = 'ditto';

/** Egg Group Compatibility Checker (PRD 8.4). */
export function checkEggCompatibility(a: SpeciesEggData, b: SpeciesEggData): EggCompatibilityResult {
  const aUndiscovered = a.eggGroups.includes(UNDISCOVERED_GROUP);
  const bUndiscovered = b.eggGroups.includes(UNDISCOVERED_GROUP);
  if (aUndiscovered || bUndiscovered) {
    const culprit = aUndiscovered ? a.name : b.name;
    return {
      compatible: false,
      reason: `${culprit} is in the Undiscovered egg group and cannot breed.`,
    };
  }

  const aIsDitto = a.eggGroups.includes(DITTO_GROUP);
  const bIsDitto = b.eggGroups.includes(DITTO_GROUP);
  if (aIsDitto || bIsDitto) {
    return {
      compatible: true,
      reason: 'Ditto can breed with any species outside the Undiscovered egg group.',
    };
  }

  const shared = a.eggGroups.filter((g) => b.eggGroups.includes(g));
  if (shared.length > 0) {
    return { compatible: true, reason: `Shared egg group: ${shared.join(', ')}.` };
  }
  return { compatible: false, reason: 'No shared egg groups.' };
}

export type StatId = 'HP' | 'Atk' | 'Def' | 'SpA' | 'SpD' | 'Spe';
export const ALL_STATS: StatId[] = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

export interface BreedingParent {
  label: string;
  perfectStats: StatId[];
  heldItem: string;
}

export interface BreedingStage {
  generation: number;
  description: string;
  parents: BreedingParent[];
}

export interface BreedingPlan {
  stages: BreedingStage[];
  summary: string;
}

function splitStats(stats: StatId[]): [StatId[], StatId[]] {
  const mid = Math.ceil(stats.length / 2);
  return [stats.slice(0, mid), stats.slice(mid)];
}

/**
 * Chain Breeding / IV Planner (PRD 8.4). Walks backward from a target IV
 * spread through the Destiny Knot (5-IV inheritance, picks 5 random IVs from
 * the combined parent pool) + Everstone (nature lock) breeding chain used by
 * the community. Since Gen 6, Destiny Knot on one parent and Everstone on
 * the other can be held simultaneously in the same pairing — earlier
 * generations required choosing one or the other.
 */
export function planBreedingChain(targetStats: StatId[], wantsNature: boolean): BreedingPlan {
  const stats = [...new Set(targetStats)];
  if (stats.length === 0) {
    return { stages: [], summary: 'Pick at least one target IV to plan a chain.' };
  }

  const natureNote = wantsNature
    ? ' Hold Everstone on one parent alongside Destiny Knot on the other to lock nature and boost IVs in the same pairing.'
    : '';

  if (stats.length <= 3) {
    const [groupA, groupB] = splitStats(stats);
    return {
      stages: [
        {
          generation: 1,
          description:
            `Single generation, no Destiny Knot needed — with 3 or fewer target IVs, ` +
            `the offspring's natural 3-IV inheritance can cover them on its own.${natureNote}`,
          parents: [
            { label: 'Parent A', perfectStats: groupA, heldItem: wantsNature ? 'Everstone' : 'None' },
            { label: 'Parent B', perfectStats: groupB, heldItem: 'None' },
          ],
        },
      ],
      summary: `1 generation to reach ${stats.length} perfect IV${stats.length > 1 ? 's' : ''}.`,
    };
  }

  if (stats.length <= 5) {
    const [groupA, groupB] = splitStats(stats);
    return {
      stages: [
        {
          generation: 1,
          description:
            `Single generation with Destiny Knot — the offspring inherits 5 random IVs ` +
            `from the combined pool of both parents, so covering your ${stats.length} targets ` +
            `across two parents is enough.${natureNote}`,
          parents: [
            { label: 'Parent A', perfectStats: groupA, heldItem: 'Destiny Knot' },
            { label: 'Parent B', perfectStats: groupB, heldItem: wantsNature ? 'Everstone' : 'None' },
          ],
        },
      ],
      summary: `1 generation (Destiny Knot) to reach ${stats.length} perfect IVs.`,
    };
  }

  // Flawless 6-IV: two generations. Gen 1 builds two 5-IV parents (each
  // missing a different stat) from 3-IV base grandparents; Gen 2 crosses
  // those two 5-IV parents with Destiny Knot, hoping the union covers all 6.
  const [gpGroupA, gpGroupB] = splitStats(ALL_STATS.slice(0, 3));
  const [gpGroupC, gpGroupD] = splitStats(ALL_STATS.slice(3, 6));
  return {
    stages: [
      {
        generation: 1,
        description:
          'Breed two pairs of 3-IV grandparents with Destiny Knot to fish for two 5-IV ' +
          'intermediate parents, each ideally missing a different stat.',
        parents: [
          { label: 'Grandparent A', perfectStats: gpGroupA, heldItem: 'None' },
          { label: 'Grandparent B', perfectStats: gpGroupB, heldItem: 'Destiny Knot' },
          { label: 'Grandparent C', perfectStats: gpGroupC, heldItem: 'None' },
          { label: 'Grandparent D', perfectStats: gpGroupD, heldItem: 'Destiny Knot' },
        ],
      },
      {
        generation: 2,
        description:
          `Cross the two resulting 5-IV parents with Destiny Knot (and Everstone on the ` +
          `other if nature matters) — the combined pool gives good odds of a flawless 6-IV offspring.${natureNote}`,
        parents: [
          { label: 'Parent A (5-IV, Gen 1)', perfectStats: ALL_STATS.slice(0, 5), heldItem: 'Destiny Knot' },
          {
            label: 'Parent B (5-IV, Gen 1)',
            perfectStats: [...ALL_STATS.slice(0, 4), ALL_STATS[5]],
            heldItem: wantsNature ? 'Everstone' : 'None',
          },
        ],
      },
    ],
    summary: '2 generations for a flawless 6-IV offspring — the deepest chain Co-Dex plans for.',
  };
}
