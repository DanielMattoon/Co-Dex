import { useRef, useState } from 'react';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { downloadVaultBackup, exportVault, importVault } from '../services/vaultExport';
import { exportVaultCsv, exportVaultJson } from '../services/vaultTable';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel';
import { GameSavesPanel } from '../components/GameSavesPanel';
import { SmartMapImporter } from '../components/SmartMapImporter';

type Tab = 'backup' | 'history' | 'saves' | 'import';

function BackupTab() {
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
      setLocalMessage('Restored from file. Undo this from the History tab if needed.');
    } catch (e) {
      setLocalMessage(e instanceof Error ? e.message : 'Import failed');
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
        <h2 className="mb-2 font-retro text-[9px] text-slate-200">Open-Gate Export</h2>
        <p className="mb-3 text-slate-400">A clean, structured export of just the Vault, for your own spreadsheets/tools.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportVaultJson()}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700/60"
          >
            Export Vault (JSON)
          </button>
          <button
            type="button"
            onClick={() => void exportVaultCsv()}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700/60"
          >
            Export Vault (CSV)
          </button>
        </div>
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

const TABS: { id: Tab; label: string }[] = [
  { id: 'backup', label: 'Backup' },
  { id: 'history', label: 'History' },
  { id: 'saves', label: 'Saves' },
  { id: 'import', label: 'Smart Import' },
];

export function BackupScreen() {
  const [tab, setTab] = useState<Tab>('backup');

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'rounded-md border px-2.5 py-1 text-[10px]',
              tab === t.id
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'backup' && <BackupTab />}
        {tab === 'history' && <VersionHistoryPanel />}
        {tab === 'saves' && <GameSavesPanel />}
        {tab === 'import' && <SmartMapImporter />}
      </div>
    </div>
  );
}
