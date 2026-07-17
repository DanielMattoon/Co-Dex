/**
 * Shiny Hunt Calculator Suite (PRD 11.1). Base odds and the Shiny Charm/
 * Masuda Method roll bonuses are well-documented, stable game mechanics
 * (Gen 6+: 1 base roll at 1/4096, Shiny Charm adds 2 rolls, Masuda Method
 * adds 5 rolls, and these stack additively). Chain-based methods (Chain
 * Fishing, DexNav, SOS chains, Mass Outbreaks) use different, more
 * elaborate tier tables per game that aren't hardcoded here — encoding
 * exact breakpoints without being certain of them would present guessed
 * numbers as authoritative to someone making a real time investment, so
 * those are exposed as a manual "extra rolls" override instead.
 */

export type OddsEra = 'gen6plus' | 'gen1to5';

export interface ShinyOddsInput {
  era: OddsEra;
  shinyCharm: boolean;
  masudaMethod: boolean;
  manualBonusRolls: number;
}

export function totalRolls(input: ShinyOddsInput): number {
  const base = 1;
  const charmRolls = input.era === 'gen6plus' && input.shinyCharm ? 2 : 0;
  const masudaRolls = input.masudaMethod ? (input.era === 'gen6plus' ? 5 : 3) : 0;
  return base + charmRolls + masudaRolls + Math.max(0, input.manualBonusRolls);
}

export function baseOddsDenominator(era: OddsEra): number {
  return era === 'gen6plus' ? 4096 : 8192;
}

/** Probability of a shiny on a single encounter, given the active bonuses. */
export function perEncounterProbability(input: ShinyOddsInput): number {
  const rolls = totalRolls(input);
  const missChance = 1 - 1 / baseOddsDenominator(input.era);
  return 1 - Math.pow(missChance, rolls);
}

/** Probability of at least one shiny across N independent encounters. */
export function cumulativeProbability(perEncounter: number, encounters: number): number {
  if (encounters <= 0) return 0;
  return 1 - Math.pow(1 - perEncounter, encounters);
}

export function formatOdds(probability: number): string {
  if (probability <= 0) return '0';
  const oneIn = Math.round(1 / probability);
  return `~1 in ${oneIn.toLocaleString()}`;
}

export function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(3)}%`;
}
