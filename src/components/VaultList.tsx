import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type VaultEntry } from '../db/schema';
import {
  DEFAULT_GAME_INSTANCE_ID,
  GRAVEYARD_BOX_INDEX,
  ensureDefaultGameInstance,
  markFainted,
  setNuzlockeMode,
} from '../services/nuzlocke';

function VaultRow({ entry, nuzlocke }: { entry: VaultEntry; nuzlocke: boolean }) {
  async function toggleBreedingLock() {
    await db.vault.update(entry.uuid, {
      breeding_project_lock: {
        is_locked: !entry.breeding_project_lock?.is_locked,
        notes: entry.breeding_project_lock?.notes ?? null,
      },
    });
  }

  const locked = entry.breeding_project_lock?.is_locked ?? false;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex items-center justify-between">
        <span className="text-slate-200">
          {entry.species} <span className="text-slate-500">Lv. {entry.level}</span>
        </span>
        {locked && <span className="text-[10px] text-amber-300">Breeding Lock</span>}
      </div>
      {entry.catchLocation && <p className="text-[10px] text-slate-500">Caught: {entry.catchLocation}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleBreedingLock}
          className={[
            'rounded border px-2 py-0.5 text-[10px]',
            locked
              ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
          ].join(' ')}
        >
          {locked ? 'Unlock breeding' : 'Lock for breeding'}
        </button>
        {nuzlocke && !entry.dead && (
          <button
            type="button"
            onClick={() => void markFainted(entry.uuid)}
            className="rounded border border-red-500/40 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10"
          >
            Mark fainted
          </button>
        )}
      </div>
    </li>
  );
}

/** PC Box / Vault list, with Nuzlocke enforcement (PRD 10) and Breeding Project Lock (PRD 8.4). */
export function VaultList() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureDefaultGameInstance().then(() => setReady(true));
  }, []);

  const gameInstance = useLiveQuery(() => db.game_instances.get(DEFAULT_GAME_INSTANCE_ID), [ready]);
  const nuzlocke = gameInstance?.isNuzlockeMode ?? false;

  const entries = useLiveQuery(
    () => db.vault.where('current_game_instance_id').equals(DEFAULT_GAME_INSTANCE_ID).toArray(),
    [ready],
  );
  const active = (entries ?? []).filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX);
  const graveyard = (entries ?? []).filter((e) => e.box_index === GRAVEYARD_BOX_INDEX);

  async function toggleNuzlocke() {
    await setNuzlockeMode(DEFAULT_GAME_INSTANCE_ID, !nuzlocke);
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <button
        type="button"
        onClick={() => void toggleNuzlocke()}
        className={[
          'self-start rounded-md border px-2.5 py-1 text-[10px]',
          nuzlocke
            ? 'border-red-500/50 bg-red-500/20 text-red-300'
            : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
        ].join(' ')}
      >
        Nuzlocke Mode: {nuzlocke ? 'ON' : 'OFF'}
      </button>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-1 font-retro text-[9px] text-slate-300">Box ({active.length})</p>
        {active.length === 0 && (
          <p className="text-slate-500">Nothing caught yet — visit the Map to catch your first wild encounter.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {active.map((entry) => (
            <VaultRow key={entry.uuid} entry={entry} nuzlocke={nuzlocke} />
          ))}
        </ul>

        {graveyard.length > 0 && (
          <>
            <p className="mb-1 mt-3 font-retro text-[9px] text-red-400">Graveyard ({graveyard.length})</p>
            <ul className="flex flex-col gap-1.5">
              {graveyard.map((entry) => (
                <li key={entry.uuid} className="rounded-md border border-red-900/40 bg-red-950/20 p-2 opacity-70">
                  <span className="text-slate-300">
                    {entry.species} <span className="text-slate-500">Lv. {entry.level}</span>
                  </span>
                  <p className="text-[10px] text-red-400">Fainted</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
