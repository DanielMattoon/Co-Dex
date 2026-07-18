import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { VaultList } from '../components/VaultList';
import { ItemDex } from '../components/ItemDex';
import { PokedexScreen } from '../components/PokedexScreen';
import { TypeDex } from '../components/TypeDex';
import { ShinyHuntWidget } from '../components/ShinyHuntWidget';

type Tab = 'vault' | 'pokedex' | 'types' | 'items' | 'shinyhunt';

const TABS: { id: Tab; label: string }[] = [
  { id: 'vault', label: 'Living Dex' },
  { id: 'pokedex', label: 'Pokédex (Reference)' },
  { id: 'types', label: 'Types' },
  { id: 'items', label: 'Items' },
  { id: 'shinyhunt', label: 'Shiny Hunt' },
];

export function VaultScreen() {
  const [tab, setTab] = useState<Tab>('vault');
  const { gameInstanceId } = useActiveGameInstance();
  const entries = useLiveQuery(
    () => (gameInstanceId ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray() : []),
    [gameInstanceId],
  );
  const caughtPokemonIds = new Set((entries ?? []).map((e) => e.pokemon_id));

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
        {tab === 'vault' && <VaultList />}
        {tab === 'pokedex' && <PokedexScreen caughtPokemonIds={caughtPokemonIds} />}
        {tab === 'types' && <TypeDex />}
        {tab === 'items' && <ItemDex />}
        {tab === 'shinyhunt' && <ShinyHuntWidget />}
      </div>
    </div>
  );
}
