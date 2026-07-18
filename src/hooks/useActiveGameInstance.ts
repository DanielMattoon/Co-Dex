import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { getActiveGameInstanceId } from '../services/gameInstances';

const TRAINER_PROFILE_ID = 'default';

/**
 * The current save file (PRD 5's game_instance_id). Bootstraps a first save
 * on first run so every screen has somewhere to write, then tracks whichever
 * instance trainer_profile.active_game_instance_id points at — reactive, so
 * switching saves in the Saves panel updates every screen immediately.
 */
export function useActiveGameInstance() {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    setBootstrapError(null);
    getActiveGameInstanceId()
      .then(() => setBootstrapped(true))
      .catch((e) => {
        // Previously this just logged and left `ready` permanently false
        // with no way to recover short of a full reload. Surfacing the
        // error and exposing `retry` lets a screen offer a real recovery
        // path for a transient Dexie failure (quota, blocked upgrade,
        // private-browsing storage restrictions).
        console.error('[useActiveGameInstance] bootstrap failed', e);
        setBootstrapError(e instanceof Error ? e.message : 'Failed to load your save data.');
      });
  }, [retryToken]);

  const profile = useLiveQuery(() => db.trainer_profile.get(TRAINER_PROFILE_ID), [bootstrapped]);
  const gameInstanceId = profile?.active_game_instance_id ?? null;
  const gameInstance = useLiveQuery(
    () => (gameInstanceId ? db.game_instances.get(gameInstanceId) : undefined),
    [gameInstanceId],
  );

  return {
    gameInstanceId,
    gameInstance,
    isNuzlockeMode: gameInstance?.isNuzlockeMode ?? false,
    ready: bootstrapped && Boolean(gameInstanceId),
    bootstrapError,
    retry: () => setRetryToken((t) => t + 1),
  };
}
