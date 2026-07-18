import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { createGameInstance, ensureSeedTitles, setActiveGameInstance } from '../services/gameInstances';
import { setNuzlockeMode } from '../services/nuzlocke';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';

/**
 * Save-file picker (PRD 5) — a game_title is static reference data (e.g.
 * "Emerald"); a game_instance is one specific save of that title, so the
 * same title can have multiple concurrent saves (a normal playthrough and a
 * separate Nuzlocke run, per the PRD's example). Every screen resolves
 * "current game" against whichever instance is active here.
 */
export function GameSavesPanel() {
  const { gameInstanceId: activeId } = useActiveGameInstance();

  // Seeding is a one-off write, not a query — running it inside useLiveQuery
  // would make the query re-trigger itself (it writes to the very table it
  // reads), which throws a duplicate-key DexieError on the second pass.
  useEffect(() => {
    void ensureSeedTitles();
  }, []);

  const instances = useLiveQuery(
    () => db.game_instances.toArray().then((rows) => rows.sort((a, b) => a.created_date.localeCompare(b.created_date))),
    [],
  );
  const titles = useLiveQuery(() => db.game_titles.toArray(), []);
  const titleById = new Map((titles ?? []).map((t) => [t.game_title_id, t]));

  const [newTitleId, setNewTitleId] = useState('');
  const [newNuzlocke, setNewNuzlocke] = useState(false);

  useEffect(() => {
    if (!newTitleId && titles && titles.length > 0) setNewTitleId(titles[0].game_title_id);
  }, [titles, newTitleId]);

  async function handleCreate() {
    if (!newTitleId) return;
    await createGameInstance(newTitleId, newNuzlocke);
    setNewNuzlocke(false);
  }

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-1 font-retro text-[9px] text-slate-300">Saves</p>
        <ul className="flex flex-col gap-1.5">
          {(instances ?? []).map((instance) => {
            const title = titleById.get(instance.game_title_id);
            const active = instance.game_instance_id === activeId;
            return (
              <li
                key={instance.game_instance_id}
                className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/60 p-2"
              >
                <div>
                  <p className="text-slate-200">{title?.name ?? instance.game_title_id}</p>
                  <p className="text-slate-500">
                    {instance.isNuzlockeMode ? 'Nuzlocke' : 'Standard'} · {new Date(instance.created_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void setNuzlockeMode(instance.game_instance_id, !instance.isNuzlockeMode)}
                    className={[
                      'rounded border px-2 py-1',
                      instance.isNuzlockeMode ? 'border-red-500/50 bg-red-500/20 text-red-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
                    ].join(' ')}
                  >
                    Nuzlocke: {instance.isNuzlockeMode ? 'ON' : 'OFF'}
                  </button>
                  {active ? (
                    <span className="text-emerald-400">Active</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setActiveGameInstance(instance.game_instance_id)}
                      className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                    >
                      Switch
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <p className="mb-2 font-retro text-[9px] text-slate-200">New Save</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newTitleId}
            onChange={(e) => setNewTitleId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
          >
            {(titles ?? []).map((t) => (
              <option key={t.game_title_id} value={t.game_title_id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-slate-400">
            <input
              type="checkbox"
              checked={newNuzlocke}
              onChange={(e) => setNewNuzlocke(e.target.checked)}
              className="accent-red-400"
            />
            Nuzlocke
          </label>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!newTitleId}
            className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
