import { useEffect, useState } from 'react';
import { Generations, toID } from '@smogon/calc';
import { getEvolutionChain, getLevelUpMoves, type EvolutionChainData, type LevelUpMove } from '../services/pokeapi';
import { getGeneration } from '../services/boxes';
import { getSpeciesIdIndex, lookupSpeciesId } from '../services/speciesIndex';
import { StatBar } from './StatBar';

const GEN = Generations.get(9);
const STAT_LABELS: [string, string][] = [
  ['hp', 'HP'],
  ['atk', 'ATK'],
  ['def', 'DEF'],
  ['spa', 'SPA'],
  ['spd', 'SPD'],
  ['spe', 'SPE'],
];

function externalLinks(species: string) {
  const bulbapediaName = species.replace(/\s+/g, '_');
  return {
    bulbapedia: `https://bulbapedia.bulbagarden.net/wiki/${bulbapediaName}_(Pok%C3%A9mon)`,
    serebii: `https://www.serebii.net/pokedex-sv/${toID(species)}/`,
  };
}

/**
 * The reference layer shared by the Info Panel and the Static Pokédex
 * (PRD 6.12, 6.13: "detail page (same shared component as the Info Panel's
 * reference layer)") — base stats, evolution family, level-up learnset,
 * and outbound wiki links. No live-tracking state (tags/held item/
 * breeding lock/etc.) lives here; that's InfoPanel's job for owned
 * specimens.
 */
export function SpeciesReference({ species, generationCap }: { species: string; generationCap?: number }) {
  const [evolution, setEvolution] = useState<EvolutionChainData | null>(null);
  const [levelUpMoves, setLevelUpMoves] = useState<LevelUpMove[] | null>(null);
  const [speciesIdIndex, setSpeciesIdIndex] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    setEvolution(null);
    setLevelUpMoves(null);
    getEvolutionChain(species).then(setEvolution).catch(() => setEvolution({ species: [], edges: [] }));
    getLevelUpMoves(species).then(setLevelUpMoves).catch(() => setLevelUpMoves([]));
  }, [species]);

  useEffect(() => {
    getSpeciesIdIndex().then(setSpeciesIdIndex);
  }, []);

  const smogonSpecies = GEN.species.get(toID(species));
  const baseStats = smogonSpecies?.baseStats;
  const links = externalLinks(species);

  // A species' evolution FAMILY (PokeAPI) isn't the same as what's
  // reachable in a specific game's generation — Stantler's chain includes
  // Wyrdeer, which only exists from Legends: Arceus onward, so a Gold-era
  // reference shouldn't list it. Same gating as InfoPanel's reservation
  // picker, applied here to the flat reference chain.
  const cap = generationCap ?? Infinity;
  const evolutionSpeciesInGame = evolution
    ? evolution.species.filter((s) => {
        const id = lookupSpeciesId(speciesIdIndex, s);
        return id === undefined || getGeneration(id) <= cap;
      })
    : [];

  return (
    <div className="text-xs">
      {baseStats && (
        <div className="mb-3 flex flex-col gap-1">
          {STAT_LABELS.map(([key, label]) => (
            <StatBar key={key} label={label} value={baseStats[key as keyof typeof baseStats]} />
          ))}
        </div>
      )}

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Evolution</p>
        {evolution === null && <p className="text-slate-600">Loading…</p>}
        {evolution && evolution.species.length <= 1 && <p className="text-slate-600">Doesn't evolve.</p>}
        {evolution && evolution.species.length > 1 && evolutionSpeciesInGame.length <= 1 && (
          <p className="text-slate-600">No evolutions available yet in this game's generation.</p>
        )}
        {evolution && evolutionSpeciesInGame.length > 1 && (
          <p className="text-slate-300">
            {evolutionSpeciesInGame.join(' → ')}
            {evolutionSpeciesInGame.length < evolution.species.length && (
              <span className="text-slate-600"> (later stages hidden — not in this game's generation)</span>
            )}
          </p>
        )}
      </div>

      <div className="mb-3">
        <p className="mb-1 text-slate-500">Level-up learnset</p>
        {levelUpMoves === null && <p className="text-slate-600">Loading…</p>}
        {levelUpMoves && levelUpMoves.length === 0 && <p className="text-slate-600">No level-up moves found.</p>}
        {levelUpMoves && levelUpMoves.length > 0 && (
          <div className="max-h-24 overflow-y-auto">
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {levelUpMoves.map((m) => (
                <li key={m.move} className="text-slate-400">
                  {m.move} <span className="text-slate-600">Lv.{m.level}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-3 text-slate-500">
        <a href={links.bulbapedia} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300">
          Bulbapedia ↗
        </a>
        <a href={links.serebii} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300">
          Serebii ↗
        </a>
      </div>
    </div>
  );
}
