import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import {
  getEggMoves,
  getLearnMethodsForSpeciesMove,
  getMoveLearners,
  listAllSpeciesNames,
} from '../services/pokeapi';

interface FatherCandidate {
  species: string;
  methods: string[];
  owned: boolean;
}

/**
 * Egg Move Inheritance Tree (PRD 8.4, sub-feature 3) — shows which egg moves
 * a target species can learn, and for a selected move, which species can act
 * as the father (learning it by a non-egg method, e.g. level-up/machine/
 * tutor), cross-checked against the live Vault for "do I already have this
 * parent." Father candidates are checked lazily, a handful at a time, since
 * PokéAPI's move endpoint returns every learner across all methods and
 * confirming a non-egg method needs one fetch per candidate.
 */
export function EggMoveTree() {
  const [speciesNames, setSpeciesNames] = useState<string[]>([]);
  const [target, setTarget] = useState('eevee');
  const [eggMoves, setEggMoves] = useState<string[]>([]);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [fathers, setFathers] = useState<FatherCandidate[]>([]);
  const [loadingMoves, setLoadingMoves] = useState(false);
  const [loadingFathers, setLoadingFathers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vaultEntries = useLiveQuery(() => db.vault.toArray(), []);
  const ownedSpecies = new Set((vaultEntries ?? []).map((e) => e.species.toLowerCase()));

  useEffect(() => {
    listAllSpeciesNames()
      .then(setSpeciesNames)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load species list'));
  }, []);

  useEffect(() => {
    setLoadingMoves(true);
    setError(null);
    setSelectedMove(null);
    setFathers([]);
    getEggMoves(target)
      .then(setEggMoves)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load egg moves'))
      .finally(() => setLoadingMoves(false));
  }, [target]);

  async function pickMove(move: string) {
    setSelectedMove(move);
    setFathers([]);
    setLoadingFathers(true);
    setError(null);
    try {
      const learners = await getMoveLearners(move);
      const candidates = learners.filter((l) => l !== target).slice(0, 8);
      const checked: FatherCandidate[] = [];
      for (const candidate of candidates) {
        const methods = await getLearnMethodsForSpeciesMove(candidate, move);
        const nonEgg = methods.filter((m) => m !== 'egg');
        if (nonEgg.length > 0) {
          checked.push({ species: candidate, methods: nonEgg, owned: ownedSpecies.has(candidate) });
        }
      }
      setFathers(checked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check father candidates');
    } finally {
      setLoadingFathers(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        disabled={speciesNames.length === 0}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
      >
        {speciesNames.length === 0 ? (
          <option>{target}</option>
        ) : (
          speciesNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))
        )}
      </select>

      {error && <p className="text-red-400">{error}</p>}

      <div className="flex flex-1 gap-2 overflow-hidden">
        <div className="w-1/2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          <p className="mb-1 font-retro text-[9px] text-slate-300">Egg Moves</p>
          {loadingMoves && <p className="text-slate-500">Loading…</p>}
          {!loadingMoves && eggMoves.length === 0 && <p className="text-slate-500">None found.</p>}
          <ul className="flex flex-col gap-1">
            {eggMoves.map((move) => (
              <li key={move}>
                <button
                  type="button"
                  onClick={() => pickMove(move)}
                  className={[
                    'w-full rounded px-2 py-1 text-left hover:bg-slate-700/60',
                    selectedMove === move ? 'bg-slate-700/60 text-cyan-300' : 'text-slate-300',
                  ].join(' ')}
                >
                  {move}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-1/2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          <p className="mb-1 font-retro text-[9px] text-slate-300">Father Candidates</p>
          {!selectedMove && <p className="text-slate-500">Pick an egg move.</p>}
          {selectedMove && loadingFathers && <p className="text-slate-500">Checking learn methods…</p>}
          {selectedMove && !loadingFathers && fathers.length === 0 && (
            <p className="text-slate-500">No non-egg learners found among the top candidates.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {fathers.map((f) => (
              <li key={f.species} className="rounded border border-slate-700 bg-slate-900/60 p-1.5">
                <p className="text-slate-200">{f.species}</p>
                <p className="text-slate-500">via {f.methods.join(', ')}</p>
                <p className={f.owned ? 'text-emerald-400' : 'text-slate-500'}>
                  {f.owned ? 'You own this species' : 'Not in your Vault'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
