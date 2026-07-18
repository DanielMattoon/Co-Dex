import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { createGameInstance, setActiveGameInstance } from '../services/gameInstances';
import { setNuzlockeMode } from '../services/nuzlocke';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { useClickOutside } from '../hooks/useClickOutside';

/**
 * A global, always-reachable Dex picker. A "Dex" (game_instance under the
 * hood) isn't a gatekeeping save-file concept — it's just "which game's
 * species/moves/map/team am I looking at right now," so creating one is a
 * first-class action here, not something buried in Backup → Saves. Also
 * carries the Nuzlocke Mode toggle: it's a per-Dex game-mode setting, not a
 * Living Dex view/filter, so it lives here next to the Dex itself rather
 * than in Organize.
 */
export function GameSwitcher() {
  const { gameInstanceId, gameInstance, isNuzlockeMode: nuzlocke } = useActiveGameInstance();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitleId, setNewTitleId] = useState('');
  const [newNuzlocke, setNewNuzlocke] = useState(false);

  const instances = useLiveQuery(
    () => db.game_instances.toArray().then((rows) => rows.sort((a, b) => a.created_date.localeCompare(b.created_date))),
    [],
  ) ?? [];
  const titles = useLiveQuery(() => db.game_titles.toArray(), []) ?? [];
  const titleById = new Map(titles.map((t) => [t.game_title_id, t]));
  const activeTitle = gameInstance ? titleById.get(gameInstance.game_title_id) : undefined;

  useClickOutside(open, 'data-game-switcher', () => {
    setOpen(false);
    setCreating(false);
  });

  useEffect(() => {
    if (!newTitleId && titles.length > 0) setNewTitleId(titles[0].game_title_id);
  }, [titles, newTitleId]);

  async function toggleNuzlocke() {
    if (!gameInstanceId) return;
    await setNuzlockeMode(gameInstanceId, !nuzlocke);
  }

  async function handleCreate() {
    if (!newTitleId) return;
    await createGameInstance(newTitleId, newNuzlocke);
    setNewNuzlocke(false);
    setCreating(false);
    setOpen(false);
  }

  return (
    <div className="relative" data-game-switcher>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800/60"
      >
        <span className="text-cyan-300">{activeTitle?.name ?? 'No Dex'}</span>
        {nuzlocke && <span className="rounded bg-red-500/20 px-1 text-red-300">Nuzlocke</span>}
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900/98 p-2 text-xs shadow-2xl">
          {creating ? (
            <div className="mb-2 flex flex-col gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
              <p className="text-[9px] uppercase tracking-wide text-slate-500">New Dex</p>
              <select
                value={newTitleId}
                onChange={(e) => setNewTitleId(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 outline-none focus:border-cyan-400"
              >
                {titles.map((t) => (
                  <option key={t.game_title_id} value={t.game_title_id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-slate-400">
                <input type="checkbox" checked={newNuzlocke} onChange={(e) => setNewNuzlocke(e.target.checked)} className="accent-red-400" />
                Nuzlocke Mode
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={!newTitleId}
                  className="flex-1 rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
                >
                  Create Dex
                </button>
                <button type="button" onClick={() => setCreating(false)} className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mb-2 w-full rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
            >
              + Create a Dex for a game
            </button>
          )}

          <p className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Your Dexes</p>
          <ul className="mb-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {instances.map((instance) => {
              const title = titleById.get(instance.game_title_id);
              const active = instance.game_instance_id === gameInstanceId;
              return (
                <li key={instance.game_instance_id}>
                  <button
                    type="button"
                    disabled={active}
                    onClick={() => {
                      void setActiveGameInstance(instance.game_instance_id);
                      setOpen(false);
                    }}
                    className={[
                      'flex w-full items-center justify-between rounded border px-2 py-1 text-left',
                      active ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800/60',
                    ].join(' ')}
                  >
                    <span>{title?.name ?? instance.game_title_id}</span>
                    {active && <span className="text-[9px] text-emerald-400">Active</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {gameInstanceId && (
            <button
              type="button"
              onClick={() => void toggleNuzlocke()}
              className={[
                'w-full rounded border px-2 py-1 text-left',
                nuzlocke ? 'border-red-500/50 bg-red-500/20 text-red-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
              ].join(' ')}
            >
              Nuzlocke Mode: {nuzlocke ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
