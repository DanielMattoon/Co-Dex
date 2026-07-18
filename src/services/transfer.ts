import { db, type VaultEntry, type GameTitle, HOME_GENERATION } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { getNextBoxIndex, getGeneration } from './boxes';
import { getMoveGenerationMap } from './pokeapi';

export interface LegalityCheck {
  legal: boolean;
  reasons: string[];
}

/**
 * Sandbox Transfer Engine & Legality Enforcer (PRD 5.1). Three concrete,
 * locally-checkable legality rules:
 *  1. Species generation — a Pokémon can't exist in a game released before
 *     its species did.
 *  2. Move generation — every move on record has to have existed by the
 *     target game's generation (its actual introduction generation, from
 *     PokeAPI's /generation resources — exact, not guessed).
 *  3. Pokémon GO origin — a GO-caught specimen can only transfer directly
 *     into a title that accepts GO transfers (Let's Go Pikachu/Eevee,
 *     HOME); everything else needs to go through HOME first, mirroring the
 *     real transfer path.
 * Held-item era legality remains unchecked — PokeAPI doesn't expose a clean
 * per-item introduction generation the way /generation does for moves, so
 * modeling it accurately would mean guessing, which this project avoids.
 */
export async function checkTransferLegality(entry: VaultEntry, targetTitle: GameTitle): Promise<LegalityCheck> {
  const reasons: string[] = [];
  const speciesGen = getGeneration(entry.pokemon_id);
  if (speciesGen > targetTitle.generation) {
    reasons.push(`${entry.species} is a Gen ${speciesGen} species — ${targetTitle.name} (Gen ${targetTitle.generation}) predates it.`);
  }

  if (entry.moves.length > 0 && targetTitle.generation !== HOME_GENERATION) {
    const moveGenerations = await getMoveGenerationMap();
    for (const move of entry.moves) {
      const moveId = move.toLowerCase().replace(/\s+/g, '-');
      const moveGen = moveGenerations.get(moveId);
      // A move absent from every /generation list is a special mechanic
      // (Z-move, Max Move) rather than an ordinary dateable move — treat
      // "unresolved" the same as "too modern" rather than always-legal.
      if (moveGen === undefined || moveGen > targetTitle.generation) {
        reasons.push(`${move} wasn't introduced until Gen ${moveGen ?? '7+'} — ${targetTitle.name} (Gen ${targetTitle.generation}) can't recognize it.`);
      }
    }
  }

  if (entry.origin_pokemon_go && !targetTitle.allows_pokemon_go) {
    reasons.push(`${entry.species} came from Pokémon GO — GO transfers only go directly into Let's Go Pikachu/Eevee or HOME, not ${targetTitle.name}.`);
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
  const check = await checkTransferLegality(entry, targetTitle);

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
