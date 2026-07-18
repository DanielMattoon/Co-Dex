import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { GRAVEYARD_BOX_INDEX } from '../services/boxes';
import { setNuzlockeMode, declareVictory } from '../services/nuzlocke';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { BoxGrid } from './BoxGrid';
import { LivingDexList } from './LivingDexList';
import { QueryBar } from './QueryBar';
import { getSpriteUrl } from '../services/pokeapi';
import { getCatchNextTarget, type CatchNextTarget } from '../services/catchNext';
import { parseQuery, matchesQuery } from '../services/queryGrammar';
import { resolveOriginTitles } from '../services/originBadges';

type ViewMode = 'box' | 'list';

/** PC Box / Vault (PRD 6), with Nuzlocke enforcement (PRD 10) and Breeding Project Lock (PRD 8.4). */
export function VaultList() {
  const { gameInstanceId, gameInstance, isNuzlockeMode: nuzlocke, ready, bootstrapError, retry } = useActiveGameInstance();
  const gameTitle = useLiveQuery(
    () => (gameInstance ? db.game_titles.get(gameInstance.game_title_id) : undefined),
    [gameInstance],
  );

  const entries = useLiveQuery(
    () => (gameInstanceId ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray() : []),
    [gameInstanceId],
  );
  const allActive = (entries ?? []).filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX);
  const graveyard = (entries ?? []).filter((e) => e.box_index === GRAVEYARD_BOX_INDEX);
  const caughtIds = new Set(allActive.map((e) => e.pokemon_id));

  const [viewMode, setViewMode] = useState<ViewMode>('box');
  const [catchNext, setCatchNext] = useState<CatchNextTarget | null | undefined>(undefined);
  const [confirmingVictory, setConfirmingVictory] = useState(false);
  const [query, setQuery] = useState('');
  const [originTitles, setOriginTitles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    // Depend on `entries` (the useLiveQuery reference, stable unless Dexie
    // detects a real change) rather than allActive.length — a length-only
    // dependency misses same-count changes like a trade rewriting a
    // specimen's origin_game_instance_id, leaving `from:` searches stale.
    resolveOriginTitles(allActive).then(setOriginTitles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const active = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return allActive;
    const parsed = parseQuery(trimmed);
    return allActive.filter((e) => matchesQuery(e, parsed, { originTitleByInstanceId: originTitles }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allActive, query, originTitles]);

  async function toggleNuzlocke() {
    if (!gameInstanceId) return;
    await setNuzlockeMode(gameInstanceId, !nuzlocke);
  }

  async function handleDeclareVictory() {
    if (!gameInstanceId) return;
    await declareVictory(gameInstanceId);
    setConfirmingVictory(false);
  }

  function rollCatchNext() {
    setCatchNext(getCatchNextTarget(caughtIds));
  }

  if (bootstrapError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs">
        <p className="text-red-400">Couldn't load your save data: {bootstrapError}</p>
        <button type="button" onClick={retry} className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300">
          Try again
        </button>
      </div>
    );
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

      {nuzlocke && !gameInstance?.is_victory && !confirmingVictory && (
        <button
          type="button"
          onClick={() => setConfirmingVictory(true)}
          className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-left text-amber-300 hover:bg-amber-500/20"
        >
          🏆 Declare Victory
        </button>
      )}
      {confirmingVictory && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-amber-300">
          <span className="flex-1">Declare this run a victory? Unlocks the Nuzlocke Champion badge.</span>
          <button type="button" onClick={() => void handleDeclareVictory()} className="rounded border border-amber-400 px-2 py-0.5 hover:bg-amber-500/20">
            Confirm
          </button>
          <button type="button" onClick={() => setConfirmingVictory(false)} className="rounded border border-slate-600 px-2 py-0.5 text-slate-400 hover:bg-slate-800">
            Cancel
          </button>
        </div>
      )}
      {gameInstance?.is_victory && <p className="text-amber-300">🏆 Nuzlocke Champion — this run is won!</p>}

      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {(['box', 'list'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={[
                'rounded border px-2 py-0.5 text-[10px] capitalize',
                viewMode === mode
                  ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
              ].join(' ')}
            >
              {mode === 'box' ? 'Box' : 'Living Dex'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={rollCatchNext}
          className="ml-auto rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10"
        >
          Catch Next?
        </button>
      </div>

      <QueryBar value={query} onChange={setQuery} />
      {query.trim() && <p className="text-slate-500">{active.length} match{active.length === 1 ? '' : 'es'}</p>}

      {catchNext !== undefined && (
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-2">
          {catchNext ? (
            <p className="text-emerald-300">
              Try <span className="text-slate-100">{catchNext.species}</span> — {catchNext.rate}% on {catchNext.routeName}
              . Check the Map.
            </p>
          ) : (
            <p className="text-slate-400">No uncaught species found in known routes right now.</p>
          )}
        </div>
      )}

      {allActive.length === 0 && graveyard.length === 0 && (
        <p className="text-slate-500">Nothing caught yet — visit the Map to catch your first wild encounter.</p>
      )}

      {gameInstanceId && viewMode === 'box' && (
        <BoxGrid
          entries={active}
          boxSize={gameTitle?.boxes_slots ?? 30}
          boxCount={gameTitle?.box_count ?? 14}
          nuzlocke={nuzlocke}
          gameInstanceId={gameInstanceId}
        />
      )}
      {viewMode === 'list' && <LivingDexList entries={active} nuzlocke={nuzlocke} />}

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
