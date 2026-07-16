import { useCallback, useEffect, useState } from 'react';
import { exportVault, importVault } from '../services/vaultExport';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILENAME = 'co-dex-save.json';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

type DriveStatus = 'idle' | 'working' | 'error';

/**
 * Bring-Your-Own-Cloud backup (PRD 16): OAuth2 via Google's client-side
 * Identity Services (no client secret — safe to embed, unlike IGDB's
 * flow which is why it was rejected per PRD 4.1). Writes only to the
 * app's private Drive appDataFolder, never the user's visible Drive.
 */
export function useGoogleDrive() {
  const configured = Boolean(CLIENT_ID);
  const [scriptReady, setScriptReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<DriveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    if (window.google?.accounts?.oauth2) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError('Failed to load Google Identity Services');
    document.head.appendChild(script);
  }, [configured]);

  const signIn = useCallback(() => {
    if (!scriptReady || !CLIENT_ID || !window.google) return;
    setError(null);
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.access_token) setAccessToken(resp.access_token);
        else setError(resp.error ?? 'Sign-in failed');
      },
    });
    tokenClient.requestAccessToken();
  }, [scriptReady]);

  const signOut = useCallback(() => {
    if (accessToken) window.google?.accounts.oauth2.revoke(accessToken, () => {});
    setAccessToken(null);
  }, [accessToken]);

  const findBackupFileId = useCallback(async (): Promise<string | null> => {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${BACKUP_FILENAME}%27&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new Error(`Drive lookup failed (${res.status})`);
    const json = (await res.json()) as { files?: { id: string }[] };
    return json.files?.[0]?.id ?? null;
  }, [accessToken]);

  const backupNow = useCallback(async () => {
    if (!accessToken) return;
    setStatus('working');
    setError(null);
    try {
      const backup = await exportVault();
      const fileId = await findBackupFileId();
      const metadata = fileId ? { name: BACKUP_FILENAME } : { name: BACKUP_FILENAME, parents: ['appDataFolder'] };
      const body = new FormData();
      body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      body.append('file', new Blob([JSON.stringify(backup)], { type: 'application/json' }));

      const url = fileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const res = await fetch(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      if (!res.ok) throw new Error(`Drive upload failed (${res.status})`);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed');
      setStatus('error');
    }
  }, [accessToken, findBackupFileId]);

  const restoreLatest = useCallback(async () => {
    if (!accessToken) return;
    setStatus('working');
    setError(null);
    try {
      const fileId = await findBackupFileId();
      if (!fileId) throw new Error('No cloud backup found yet');
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
      await importVault(await res.text());
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      setStatus('error');
    }
  }, [accessToken, findBackupFileId]);

  return {
    configured,
    ready: scriptReady,
    connected: Boolean(accessToken),
    status,
    error,
    signIn,
    signOut,
    backupNow,
    restoreLatest,
  };
}
