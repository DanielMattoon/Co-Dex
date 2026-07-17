import { db, type VaultEntry } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { getNextBoxIndex } from './boxes';

export interface TradeOfferSummary {
  uuid: string;
  species: string;
  level: number;
  pokemonId: number;
  shiny: boolean;
}

export type TradeMessage =
  | { type: 'trade_offer'; offer: TradeOfferSummary }
  | { type: 'trade_withdraw' }
  | { type: 'trade_confirm' }
  | { type: 'trade_cancel' }
  | { type: 'trade_execute'; entry: VaultEntry };

export function isTradeMessage(data: unknown): data is TradeMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string' &&
    (data as { type: string }).type.startsWith('trade_');
}

export function summarizeForOffer(entry: VaultEntry): TradeOfferSummary {
  return { uuid: entry.uuid, species: entry.species, level: entry.level, pokemonId: entry.pokemon_id, shiny: entry.shiny };
}

/**
 * Direct P2P Trading (PRD 13.2) — executes one side of a confirmed trade.
 * Removes the specimen given away from the local Vault and inserts the one
 * received, rewriting current_game_instance_id/box placement and logging
 * the trade partner to history_log. Called independently on both peers once
 * each has received the other's trade_execute payload; there's no shared
 * authority to referee the swap since this is peer-to-peer with no server,
 * so both sides just need to agree to send before either commits (handled
 * by the confirm/confirm handshake in TradePanel, not here).
 */
export async function executeTradeSwap(
  givenAwayUuid: string,
  receivedEntry: VaultEntry,
  myGameInstanceId: string,
): Promise<void> {
  await recordSnapshot('trade', `Traded away a specimen, received ${receivedEntry.species}`);

  await db.vault.delete(givenAwayUuid);

  const boxIndex = await getNextBoxIndex(myGameInstanceId);
  const now = new Date().toISOString();
  await db.vault.put({
    ...receivedEntry,
    current_game_instance_id: myGameInstanceId,
    box_index: boxIndex,
    history_log: [
      ...receivedEntry.history_log,
      { timestamp: now, action: 'traded', details: 'Received via Link Cable trade.' },
    ],
  });
}
