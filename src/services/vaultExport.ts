import { db, type GameTitle, type GameInstance, type TrainerProfile, type VaultEntry, type MapProgress } from '../db/schema';

export const BACKUP_VERSION = 1;

export interface CodexBackup {
  version: typeof BACKUP_VERSION;
  exported_at: string;
  data: {
    game_titles: GameTitle[];
    game_instances: GameInstance[];
    trainer_profile: TrainerProfile[];
    vault: VaultEntry[];
    map_progress: MapProgress[];
  };
}

/** Serializes the entire local Vault into one portable snapshot (PRD 15.1, 16). */
export async function exportVault(): Promise<CodexBackup> {
  const [game_titles, game_instances, trainer_profile, vault, map_progress] = await Promise.all([
    db.game_titles.toArray(),
    db.game_instances.toArray(),
    db.trainer_profile.toArray(),
    db.vault.toArray(),
    db.map_progress.toArray(),
  ]);
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: { game_titles, game_instances, trainer_profile, vault, map_progress },
  };
}

export function downloadVaultBackup(backup: CodexBackup, filename = 'co-dex-backup.codex') {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Replaces all local Vault data with the given snapshot. This is a full
 * overwrite — the Session Version History (PRD 14.3) is the intended undo
 * path for imports, but isn't built yet, so as a stopgap this auto-downloads
 * a safety snapshot of the current state before overwriting anything.
 */
export async function importVault(json: string): Promise<void> {
  const parsed = JSON.parse(json) as CodexBackup;
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${parsed.version}`);
  }

  const safetySnapshot = await exportVault();
  downloadVaultBackup(safetySnapshot, 'co-dex-pre-import-safety-backup.codex');

  await db.transaction(
    'rw',
    [db.game_titles, db.game_instances, db.trainer_profile, db.vault, db.map_progress],
    async () => {
      await Promise.all([
        db.game_titles.clear(),
        db.game_instances.clear(),
        db.trainer_profile.clear(),
        db.vault.clear(),
        db.map_progress.clear(),
      ]);
      await Promise.all([
        db.game_titles.bulkAdd(parsed.data.game_titles),
        db.game_instances.bulkAdd(parsed.data.game_instances),
        db.trainer_profile.bulkAdd(parsed.data.trainer_profile),
        db.vault.bulkAdd(parsed.data.vault),
        db.map_progress.bulkAdd(parsed.data.map_progress),
      ]);
    },
  );
}
