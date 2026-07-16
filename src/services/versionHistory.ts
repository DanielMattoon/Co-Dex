import { db, type DbSnapshot, type VersionHistoryEntry } from '../db/schema';

const RECENT_WINDOW_COUNT = 50;
const RECENT_WINDOW_DAYS = 30;

async function captureSnapshot(): Promise<DbSnapshot> {
  const [game_titles, game_instances, trainer_profile, vault, map_progress] = await Promise.all([
    db.game_titles.toArray(),
    db.game_instances.toArray(),
    db.trainer_profile.toArray(),
    db.vault.toArray(),
    db.map_progress.toArray(),
  ]);
  return { game_titles, game_instances, trainer_profile, vault, map_progress };
}

/**
 * Records the state immediately *before* a mutating action, so restoring
 * this entry later undoes that specific action (PRD 14.3) — this is the
 * app's only undo mechanism, standing in for any lockout/PIN screen
 * (PRD 2.2). Call this before writing the change it describes.
 */
export async function recordSnapshot(action: string, summary: string): Promise<void> {
  const snapshot = await captureSnapshot();
  await db.version_history.add({
    timestamp: new Date().toISOString(),
    action,
    summary,
    snapshot,
    compacted: false,
  });
  await pruneHistory();
}

/**
 * Pruning policy (PRD 14.3): keep full, revertible detail for whichever is
 * larger — the last 30 days or the last 50 actions — and compact anything
 * older into one per-day summary entry with its snapshot dropped, so
 * IndexedDB storage doesn't grow unbounded while a rough history stays
 * browsable.
 */
async function pruneHistory(): Promise<void> {
  const all = await db.version_history.orderBy('timestamp').reverse().toArray();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_WINDOW_DAYS);

  const keepFullIds = new Set<number>();
  all.forEach((entry, index) => {
    if (entry.id === undefined) return;
    const withinCount = index < RECENT_WINDOW_COUNT;
    const withinDays = new Date(entry.timestamp) >= cutoff;
    if (withinCount || withinDays) keepFullIds.add(entry.id);
  });

  const toCompact = all.filter((e) => e.id !== undefined && !e.compacted && !keepFullIds.has(e.id));
  const byDay = new Map<string, VersionHistoryEntry[]>();
  for (const entry of toCompact) {
    const day = entry.timestamp.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(entry);
    byDay.set(day, list);
  }

  for (const [day, entries] of byDay) {
    await db.version_history.bulkDelete(entries.map((e) => e.id!));
    await db.version_history.add({
      timestamp: `${day}T00:00:00.000Z`,
      action: 'compacted',
      summary: `${entries.length} action${entries.length > 1 ? 's' : ''} on ${day}`,
      snapshot: null,
      compacted: true,
    });
  }
}

export async function listHistory(): Promise<VersionHistoryEntry[]> {
  return db.version_history.orderBy('timestamp').reverse().toArray();
}

/** Restores the full DB to the state captured by this entry (PRD 14.3). */
export async function restoreSnapshot(id: number): Promise<void> {
  const entry = await db.version_history.get(id);
  if (!entry?.snapshot) {
    throw new Error('This entry has been compacted into a daily summary and can no longer be restored.');
  }
  const snap = entry.snapshot;
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
        db.game_titles.bulkAdd(snap.game_titles),
        db.game_instances.bulkAdd(snap.game_instances),
        db.trainer_profile.bulkAdd(snap.trainer_profile),
        db.vault.bulkAdd(snap.vault),
        db.map_progress.bulkAdd(snap.map_progress),
      ]);
    },
  );
}
