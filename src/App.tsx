import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/schema';
import { StatBar } from './components/StatBar';

const SAMPLE_STATS = [
  { label: 'HP', value: 78 },
  { label: 'ATK', value: 84 },
  { label: 'DEF', value: 78 },
  { label: 'SPA', value: 109 },
  { label: 'SPD', value: 85 },
  { label: 'SPE', value: 100 },
];

function App() {
  const vaultCount = useLiveQuery(() => db.vault.count(), []);

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="console-frame flex w-full flex-col gap-4 p-6">
        <h1 className="font-retro text-sm text-cyan-300">Co-Dex</h1>
        <p className="text-xs text-slate-400">
          Vault entries tracked: {vaultCount ?? 0}
        </p>
        <div className="flex flex-col gap-1.5">
          {SAMPLE_STATS.map((stat) => (
            <StatBar key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
