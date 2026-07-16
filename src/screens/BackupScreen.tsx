import { useRef, useState } from 'react';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { downloadVaultBackup, exportVault, importVault } from '../services/vaultExport';

export function BackupScreen() {
  const drive = useGoogleDrive();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  async function handleExport() {
    const backup = await exportVault();
    downloadVaultBackup(backup);
    setLocalMessage('Downloaded co-dex-backup.codex');
  }

  async function handleImportFile(file: File) {
    try {
      await importVault(await file.text());
      setLocalMessage('Restored from file. A safety backup of the prior state also downloaded.');
    } catch (e) {
      setLocalMessage(e instanceof Error ? e.message : 'Import failed');
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <h2 className="mb-2 font-retro text-[9px] text-slate-200">Local Backup</h2>
        <p className="mb-3 text-slate-400">Always available — no account required.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30"
          >
            Export .codex
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700/60"
          >
            Import .codex
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".codex,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {localMessage && <p className="mt-2 text-slate-400">{localMessage}</p>}
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <h2 className="mb-2 font-retro text-[9px] text-slate-200">Cloud Backup (Bring Your Own Drive)</h2>

        {!drive.configured && (
          <p className="text-slate-500">
            Not configured on this build. Set VITE_GOOGLE_CLIENT_ID to enable — your data goes to
            your own Google Drive app folder, never a Co-Dex server.
          </p>
        )}

        {drive.configured && !drive.connected && (
          <button
            type="button"
            onClick={drive.signIn}
            disabled={!drive.ready}
            className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
          >
            Connect Google Drive
          </button>
        )}

        {drive.configured && drive.connected && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void drive.backupNow()}
              disabled={drive.status === 'working'}
              className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40"
            >
              Back up now
            </button>
            <button
              type="button"
              onClick={() => void drive.restoreLatest()}
              disabled={drive.status === 'working'}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700/60 disabled:opacity-40"
            >
              Restore latest
            </button>
            <button
              type="button"
              onClick={drive.signOut}
              className="rounded-md border border-red-500/40 px-3 py-1.5 text-red-300 hover:bg-red-500/10"
            >
              Disconnect
            </button>
          </div>
        )}

        {drive.status === 'working' && <p className="mt-2 text-amber-300">Working…</p>}
        {drive.error && <p className="mt-2 text-red-400">{drive.error}</p>}
      </section>
    </div>
  );
}
