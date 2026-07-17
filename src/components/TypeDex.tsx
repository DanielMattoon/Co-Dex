import { useState } from 'react';
import { Generations, toID } from '@smogon/calc';

const GEN = Generations.get(9);
const ALL_TYPES = [...GEN.types].map((t) => t.name).filter((t) => t !== '???');

function defensiveMultiplier(defenderTypes: string[], attackingType: string): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    const eff = GEN.types.get(toID(attackingType))?.effectiveness[defType as never] ?? 1;
    multiplier *= eff;
  }
  return multiplier;
}

function formatMultiplier(m: number): string {
  if (m === 0) return '0';
  if (m === 0.25) return '¼';
  if (m === 0.5) return '½';
  return `${m}x`;
}

function colorFor(m: number): string {
  if (m === 0) return 'text-cyan-300';
  if (m >= 2) return 'text-red-400';
  if (m < 1) return 'text-emerald-400';
  return 'text-slate-600';
}

/**
 * Type Dex (PRD 6.15) — tap up to two types to see defensive weaknesses/
 * resistances/immunities and offensive matchups, computed from the same
 * type chart the Damage Calculator and Team Synergy Analyzer use (PRD 8.2's
 * "Combat Data Engine" consolidation note — one dataset, not reimplemented
 * per feature).
 */
export function TypeDex() {
  const [selected, setSelected] = useState<string[]>([]);

  function toggleType(type: string) {
    setSelected((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      if (prev.length >= 2) return [prev[1], type];
      return [...prev, type];
    });
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <p className="text-slate-500">Tap up to two types.</p>
      <div className="grid grid-cols-4 gap-1.5">
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => toggleType(type)}
            className={[
              'rounded border px-2 py-1 text-[10px]',
              selected.includes(type)
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {type}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          <p className="mb-1 font-retro text-[9px] text-slate-300">
            {selected.join(' / ')} — Defending
          </p>
          <div className="mb-3 grid grid-cols-3 gap-1">
            {ALL_TYPES.map((atkType) => {
              const m = defensiveMultiplier(selected, atkType);
              return (
                <div key={atkType} className="flex justify-between rounded border border-slate-800 px-1.5 py-0.5">
                  <span className="text-slate-400">{atkType}</span>
                  <span className={colorFor(m)}>{formatMultiplier(m)}</span>
                </div>
              );
            })}
          </div>

          <p className="mb-1 font-retro text-[9px] text-slate-300">
            {selected.join(' / ')} — Attacking
          </p>
          <div className="grid grid-cols-3 gap-1">
            {ALL_TYPES.map((defType) => {
              const best = selected.reduce(
                (acc, atkType) => Math.max(acc, GEN.types.get(toID(atkType))?.effectiveness[defType as never] ?? 1),
                0,
              );
              return (
                <div key={defType} className="flex justify-between rounded border border-slate-800 px-1.5 py-0.5">
                  <span className="text-slate-400">{defType}</span>
                  <span className={colorFor(best)}>{formatMultiplier(best)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
