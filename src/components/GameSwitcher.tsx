import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { setActiveGameInstance } from '../services/gameInstances';
import { setNuzlockeMode } from '../services/nuzlocke';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';

/**
 * A global, always-reachable save picker — previously the only way to
 * switch saves was burying it in Backup → Saves, which meant switching
 * mid-browse meant losing your place. Also carries the Nuzlocke Mode
 * toggle: it's a per-save game-mode setting, not a Living Dex view/filter,
 * so it lives here next to the save itself rather than in Organize.
 */
export function GameSwitcher() {
  const { gameInstanceId, gameInstance, isNuzlockeMode: nuzlocke } = useActiveGameInstance();
  const [open, setOpen] = useState(false);

  const instances = useLiveQuery(
    () => db.game_instances.toArray().then((rows) => rows.sort((a, b) => a.created_date.localeCompare(b.created_date))),
    [],
  ) ?? [];
  const titles = useLiveQuery(() => db.game_titles.toArray(), []) ?? [];
  const titleById = new Map(titles.map((t) => [t.game_title_id, t]));
  const activeTitle = gameInstance ? titleById.get(gameInstance.game_title_id) : undefined;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-game-switcher]')) setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function toggleNuzlocke() {
    if (!gameInstanceId) return;
    await setNuzlockeMode(gameInstanceId, !nuzlocke);
  }

  return (
    <div className="relative" data-game-switcher>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800/60"
      >
        <span className="text-cyan-300">{activeTitle?.name ?? 'No save'}</span>
        {nuzlocke && <span className="rounded bg-red-500/20 px-1 text-red-300">Nuzlocke</span>}
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900/98 p-2 text-xs shadow-2xl">
          <p className="mb-1 text-[9px] uppercase tracking-wide text-slate-500">Your Saves</p>
          <ul className="mb-2 flex flex-col gap-1">
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

          <a href="#/backup" onClick={() => setOpen(false)} className="mt-2 block text-center text-slate-500 hover:text-cyan-300">
            Manage saves →
          </a>
        </div>
      )}
    </div>
  );
}
