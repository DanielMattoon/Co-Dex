import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';

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

// --- Box labels (PRD 6.1 — "Custom names are always allowed") ---

function boxLabelId(gameInstanceId: string, boxNumber: number): string {
  return `${gameInstanceId}_${boxNumber}`;
}

export async function getBoxLabels(gameInstanceId: string): Promise<Map<number, string>> {
  const rows = await db.box_labels.where('game_instance_id').equals(gameInstanceId).toArray();
  return new Map(rows.map((r) => [r.box_number, r.name]));
}

export async function setBoxLabel(gameInstanceId: string, boxNumber: number, name: string): Promise<void> {
  await recordSnapshot('box_rename', `Box ${boxNumber} renamed to "${name}"`);
  await db.box_labels.put({ id: boxLabelId(gameInstanceId, boxNumber), game_instance_id: gameInstanceId, box_number: boxNumber, name });
}

// --- Box deletion (PRD 6.2 — migrate to overflow, or confirm permanent deletion) ---

export interface DeleteBoxResult {
  migratedCount: number;
  deletedCount: number;
}

/**
 * Deletes a box. `mode: 'migrate'` moves its occupants to the first open
 * slots elsewhere (never destroying specimens); `mode: 'delete'` removes
 * them permanently — always preceded by a Version History snapshot (PRD
 * 14.3) so even a permanent delete has a one-click undo.
 */
export async function deleteBox(
  gameInstanceId: string,
  boxNumber: number,
  boxSize: number,
  mode: 'migrate' | 'delete',
): Promise<DeleteBoxResult> {
  const entries = await db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray();
  const inBox = entries.filter((e) => {
    if (e.box_index === GRAVEYARD_BOX_INDEX) return false;
    return globalIndexToBox(e.box_index, boxSize).boxNumber === boxNumber;
  });

  if (inBox.length === 0) {
    await recordSnapshot('box_delete', `Deleted empty Box ${boxNumber}`);
    await db.box_labels.delete(boxLabelId(gameInstanceId, boxNumber));
    return { migratedCount: 0, deletedCount: 0 };
  }

  if (mode === 'delete') {
    await recordSnapshot('box_delete', `Permanently deleted Box ${boxNumber} (${inBox.length} specimens)`);
    await db.transaction('rw', db.vault, db.box_labels, async () => {
      await db.vault.bulkDelete(inBox.map((e) => e.uuid));
      await db.box_labels.delete(boxLabelId(gameInstanceId, boxNumber));
    });
    return { migratedCount: 0, deletedCount: inBox.length };
  }

  await recordSnapshot('box_delete', `Migrated Box ${boxNumber} (${inBox.length} specimens) to overflow`);
  await db.transaction('rw', db.vault, db.box_labels, async () => {
    for (const entry of inBox) {
      const nextIndex = await getNextBoxIndex(gameInstanceId);
      await db.vault.update(entry.uuid, { box_index: nextIndex });
    }
    await db.box_labels.delete(boxLabelId(gameInstanceId, boxNumber));
  });
  return { migratedCount: inBox.length, deletedCount: 0 };
}

// --- Custom sort order (PRD 6.3's floating-point Relative Priority Index) ---

/**
 * Moves a specimen up/down within a Custom-View-ordered list by setting its
 * sort_priority to the midpoint of its new neighbors — the same technique
 * PRD 6.3 describes (insert at 2.5 between 2.0 and 3.0), which keeps reorders
 * O(1) instead of renumbering the whole box on every drag.
 */
export async function moveInCustomOrder(sortedUuids: string[], uuid: string, direction: 'up' | 'down'): Promise<void> {
  const index = sortedUuids.indexOf(uuid);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= sortedUuids.length) return;

  const entries = await db.vault.bulkGet(sortedUuids);
  const priorities = entries.map((e) => e?.sort_priority ?? 0);

  const beforeIndex = direction === 'up' ? targetIndex - 1 : targetIndex;
  const afterIndex = direction === 'up' ? targetIndex : targetIndex + 1;
  const before = beforeIndex >= 0 ? priorities[beforeIndex] : priorities[targetIndex] - 1;
  const after = afterIndex < priorities.length ? priorities[afterIndex] : priorities[targetIndex] + 1;

  await recordSnapshot('reorder', 'Reordered a specimen in Custom View');
  await db.vault.update(uuid, { sort_priority: (before + after) / 2 });
}
