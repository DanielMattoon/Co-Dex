import { useEffect, useState } from 'react';
import { getSpeciesEggData, listAllSpeciesNames, type SpeciesEggData } from '../services/pokeapi';
import { checkEggCompatibility } from '../services/breeding';

/**
 * Egg Group Compatibility Checker (PRD 8.4) — the first of four Breeding
 * Planner sub-features. Chain Breeding/IV Planner and Egg Move Inheritance
 * Tree are follow-on work built on this same pokeapi.ts service.
 */
export function BreedingPlanner() {
  const [speciesNames, setSpeciesNames] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parentA, setParentA] = useState('charizard');
  const [parentB, setParentB] = useState('ditto');
  const [dataA, setDataA] = useState<SpeciesEggData | null>(null);
  const [dataB, setDataB] = useState<SpeciesEggData | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    listAllSpeciesNames()
      .then(setSpeciesNames)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load species list'));
  }, []);

  useEffect(() => {
    setChecking(true);
    setLoadError(null);
    Promise.all([getSpeciesEggData(parentA), getSpeciesEggData(parentB)])
      .then(([a, b]) => {
        setDataA(a);
        setDataB(b);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Lookup failed'))
      .finally(() => setChecking(false));
  }, [parentA, parentB]);

  const result = dataA && dataB ? checkEggCompatibility(dataA, dataB) : null;

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <p className="font-retro text-[9px] text-slate-300">Egg Group Compatibility</p>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={parentA}
          onChange={(e) => setParentA(e.target.value)}
          disabled={speciesNames.length === 0}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
        >
          {speciesNames.length === 0 ? (
            <option>{parentA}</option>
          ) : (
            speciesNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </select>
        <select
          value={parentB}
          onChange={(e) => setParentB(e.target.value)}
          disabled={speciesNames.length === 0}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
        >
          {speciesNames.length === 0 ? (
            <option>{parentB}</option>
          ) : (
            speciesNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-3">
        {loadError && <p className="text-red-400">{loadError}</p>}
        {!loadError && checking && <p className="text-slate-500">Checking…</p>}
        {!loadError && !checking && result && (
          <div className="flex flex-col gap-2">
            <p className={`font-retro text-[9px] ${result.compatible ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.compatible ? 'Compatible' : 'Not compatible'}
            </p>
            <p className="text-slate-300">{result.reason}</p>
            {dataA && dataB && (
              <p className="text-slate-500">
                {dataA.name}: {dataA.eggGroups.join(', ') || 'none'} · {dataB.name}:{' '}
                {dataB.eggGroups.join(', ') || 'none'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
