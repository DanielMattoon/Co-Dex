import { useState } from 'react';
import { DamageCalc } from '../components/DamageCalc';
import { BreedingPlanner } from '../components/BreedingPlanner';
import { IVChainPlanner } from '../components/IVChainPlanner';

type Tab = 'calc' | 'breed' | 'ivplan';

const TABS: { id: Tab; label: string }[] = [
  { id: 'calc', label: 'Calculator' },
  { id: 'breed', label: 'Breeding' },
  { id: 'ivplan', label: 'IV Chain' },
];

/**
 * Hosts the Damage Calculator and Breeding Planner sub-features under one
 * bottom-nav tab (PRD Section 8) via an in-screen sub-tab switcher, keeping
 * this a two-tap flow rather than crowding the primary nav (PRD 2.2).
 */
export function TeamScreen() {
  const [tab, setTab] = useState<Tab>('calc');

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'rounded-md border px-2.5 py-1 text-[10px]',
              tab === t.id
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'calc' && <DamageCalc />}
        {tab === 'breed' && <BreedingPlanner />}
        {tab === 'ivplan' && <IVChainPlanner />}
      </div>
    </div>
  );
}
