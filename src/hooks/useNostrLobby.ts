import { useCallback, useEffect, useRef, useState } from 'react';
import { SimplePool, finalizeEvent, generateSecretKey, type Event as NostrEvent } from 'nostr-tools';

/**
 * Serverless Matchmaking / The Lobby (PRD 13.3) — decentralized signaling
 * over public, free Nostr relays used as a disposable bulletin board.
 * Nothing here is a Co-Dex server: relays are third-party public
 * infrastructure, and lobby posts use an ephemeral event kind (20000-29999
 * per the Nostr spec) that relays don't persist, matching the "disposable"
 * framing in the PRD. The actual battle connection is still plain WebRTC
 * (useWebRTC) — Nostr only helps two strangers find each other's Peer ID.
 */
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];
const LOBBY_KIND = 29005;
const LOBBY_TAG = 'codex-lobby';
const OFFER_MAX_AGE_SECONDS = 5 * 60;

export interface LobbyOffer {
  peerId: string;
  format: string;
  timestamp: number;
}

export function useNostrLobby() {
  const poolRef = useRef<SimplePool | null>(null);
  const secretKeyRef = useRef<Uint8Array | null>(null);
  const subCloserRef = useRef<{ close: () => void } | null>(null);

  const [offers, setOffers] = useState<LobbyOffer[]>([]);
  const [hosting, setHosting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    poolRef.current = new SimplePool();
    secretKeyRef.current = generateSecretKey();
    return () => {
      subCloserRef.current?.close();
      poolRef.current?.destroy();
    };
  }, []);

  const hostBattle = useCallback(async (peerId: string, format: string) => {
    if (!poolRef.current || !secretKeyRef.current) return;
    setError(null);
    try {
      const event: NostrEvent = finalizeEvent(
        {
          kind: LOBBY_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['t', LOBBY_TAG]],
          content: JSON.stringify({ type: 'CODEX_LOBBY_OFFER', peerId, format, timestamp: Date.now() }),
        },
        secretKeyRef.current,
      );
      // publish() returns one promise per relay — only report "hosting" once
      // at least one relay actually accepted the event, instead of assuming
      // success the instant the publish call is fired off.
      await Promise.any(poolRef.current.publish(RELAYS, event));
      setHosting(true);
    } catch {
      setError('Could not reach any relay to host the lobby — check your connection and try again.');
    }
  }, []);

  const stopHosting = useCallback(() => setHosting(false), []);

  const findBattles = useCallback(() => {
    if (!poolRef.current) return;
    subCloserRef.current?.close();
    setOffers([]);
    setFinding(true);
    setError(null);

    const since = Math.floor(Date.now() / 1000) - OFFER_MAX_AGE_SECONDS;
    subCloserRef.current = poolRef.current.subscribeMany(
      RELAYS,
      { kinds: [LOBBY_KIND], '#t': [LOBBY_TAG], since },
      {
        onevent(event) {
          try {
            const payload = JSON.parse(event.content) as { type: string; peerId: string; format: string; timestamp: number };
            if (payload.type !== 'CODEX_LOBBY_OFFER') return;
            setOffers((prev) => {
              if (prev.some((o) => o.peerId === payload.peerId)) return prev;
              return [...prev, { peerId: payload.peerId, format: payload.format, timestamp: payload.timestamp }];
            });
          } catch {
            // Not a Co-Dex lobby payload — ignore.
          }
        },
      },
    );
  }, []);

  const stopFinding = useCallback(() => {
    subCloserRef.current?.close();
    subCloserRef.current = null;
    setFinding(false);
    setOffers([]);
  }, []);

  return { hosting, finding, offers, error, hostBattle, stopHosting, findBattles, stopFinding };
}
