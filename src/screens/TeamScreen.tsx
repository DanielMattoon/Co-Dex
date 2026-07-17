import { useState } from 'react';
import { Teambuilder } from '../components/Teambuilder';
import { DamageCalc } from '../components/DamageCalc';
import { TeamSynergy } from '../components/TeamSynergy';
import { BreedingPlanner } from '../components/BreedingPlanner';
import { IVChainPlanner } from '../components/IVChainPlanner';
import { EggMoveTree } from '../components/EggMoveTree';
import { MetaAnalytics } from '../components/MetaAnalytics';

type Tab = 'builder' | 'calc' | 'synergy' | 'breed' | 'ivplan' | 'eggmoves' | 'meta';

const TABS: { id: Tab; label: string }[] = [
  { id: 'builder', label: 'Builder' },
  { id: 'calc', label: 'Calculator' },
  { id: 'synergy', label: 'Synergy' },
  { id: 'breed', label: 'Breeding' },
  { id: 'ivplan', label: 'IV Chain' },
  { id: 'eggmoves', label: 'Egg Moves' },
  { id: 'meta', label: 'Meta' },
];

/**
 * Hosts the Teambuilder, Damage Calculator, Breeding Planner sub-features,
 * and Meta Analytics under one bottom-nav tab (PRD Sections 8, 9) via an
 * in-screen sub-tab switcher, keeping this a two-tap flow rather than
 * crowding the primary nav (PRD 2.2).
 */
export function TeamScreen() {
  const [tab, setTab] = useState<Tab>('builder');

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
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
        {tab === 'builder' && <Teambuilder />}
        {tab === 'calc' && <DamageCalc />}
        {tab === 'synergy' && <TeamSynergy />}
        {tab === 'breed' && <BreedingPlanner />}
        {tab === 'ivplan' && <IVChainPlanner />}
        {tab === 'eggmoves' && <EggMoveTree />}
        {tab === 'meta' && <MetaAnalytics />}
      </div>
    </div>
  );
}
