import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';

/** Reserved box_index for fainted Nuzlocke specimens — a locked Graveyard box (PRD 10). */
export const GRAVEYARD_BOX_INDEX = -1;

/** National Dex number ranges per generation, for the "Separate Box" generation-boundary gap (PRD 6.1). */
const GENERATION_RANGES: [number, number][] = [
  [1, 151],
  [152, 251],
  [252, 386],
  [387, 493],
  [494, 649],
  [650, 721],
  [722, 809],
  [810, 905],
  [906, Infinity],
];

export function getGeneration(pokemonId: number): number {
  const index = GENERATION_RANGES.findIndex(([lo, hi]) => pokemonId >= lo && pokemonId <= hi);
  return index === -1 ? GENERATION_RANGES.length : index + 1;
}

// --- Box group labels (PRD 6.1 — "Custom names are always allowed") ---
// Box grouping is now a purely visual chunking of the species grid (National/
// Regional/Custom View), not a physical PC slot — but the label a user gives
// a group ("Kanto Starters") is independent of that and still worth keeping.

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

/**
 * box_index survives purely as internal bookkeeping (legacy slot
 * assignment, export/import compatibility, and the Graveyard sentinel
 * above) now that the Living Dex is one species grid instead of a literal
 * per-slot PC box — there's no more box-slot UI reading these positions.
 */
export async function getNextBoxIndex(gameInstanceId: string): Promise<number> {
  const entries = await db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray();
  const occupied = new Set(entries.filter((e) => e.box_index !== GRAVEYARD_BOX_INDEX).map((e) => e.box_index));
  let index = 0;
  while (occupied.has(index)) index++;
  return index;
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

// --- Custom View box-group admin (PRD 6.2) ---
// Only meaningful in Custom View, where the whole grid is the user's own
// sandbox — National/Regional/Type order is dex-defined, so there's nothing
// sensible to "rearrange" there beyond renaming a group's label.

/** Swaps two adjacent box-groups' worth of specimens by exchanging their sort_priority values pairwise. */
export async function moveCustomBoxGroup(customOrderUuids: string[], boxSize: number, boxNumber: number, direction: 'up' | 'down'): Promise<void> {
  const targetBoxNumber = direction === 'up' ? boxNumber - 1 : boxNumber + 1;
  const totalBoxes = Math.ceil(customOrderUuids.length / boxSize);
  if (boxNumber < 1 || targetBoxNumber < 1 || targetBoxNumber > totalBoxes) return;

  const aUuids = customOrderUuids.slice((boxNumber - 1) * boxSize, boxNumber * boxSize);
  const bUuids = customOrderUuids.slice((targetBoxNumber - 1) * boxSize, targetBoxNumber * boxSize);
  const aEntries = await db.vault.bulkGet(aUuids);
  const bEntries = await db.vault.bulkGet(bUuids);
  const aPriorities = aEntries.map((e) => e?.sort_priority ?? 0);
  const bPriorities = bEntries.map((e) => e?.sort_priority ?? 0);

  await recordSnapshot('reorder', `Moved a Custom View box group ${direction}`);
  await db.transaction('rw', db.vault, async () => {
    for (let i = 0; i < aUuids.length; i++) {
      if (bPriorities[i] !== undefined) await db.vault.update(aUuids[i], { sort_priority: bPriorities[i] });
    }
    for (let i = 0; i < bUuids.length; i++) {
      if (aPriorities[i] !== undefined) await db.vault.update(bUuids[i], { sort_priority: aPriorities[i] });
    }
  });
}

export interface DeleteBoxGroupResult {
  migratedCount: number;
  deletedCount: number;
}

/**
 * `mode: 'migrate'` pushes a Custom View box-group's specimens to the end
 * of the custom order (never destroying them); `mode: 'delete'` removes
 * them permanently — always preceded by a Version History snapshot (PRD
 * 14.3) so even a permanent delete has a one-click undo.
 */
export async function deleteCustomBoxGroup(gameInstanceId: string, uuids: string[], mode: 'migrate' | 'delete'): Promise<DeleteBoxGroupResult> {
  if (uuids.length === 0) return { migratedCount: 0, deletedCount: 0 };

  if (mode === 'delete') {
    await recordSnapshot('box_delete', `Permanently deleted a Custom View box group (${uuids.length} specimens)`);
    await db.vault.bulkDelete(uuids);
    return { migratedCount: 0, deletedCount: uuids.length };
  }

  await recordSnapshot('box_delete', `Migrated a Custom View box group (${uuids.length} specimens) to the end`);
  await db.transaction('rw', db.vault, async () => {
    const active = await db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray();
    let nextPriority = Math.max(0, ...active.map((e) => e.sort_priority)) + 1;
    for (const uuid of uuids) {
      await db.vault.update(uuid, { sort_priority: nextPriority });
      nextPriority += 1;
    }
  });
  return { migratedCount: uuids.length, deletedCount: 0 };
}
