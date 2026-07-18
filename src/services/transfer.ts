import { db, type VaultEntry, type GameTitle } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { getNextBoxIndex, getGeneration } from './boxes';

export interface LegalityCheck {
  legal: boolean;
  reasons: string[];
}

/**
 * Sandbox Transfer Engine & Legality Enforcer (PRD 5.1). The one concrete,
 * locally-checkable legality rule is species generation: a Pokémon can't
 * exist in a game released before its species did (no moving assets
 * backward in time). Per-move and per-held-item era legality would need a
 * full generation-by-generation movepool/item database this build doesn't
 * have — same category of simplification as the shiny-odds chain methods,
 * flagged rather than guessed at.
 */
export function checkTransferLegality(entry: VaultEntry, targetTitle: GameTitle): LegalityCheck {
  const reasons: string[] = [];
  const speciesGen = getGeneration(entry.pokemon_id);
  if (speciesGen > targetTitle.generation) {
    reasons.push(`${entry.species} is a Gen ${speciesGen} species — ${targetTitle.name} (Gen ${targetTitle.generation}) predates it.`);
  }
  return { legal: reasons.length === 0, reasons };
}

export interface TransferResult {
  ok: boolean;
  error?: string;
  anomalous?: boolean;
}

/**
 * Executes a simulated transfer between game instances (PRD 5.1). Strict
 * Mode (default) hard-blocks an illegal transfer with a clear reason.
 * Sandbox Mode allows it through and triggers the Anomalous State Protocol:
 * the specimen is tagged is_sandbox_anomalous so it's never confused with
 * legitimate progress, and stays that way even if a later transfer would
 * otherwise be legal (a Sandbox-touched specimen's history is what it is).
 */
export async function executeTransfer(
  entry: VaultEntry,
  targetGameInstanceId: string,
  targetTitle: GameTitle,
  mode: 'strict' | 'sandbox',
): Promise<TransferResult> {
  const check = checkTransferLegality(entry, targetTitle);

  if (!check.legal && mode === 'strict') {
    return { ok: false, error: check.reasons.join(' ') };
  }

  const anomalous = !check.legal && mode === 'sandbox';
  const now = new Date().toISOString();

  await recordSnapshot('transfer', `Transferred ${entry.species} to ${targetTitle.name}${anomalous ? ' (Sandbox — flagged anomalous)' : ''}`);

  await db.transaction('rw', db.vault, async () => {
    const boxIndex = await getNextBoxIndex(targetGameInstanceId);
    await db.vault.update(entry.uuid, {
      current_game_instance_id: targetGameInstanceId,
      box_index: boxIndex,
      sort_priority: boxIndex,
      is_sandbox_anomalous: entry.is_sandbox_anomalous || anomalous,
      history_log: [
        ...entry.history_log,
        {
          timestamp: now,
          action: 'transferred',
          details: anomalous
            ? `Simulated transfer to ${targetTitle.name} via Sandbox Mode (${check.reasons.join(' ')})`
            : `Transferred to ${targetTitle.name}.`,
        },
      ],
    });
  });

  return { ok: true, anomalous };
}
