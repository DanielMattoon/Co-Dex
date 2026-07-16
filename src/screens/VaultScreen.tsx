import { useState } from 'react';
import { VaultList } from '../components/VaultList';
import { ItemDex } from '../components/ItemDex';

type Tab = 'vault' | 'items';

const TABS: { id: Tab; label: string }[] = [
  { id: 'vault', label: 'Vault' },
  { id: 'items', label: 'Items' },
];

export function VaultScreen() {
  const [tab, setTab] = useState<Tab>('vault');

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
        {tab === 'vault' && <VaultList />}
        {tab === 'items' && <ItemDex />}
      </div>
    </div>
  );
}
