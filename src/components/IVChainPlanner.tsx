import { useState } from 'react';
import { ALL_STATS, planBreedingChain, type StatId } from '../services/breeding';

export function IVChainPlanner() {
  const [targetStats, setTargetStats] = useState<Set<StatId>>(new Set(['HP', 'Atk', 'SpA']));
  const [wantsNature, setWantsNature] = useState(false);

  function toggleStat(stat: StatId) {
    setTargetStats((prev) => {
      const next = new Set(prev);
      if (next.has(stat)) next.delete(stat);
      else next.add(stat);
      return next;
    });
  }

  const plan = planBreedingChain([...targetStats], wantsNature);

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <p className="font-retro text-[9px] text-slate-300">Chain Breeding / IV Planner</p>

      <div className="flex flex-wrap gap-1.5">
        {ALL_STATS.map((stat) => (
          <button
            key={stat}
            type="button"
            onClick={() => toggleStat(stat)}
            className={[
              'rounded-md border px-2 py-1 text-[10px]',
              targetStats.has(stat)
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {stat}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-slate-400">
        <input
          type="checkbox"
          checked={wantsNature}
          onChange={(e) => setWantsNature(e.target.checked)}
          className="accent-cyan-400"
        />
        Lock nature too (Everstone)
      </label>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-3">
        {plan.stages.length === 0 ? (
          <p className="text-slate-500">{plan.summary}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-emerald-400">{plan.summary}</p>
            {plan.stages.map((stage) => (
              <div key={stage.generation} className="rounded-md border border-slate-700 bg-slate-900/60 p-2">
                <p className="font-retro text-[9px] text-cyan-300">Gen {stage.generation}</p>
                <p className="mt-1 text-slate-300">{stage.description}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {stage.parents.map((parent) => (
                    <li key={parent.label} className="text-slate-400">
                      <span className="text-slate-200">{parent.label}</span>: 31 IV in{' '}
                      {parent.perfectStats.join('/') || 'none'}
                      {parent.heldItem !== 'None' && (
                        <span className="text-amber-300"> · holds {parent.heldItem}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
