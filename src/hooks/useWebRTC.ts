import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';

export type LinkCableStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ChatMessage {
  id: string;
  from: 'me' | 'peer';
  text: string;
  timestamp: number;
}

/**
 * Serverless P2P connection over WebRTC via PeerJS's free public broker
 * (only used for signaling/handshake — all data flows peer-to-peer after
 * connect). Backs Device Sync, Ephemeral Chat, and Direct P2P Trading
 * (PRD 13.1, 13.2, 13.4).
 *
 * Chat messages are held in memory only and wiped on disconnect (PRD
 * 13.4) — nothing here ever touches an external server or persists to
 * Dexie. Structured (non-string) payloads are routed to onData instead of
 * the chat log — that's how trade protocol messages ride the same
 * connection without polluting the chat transcript. onData is called via a
 * ref so callers can pass a closure that always sees fresh state without
 * needing to reattach the connection.
 */
export function useWebRTC(onData?: (data: unknown) => void) {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkCableStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const appendMessage = useCallback((from: ChatMessage['from'], text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, from, text, timestamp: Date.now() },
    ]);
  }, []);

  const attachConnection = useCallback(
    (conn: DataConnection) => {
      connRef.current = conn;
      conn.on('open', () => setStatus('connected'));
      conn.on('data', (data) => {
        if (typeof data === 'string') appendMessage('peer', data);
        else onDataRef.current?.(data);
      });
      conn.on('close', () => {
        setStatus('disconnected');
        setMessages([]);
        connRef.current = null;
      });
      conn.on('error', (err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
    },
    [appendMessage],
  );

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => setPeerId(id));
    peer.on('connection', (conn) => {
      setStatus('connecting');
      attachConnection(conn);
    });
    peer.on('error', (err) => {
      setErrorMessage(err.message);
      setStatus('error');
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
      connRef.current = null;
    };
  }, [attachConnection]);

  const connect = useCallback(
    (remoteId: string) => {
      if (!peerRef.current || !remoteId.trim()) return;
      setStatus('connecting');
      setErrorMessage(null);
      const conn = peerRef.current.connect(remoteId.trim());
      attachConnection(conn);
    },
    [attachConnection],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!connRef.current || !text.trim()) return;
      connRef.current.send(text);
      appendMessage('me', text);
    },
    [appendMessage],
  );

  /** Sends a structured payload (e.g. trade protocol messages) without touching the chat log. */
  const sendData = useCallback((data: unknown) => {
    connRef.current?.send(data);
  }, []);

  const disconnect = useCallback(() => {
    connRef.current?.close();
    connRef.current = null;
    setStatus('disconnected');
    setMessages([]);
  }, []);

  return { peerId, status, messages, errorMessage, connect, sendMessage, sendData, disconnect };
}
