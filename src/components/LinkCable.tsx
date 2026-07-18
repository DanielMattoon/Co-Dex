import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import QRCode from 'qrcode';
import { useWebRTC, type LinkCableStatus } from '../hooks/useWebRTC';
import { useNostrLobby } from '../hooks/useNostrLobby';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { db, type VaultEntry } from '../db/schema';
import { GRAVEYARD_BOX_INDEX } from '../services/boxes';
import { getSpriteUrl } from '../services/pokeapi';
import { KNOWN_FORMATS } from '../services/smogonStats';
import {
  executeTradeSwap,
  isTradeMessage,
  summarizeForOffer,
  type TradeOfferSummary,
} from '../services/tradeExecution';

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
  const { gameInstanceId } = useActiveGameInstance();
  const myEntries = useLiveQuery(
    () =>
      gameInstanceId
        ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray()
        : [],
    [gameInstanceId],
  );
  const myBox = (myEntries ?? []).filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX);

  // --- Direct P2P Trading state (PRD 13.2) ---
  const [myOffer, setMyOffer] = useState<VaultEntry | null>(null);
  const [theirOffer, setTheirOffer] = useState<TradeOfferSummary | null>(null);
  const [myConfirmed, setMyConfirmed] = useState(false);
  const [theirConfirmed, setTheirConfirmed] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'trading' | 'done'>('idle');
  const [showTradePicker, setShowTradePicker] = useState(false);

  function resetTrade() {
    setMyOffer(null);
    setTheirOffer(null);
    setMyConfirmed(false);
    setTheirConfirmed(false);
    setTradeStatus('idle');
  }

  const onTradeData = useCallback(
    (data: unknown) => {
      if (!isTradeMessage(data)) return;
      if (data.type === 'trade_offer') {
        setTheirOffer(data.offer);
        setTradeStatus('trading');
      } else if (data.type === 'trade_withdraw') {
        setTheirOffer(null);
        setTheirConfirmed(false);
      } else if (data.type === 'trade_confirm') {
        setTheirConfirmed(true);
      } else if (data.type === 'trade_cancel') {
        resetTrade();
      } else if (data.type === 'trade_execute' && myOffer && gameInstanceId) {
        void executeTradeSwap(myOffer.uuid, data.entry, gameInstanceId).then(() => {
          setTradeStatus('done');
        });
      }
    },
    [myOffer, gameInstanceId],
  );

  const { peerId, status, messages, errorMessage, connect, sendMessage, sendData, disconnect } =
    useWebRTC(onTradeData);
  const { hosting, finding, offers, error: lobbyError, hostBattle, stopHosting, findBattles, stopFinding } =
    useNostrLobby();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [remoteId, setRemoteId] = useState('');
  const [draft, setDraft] = useState('');
  const [lobbyFormat, setLobbyFormat] = useState<string>(KNOWN_FORMATS[0]);

  useEffect(() => {
    if (!peerId) return;
    QRCode.toDataURL(peerId, { margin: 1, width: 128 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [peerId]);

  // Once both sides have confirmed, each independently sends its own
  // specimen's full data — there's no server to referee the swap, so both
  // peers just need to agree before either commits (handled by requiring
  // both confirm flags before this fires).
  useEffect(() => {
    if (myConfirmed && theirConfirmed && myOffer && tradeStatus === 'trading') {
      sendData({ type: 'trade_execute', entry: myOffer });
    }
  }, [myConfirmed, theirConfirmed, myOffer, tradeStatus, sendData]);

  const connected = status === 'connected';

  function offerSpecimen(entry: VaultEntry) {
    setMyOffer(entry);
    sendData({ type: 'trade_offer', offer: summarizeForOffer(entry) });
    setTradeStatus('trading');
    setShowTradePicker(false);
  }

  function withdrawOffer() {
    setMyOffer(null);
    setMyConfirmed(false);
    sendData({ type: 'trade_withdraw' });
  }

  function confirmTrade() {
    setMyConfirmed(true);
    sendData({ type: 'trade_confirm' });
  }

  function cancelTrade() {
    sendData({ type: 'trade_cancel' });
    resetTrade();
  }

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

      {!connected && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          <p className="mb-2 font-retro text-[9px] text-slate-300">Battle Lobby</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={lobbyFormat}
              onChange={(e) => setLobbyFormat(e.target.value)}
              disabled={hosting || finding}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400 disabled:opacity-50"
            >
              {KNOWN_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {!hosting && !finding && peerId && (
              <>
                <button
                  type="button"
                  onClick={() => void hostBattle(peerId, lobbyFormat)}
                  className="rounded border border-emerald-500/50 bg-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/30"
                >
                  Host Battle
                </button>
                <button
                  type="button"
                  onClick={findBattles}
                  className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                >
                  Find Battle
                </button>
              </>
            )}
            {hosting && (
              <>
                <span className="text-emerald-400">Hosting {lobbyFormat} — waiting for a challenger…</span>
                <button
                  type="button"
                  onClick={stopHosting}
                  className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60"
                >
                  Stop
                </button>
              </>
            )}
            {finding && (
              <button
                type="button"
                onClick={stopFinding}
                className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60"
              >
                Stop searching
              </button>
            )}
          </div>
          {lobbyError && <p className="mt-1 text-red-400">{lobbyError}</p>}
          {finding && (
            <ul className="mt-2 flex flex-col gap-1">
              {offers.length === 0 && <p className="text-slate-500">Scanning the lobby…</p>}
              {offers.map((offer) => (
                <li key={offer.peerId} className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/60 p-1.5">
                  <span className="text-slate-300">{offer.format}</span>
                  <button
                    type="button"
                    onClick={() => {
                      connect(offer.peerId);
                      stopFinding();
                    }}
                    className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-0.5 text-cyan-300 hover:bg-cyan-500/30"
                  >
                    Challenge
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {errorMessage && <p className="text-red-400">{errorMessage}</p>}

      {connected && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          <p className="mb-2 font-retro text-[9px] text-slate-300">Trade</p>

          {tradeStatus === 'done' ? (
            <div className="flex flex-col gap-2">
              <p className="text-emerald-400">Trade complete! Check your Box.</p>
              <button
                type="button"
                onClick={resetTrade}
                className="self-start rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60"
              >
                Start another trade
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                  <p className="mb-1 text-slate-500">You offer</p>
                  {myOffer ? (
                    <div className="flex items-center gap-2">
                      <img src={getSpriteUrl(myOffer.pokemon_id, myOffer.shiny)} alt={myOffer.species} className="h-8 w-8" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-slate-200">{myOffer.species}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTradePicker(true)}
                      className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                    >
                      Pick specimen
                    </button>
                  )}
                </div>
                <div className="rounded border border-slate-700 bg-slate-900/60 p-2">
                  <p className="mb-1 text-slate-500">They offer</p>
                  {theirOffer ? (
                    <div className="flex items-center gap-2">
                      <img src={getSpriteUrl(theirOffer.pokemonId, theirOffer.shiny)} alt={theirOffer.species} className="h-8 w-8" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-slate-200">{theirOffer.species}</span>
                    </div>
                  ) : (
                    <p className="text-slate-600">Waiting…</p>
                  )}
                </div>
              </div>

              {showTradePicker && (
                <div className="max-h-32 overflow-y-auto rounded border border-slate-700 bg-slate-900/80 p-1">
                  {myBox.length === 0 && <p className="p-1 text-slate-500">Nothing in your Box to offer.</p>}
                  <ul className="grid grid-cols-4 gap-1">
                    {myBox.map((entry) => (
                      <li key={entry.uuid}>
                        <button
                          type="button"
                          onClick={() => offerSpecimen(entry)}
                          className="flex w-full flex-col items-center rounded border border-slate-700 p-1 hover:border-cyan-400"
                        >
                          <img src={getSpriteUrl(entry.pokemon_id, entry.shiny)} alt={entry.species} className="h-6 w-6" style={{ imageRendering: 'pixelated' }} />
                          <span className="truncate text-[8px] text-slate-400">{entry.species}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {myOffer && theirOffer && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={confirmTrade}
                    disabled={myConfirmed}
                    className="rounded border border-emerald-500/50 bg-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
                  >
                    {myConfirmed ? 'Confirmed ✓' : 'Confirm trade'}
                  </button>
                  <span className="text-slate-500">{theirConfirmed ? 'They confirmed ✓' : 'Waiting on them…'}</span>
                  <button
                    type="button"
                    onClick={withdrawOffer}
                    className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60"
                  >
                    Withdraw
                  </button>
                </div>
              )}

              {(myOffer || theirOffer) && (
                <button
                  type="button"
                  onClick={cancelTrade}
                  className="self-start text-[10px] text-red-400 hover:text-red-300"
                >
                  Cancel trade
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
          onClick={() => {
            resetTrade();
            disconnect();
          }}
          className="self-start rounded-md border border-red-500/40 px-3 py-1 text-red-300 hover:bg-red-500/10"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
