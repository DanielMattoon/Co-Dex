import { Generations, toID } from '@smogon/calc';

const GEN = Generations.get(9);

export interface CounterSuggestion {
  vaultSpecies: string;
  bestMultiplier: number;
}

/**
 * Auto-generated counter-strategy suggestions for a boss roster, pulled from
 * the player's own live Vault based on type advantage (PRD 7.3). Reuses the
 * same bundled type chart as the Damage Calculator (PRD 8.2 consolidation
 * note) rather than a separate dataset.
 */
export function suggestCounters(bossSpecies: string, ownedSpeciesNames: string[]): CounterSuggestion[] {
  const boss = GEN.species.get(toID(bossSpecies));
  if (!boss) return [];

  const results: CounterSuggestion[] = [];
  const seen = new Set<string>();
  for (const name of ownedSpeciesNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    const sp = GEN.species.get(toID(name));
    if (!sp) continue;

    let best = 0;
    for (const atkType of sp.types) {
      let multiplier = 1;
      for (const defType of boss.types) {
        const eff = GEN.types.get(toID(atkType))?.effectiveness[defType] ?? 1;
        multiplier *= eff;
      }
      best = Math.max(best, multiplier);
    }
    if (best > 1) results.push({ vaultSpecies: name, bestMultiplier: best });
  }

  return results.sort((a, b) => b.bestMultiplier - a.bestMultiplier);
}
