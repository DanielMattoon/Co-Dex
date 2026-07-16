import { useMemo, useState } from 'react';
import { calculate, Generations, Move, Pokemon, type Result } from '@smogon/calc';

/**
 * Wraps @smogon/calc — bundled Pokémon/move/type data, so this runs entirely
 * client-side with zero network calls (PRD 8.2). Gen 9 only for this pass;
 * a generation selector is a follow-on, not a re-architecture.
 */
const GEN = Generations.get(9);
const ALL_SPECIES = [...GEN.species].map((s) => s.name).sort();
const ALL_MOVES = [...GEN.moves]
  .filter((m) => m.category !== 'Status')
  .map((m) => m.name)
  .sort();

interface Combatant {
  species: string;
  level: number;
}

function useCalcResult(attacker: Combatant, defender: Combatant, moveName: string): Result | null {
  return useMemo(() => {
    try {
      const atk = new Pokemon(GEN, attacker.species, { level: attacker.level });
      const def = new Pokemon(GEN, defender.species, { level: defender.level });
      const move = new Move(GEN, moveName);
      return calculate(GEN, atk, def, move);
    } catch {
      return null;
    }
  }, [attacker.species, attacker.level, defender.species, defender.level, moveName]);
}

function CombatantFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Combatant;
  onChange: (next: Combatant) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 p-2">
      <span className="font-retro text-[9px] text-slate-300">{label}</span>
      <select
        value={value.species}
        onChange={(e) => onChange({ ...value, species: e.target.value })}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
      >
        {ALL_SPECIES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-slate-400">
        Level
        <input
          type="number"
          min={1}
          max={100}
          value={value.level}
          onChange={(e) => onChange({ ...value, level: Number(e.target.value) || 1 })}
          className="w-16 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        />
      </label>
    </div>
  );
}

export function DamageCalc() {
  const [attacker, setAttacker] = useState<Combatant>({ species: 'Charizard', level: 100 });
  const [defender, setDefender] = useState<Combatant>({ species: 'Blastoise', level: 100 });
  const [moveName, setMoveName] = useState('Flamethrower');

  const result = useCalcResult(attacker, defender, moveName);
  const range = result?.range();
  const ko = result?.kochance();

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <CombatantFields label="Attacker" value={attacker} onChange={setAttacker} />

      <select
        value={moveName}
        onChange={(e) => setMoveName(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
      >
        {ALL_MOVES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <CombatantFields label="Defender" value={defender} onChange={setDefender} />

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-3">
        {result && range ? (
          <div className="flex flex-col gap-2">
            <p className="font-retro text-[9px] text-emerald-300">
              {range[0]}–{range[1]} dmg
            </p>
            <p className="text-slate-300">{result.desc()}</p>
            {ko?.text && <p className="text-amber-300">{ko.text}</p>}
          </div>
        ) : (
          <p className="text-slate-500">Pick a matchup to see damage.</p>
        )}
      </div>
    </div>
  );
}
