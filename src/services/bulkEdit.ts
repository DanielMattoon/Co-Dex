import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';

/**
 * Hotkey actions for marquee-selected box slots (PRD 15.2). Every box slot
 * is already an owned specimen, so the PRD's literal "C toggle caught"
 * doesn't map onto a per-slot boolean the way it would on an external
 * spreadsheet tracker — the closest existing per-specimen status flag in
 * the schema is `dead` (fainted), so `C` toggles that here instead of a
 * meaningless caught/uncaught flip on something already caught.
 */
export async function bulkToggleFainted(uuids: string[]): Promise<void> {
  await recordSnapshot('bulk_edit', `Toggled Fainted on ${uuids.length} specimen(s)`);
  const entries = await db.vault.bulkGet(uuids);
  await db.transaction('rw', db.vault, async () => {
    for (const entry of entries) {
      if (entry) await db.vault.update(entry.uuid, { dead: !entry.dead });
    }
  });
}

export async function bulkToggleShiny(uuids: string[]): Promise<void> {
  await recordSnapshot('bulk_edit', `Toggled Shiny on ${uuids.length} specimen(s)`);
  const entries = await db.vault.bulkGet(uuids);
  await db.transaction('rw', db.vault, async () => {
    for (const entry of entries) {
      if (entry) await db.vault.update(entry.uuid, { shiny: !entry.shiny });
    }
  });
}

export async function bulkAddTag(uuids: string[], tag: string): Promise<void> {
  const clean = tag.trim();
  if (!clean) return;
  await recordSnapshot('bulk_edit', `Tagged ${uuids.length} specimen(s) "${clean}"`);
  const entries = await db.vault.bulkGet(uuids);
  await db.transaction('rw', db.vault, async () => {
    for (const entry of entries) {
      if (entry && !entry.tags.includes(clean)) {
        await db.vault.update(entry.uuid, { tags: [...entry.tags, clean] });
      }
    }
  });
}

export async function bulkDelete(uuids: string[]): Promise<void> {
  await recordSnapshot('bulk_edit', `Cleared ${uuids.length} specimen(s) from the box`);
  await db.vault.bulkDelete(uuids);
}
