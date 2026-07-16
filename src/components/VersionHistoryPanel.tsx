import { useEffect, useState } from 'react';
import type { VersionHistoryEntry } from '../db/schema';
import { listHistory, restoreSnapshot } from '../services/versionHistory';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Version History / Undo (PRD 14.3) — the app's only "undo" mechanism,
 * standing in for any lockout/PIN screen (PRD 2.2). Every mutating action
 * records a pre-action snapshot here; restoring one rolls the entire local
 * database back to that exact moment.
 */
export function VersionHistoryPanel() {
  const [entries, setEntries] = useState<VersionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setEntries(await listHistory());
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleRestore(entry: VersionHistoryEntry) {
    if (entry.id === undefined) return;
    setMessage(null);
    try {
      await restoreSnapshot(entry.id);
      setMessage(`Restored to before: ${entry.summary}`);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Restore failed');
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <p className="text-slate-400">
        Every action here can be undone — pick a point and restore to right before it happened.
      </p>
      {message && <p className="text-emerald-400">{message}</p>}
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        {loading && <p className="text-slate-500">Loading…</p>}
        {!loading && entries.length === 0 && <p className="text-slate-500">No actions recorded yet.</p>}
        <ul className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-900/60 p-2"
            >
              <div>
                <p className="text-slate-200">{entry.summary}</p>
                <p className="text-slate-500">{formatTimestamp(entry.timestamp)}</p>
              </div>
              {entry.compacted ? (
                <span className="shrink-0 text-slate-500">archived</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleRestore(entry)}
                  className="shrink-0 rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                >
                  Undo to here
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
