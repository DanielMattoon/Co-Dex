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
