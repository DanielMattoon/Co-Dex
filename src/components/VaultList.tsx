import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { GRAVEYARD_BOX_INDEX } from '../services/boxes';
import { setNuzlockeMode } from '../services/nuzlocke';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { BoxGrid } from './BoxGrid';
import { getSpriteUrl } from '../services/pokeapi';

/** PC Box / Vault (PRD 6), with Nuzlocke enforcement (PRD 10) and Breeding Project Lock (PRD 8.4). */
export function VaultList() {
  const { gameInstanceId, gameInstance, isNuzlockeMode: nuzlocke, ready } = useActiveGameInstance();
  const gameTitle = useLiveQuery(
    () => (gameInstance ? db.game_titles.get(gameInstance.game_title_id) : undefined),
    [gameInstance],
  );

  const entries = useLiveQuery(
    () => (gameInstanceId ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray() : []),
    [gameInstanceId],
  );
  const active = (entries ?? []).filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX);
  const graveyard = (entries ?? []).filter((e) => e.box_index === GRAVEYARD_BOX_INDEX);

  async function toggleNuzlocke() {
    if (!gameInstanceId) return;
    await setNuzlockeMode(gameInstanceId, !nuzlocke);
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        {gameTitle && <p className="text-[10px] text-slate-500">Save: {gameTitle.name}</p>}
        <button
          disabled={!ready}
          type="button"
          onClick={() => void toggleNuzlocke()}
          className={[
            'rounded-md border px-2.5 py-1 text-[10px]',
            nuzlocke
              ? 'border-red-500/50 bg-red-500/20 text-red-300'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
          ].join(' ')}
        >
          Nuzlocke Mode: {nuzlocke ? 'ON' : 'OFF'}
        </button>
      </div>

      {active.length === 0 && graveyard.length === 0 && (
        <p className="text-slate-500">Nothing caught yet — visit the Map to catch your first wild encounter.</p>
      )}

      <BoxGrid
        entries={active}
        boxSize={gameTitle?.boxes_slots ?? 30}
        boxCount={gameTitle?.box_count ?? 14}
        nuzlocke={nuzlocke}
      />

      {graveyard.length > 0 && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-2">
          <p className="mb-1 font-retro text-[9px] text-red-400">Graveyard ({graveyard.length})</p>
          <ul className="flex flex-wrap gap-2">
            {graveyard.map((entry) => (
              <li key={entry.uuid} className="flex flex-col items-center opacity-70">
                <img
                  src={getSpriteUrl(entry.pokemon_id, entry.shiny)}
                  alt={entry.species}
                  className="h-8 w-8 grayscale"
                  style={{ imageRendering: 'pixelated' }}
                />
                <span className="text-[9px] text-slate-400">{entry.species}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
