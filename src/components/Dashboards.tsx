import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ShinyHuntLogEntry } from '../db/schema';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { GRAVEYARD_BOX_INDEX } from '../services/boxes';
import { listAllSpeciesWithIds } from '../services/pokeapi';
import { getWantsAndNeeds, type WantsAndNeeds } from '../services/wantsAndNeeds';
import { downloadTextFile } from '../services/csv';

/**
 * Auto-Generated Visual Dashboards (PRD 15.4) — retro-styled charts
 * computed from local data, no manual pivot tables. Regional dex order
 * isn't modeled in this build (no per-game regional dex mapping data is
 * available here), so the completion bar below is national + per-active-save
 * rather than region-by-region.
 */
export function Dashboards() {
  const { gameInstanceId } = useActiveGameInstance();
  const allVault = useLiveQuery(() => db.vault.toArray(), []) ?? [];
  const activeEntries = useLiveQuery(
    () => (gameInstanceId ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray() : []),
    [gameInstanceId],
  ) ?? [];
  const gameInstance = useLiveQuery(() => (gameInstanceId ? db.game_instances.get(gameInstanceId) : undefined), [gameInstanceId]);
  const gameTitle = useLiveQuery(
    () => (gameInstance ? db.game_titles.get(gameInstance.game_title_id) : undefined),
    [gameInstance],
  );
  const huntLog = useLiveQuery(() => db.shiny_hunt_log.toArray(), []) ?? [];

  const [totalSpecies, setTotalSpecies] = useState(1025);
  const [wants, setWants] = useState<WantsAndNeeds | null>(null);

  useEffect(() => {
    listAllSpeciesWithIds().then((s) => setTotalSpecies(s.length || 1025)).catch(() => undefined);
    getWantsAndNeeds().then(setWants).catch(() => undefined);
  }, []);

  const activeOwned = activeEntries.filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX);
  const saveTotal = gameTitle ? gameTitle.box_count * gameTitle.boxes_slots : 0;
  const savePct = saveTotal > 0 ? clamp01(activeOwned.length / saveTotal) : 0;

  function exportShoppingList() {
    if (!wants) return;
    const text = wants.missingSpecies.map((s) => `#${s.pokemonId} ${s.name}`).join('\n');
    downloadTextFile(text, 'co-dex-living-dex-shopping-list.txt', 'text/plain');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-1 font-retro text-[9px] text-amber-300">Completion</p>
        <CompletionBar
          label={`National Living Dex (${new Set(allVault.map((e) => e.pokemon_id)).size}/${totalSpecies})`}
          pct={clamp01(new Set(allVault.map((e) => e.pokemon_id)).size / totalSpecies)}
        />
        {gameTitle && (
          <CompletionBar label={`${gameTitle.name} boxes filled (${activeOwned.length}/${saveTotal})`} pct={savePct} />
        )}
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-1 font-retro text-[9px] text-amber-300">Shiny Hunt Luck</p>
        {huntLog.length === 0 ? (
          <p className="text-slate-500">Complete a hunt in Shiny Hunt to see your luck scatterplot here.</p>
        ) : (
          <LuckScatterplot log={huntLog} />
        )}
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-1 font-retro text-[9px] text-amber-300">Living Dex Empty-Slot Shopping List</p>
        {wants ? (
          <>
            <p className="text-slate-400">{wants.missingSpecies.length} species still needed.</p>
            <button
              type="button"
              onClick={exportShoppingList}
              className="mt-1 rounded border border-cyan-500/40 px-2 py-1 text-cyan-300 hover:bg-cyan-500/10"
            >
              Download shopping list (.txt)
            </button>
          </>
        ) : (
          <p className="text-slate-500">Loading…</p>
        )}
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function CompletionBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="mb-1.5">
      <p className="mb-0.5 text-slate-400">{label}</p>
      <div className="h-2 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
        <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}

/** Encounters actually taken (x) vs. the statistically expected encounter count (y) — above the diagonal is lucky. */
function LuckScatterplot({ log }: { log: ShinyHuntLogEntry[] }) {
  const points = log.map((h) => ({
    species: h.species,
    x: h.encounters,
    y: h.per_encounter_probability > 0 ? 1 / h.per_encounter_probability : h.encounters,
  }));
  const maxVal = Math.max(10, ...points.map((p) => Math.max(p.x, p.y)));
  const size = 220;
  const pad = 20;
  const scale = (v: number) => pad + (v / maxVal) * (size - pad * 2);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="220" className="max-w-xs">
        <line x1={pad} y1={size - pad} x2={size - pad} y2={pad} stroke="#334155" strokeWidth={1} strokeDasharray="4 3" />
        <line x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} stroke="#475569" strokeWidth={1} />
        <line x1={pad} y1={size - pad} x2={pad} y2={pad} stroke="#475569" strokeWidth={1} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={scale(p.x)}
            cy={size - scale(p.y)}
            r={4}
            fill={p.x < p.y ? '#34d399' : '#f472b6'}
            opacity={0.85}
          >
            <title>
              {p.species}: caught in {p.x}, expected ~{Math.round(p.y)}
            </title>
          </circle>
        ))}
      </svg>
      <p className="text-[10px] text-slate-500">x = encounters taken · y = expected encounters · green = lucky, pink = unlucky</p>
    </div>
  );
}
