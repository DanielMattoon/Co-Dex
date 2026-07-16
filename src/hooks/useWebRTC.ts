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
 * connect). Backs Device Sync and Ephemeral Chat (PRD 13.1, 13.4).
 *
 * Messages are held in memory only and wiped on disconnect (PRD 13.4) —
 * nothing here ever touches an external server or persists to Dexie.
 */
export function useWebRTC() {
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

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

  const disconnect = useCallback(() => {
    connRef.current?.close();
    connRef.current = null;
    setStatus('disconnected');
    setMessages([]);
  }, []);

  return { peerId, status, messages, errorMessage, connect, sendMessage, disconnect };
}
