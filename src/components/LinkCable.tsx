import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useWebRTC, type LinkCableStatus } from '../hooks/useWebRTC';

const STATUS_LABEL: Record<LinkCableStatus, string> = {
  idle: 'Starting…',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

const STATUS_COLOR: Record<LinkCableStatus, string> = {
  idle: 'text-slate-400',
  connecting: 'text-amber-300',
  connected: 'text-emerald-400',
  disconnected: 'text-slate-400',
  error: 'text-red-400',
};

export function LinkCable() {
  const { peerId, status, messages, errorMessage, connect, sendMessage, disconnect } = useWebRTC();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [remoteId, setRemoteId] = useState('');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!peerId) return;
    QRCode.toDataURL(peerId, { margin: 1, width: 128 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [peerId]);

  const connected = status === 'connected';

  return (
    <div className="flex h-full flex-col gap-3 text-xs">
      <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <div>
          <p className="text-[10px] text-slate-500">Your Link ID</p>
          <p className="font-mono text-slate-200">{peerId ?? '…'}</p>
          <p className={`mt-1 font-retro text-[9px] ${STATUS_COLOR[status]}`}>
            {status === 'idle' && peerId ? 'Ready' : STATUS_LABEL[status]}
          </p>
        </div>
        {qrDataUrl && (
          <img src={qrDataUrl} alt="Pairing QR code" className="h-16 w-16 rounded bg-white p-1" />
        )}
      </div>

      {!connected && (
        <div className="flex gap-2">
          <input
            value={remoteId}
            onChange={(e) => setRemoteId(e.target.value)}
            placeholder="Paste peer's Link ID"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={() => connect(remoteId)}
            className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30"
          >
            Connect
          </button>
        </div>
      )}

      {errorMessage && <p className="text-red-400">{errorMessage}</p>}

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800/40">
        <div className="flex-1 overflow-y-auto p-2">
          {messages.length === 0 && (
            <p className="p-2 text-center text-slate-500">
              {connected ? 'Say hello — nothing here is saved.' : 'Connect to a peer to chat.'}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {messages.map((m) => (
              <li
                key={m.id}
                className={m.from === 'me' ? 'self-end text-right' : 'self-start text-left'}
              >
                <span
                  className={`inline-block rounded-md px-2 py-1 ${
                    m.from === 'me' ? 'bg-cyan-500/20 text-cyan-100' : 'bg-slate-700/60 text-slate-100'
                  }`}
                >
                  {m.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 border-t border-slate-700 p-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                sendMessage(draft);
                setDraft('');
              }
            }}
            disabled={!connected}
            placeholder={connected ? 'Message…' : 'Not connected'}
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!connected || !draft.trim()}
            onClick={() => {
              sendMessage(draft);
              setDraft('');
            }}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-700/60 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>

      {connected && (
        <button
          type="button"
          onClick={disconnect}
          className="self-start rounded-md border border-red-500/40 px-3 py-1 text-red-300 hover:bg-red-500/10"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
