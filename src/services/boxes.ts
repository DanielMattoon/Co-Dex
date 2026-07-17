import { db } from '../db/schema';

/** Reserved box_index for fainted Nuzlocke specimens — a locked Graveyard box (PRD 10). */
export const GRAVEYARD_BOX_INDEX = -1;

/**
 * PC Box grid geometry helpers (PRD 6.1). box_index on a VaultEntry is a
 * flat, global slot number across every box; boxNumber/localSlot are the
 * PC-screen-facing coordinates derived from it and the game's slots-per-box.
 */
export function globalIndexToBox(globalIndex: number, boxSize: number): { boxNumber: number; localSlot: number } {
  return { boxNumber: Math.floor(globalIndex / boxSize) + 1, localSlot: globalIndex % boxSize };
}

export function boxToGlobalIndex(boxNumber: number, localSlot: number, boxSize: number): number {
  return (boxNumber - 1) * boxSize + localSlot;
}

/** First unoccupied global slot for a save, so new catches land in order instead of overwriting slot 0. */
export async function getNextBoxIndex(gameInstanceId: string): Promise<number> {
  const entries = await db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray();
  const occupied = new Set(entries.filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX).map((e) => e.box_index));
  let index = 0;
  while (occupied.has(index)) index++;
  return index;
}
