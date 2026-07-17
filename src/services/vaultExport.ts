import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';

export const BACKUP_VERSION = 4;

export interface CodexBackup {
  version: typeof BACKUP_VERSION;
  exported_at: string;
  /** Every table keyed by name — generic so new tables are covered automatically. */
  data: Record<string, unknown[]>;
}

function backupableTables() {
  return db.tables.filter((t) => t.name !== 'version_history');
}

/** Serializes the entire local Vault into one portable snapshot (PRD 15.1, 16). */
export async function exportVault(): Promise<CodexBackup> {
  const tables = backupableTables();
  const rows = await Promise.all(tables.map((t) => t.toArray()));
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: Object.fromEntries(tables.map((t, i) => [t.name, rows[i]])),
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
 * Replaces all local Vault data with the given snapshot. Full overwrites
 * like this are exactly what Version History (PRD 14.3) exists for — a
 * pre-import snapshot is recorded so the import can be undone from the
 * History panel, same as any other mutating action.
 */
export async function importVault(json: string): Promise<void> {
  const parsed = JSON.parse(json) as CodexBackup;
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${parsed.version}`);
  }

  await recordSnapshot('import', 'Vault restored from a .codex file');

  const tables = backupableTables();
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await Promise.all(tables.map((t) => (parsed.data[t.name] ? t.bulkAdd(parsed.data[t.name]) : Promise.resolve())));
  });
}
