import { db } from '../db/schema';
import { recordSnapshot } from './versionHistory';
import { getNextBoxIndex } from './boxes';
import { listAllSpeciesWithIds } from './pokeapi';

/** Target Co-Dex fields a spreadsheet column can be mapped onto (PRD 15.1 Smart-Map Importer). */
export type TargetField = 'species' | 'dexNo' | 'nickname' | 'level' | 'shiny' | 'ball' | 'caughtStatus' | 'tags';

export const TARGET_FIELDS: { id: TargetField; label: string; required: boolean }[] = [
  { id: 'species', label: 'Species Name', required: false },
  { id: 'dexNo', label: 'Dex Number', required: false },
  { id: 'nickname', label: 'Nickname', required: false },
  { id: 'level', label: 'Level', required: false },
  { id: 'shiny', label: 'Shiny Variant', required: false },
  { id: 'ball', label: 'Ball Used', required: false },
  { id: 'caughtStatus', label: 'Caught Status (filters rows)', required: false },
  { id: 'tags', label: 'Tags (comma/semicolon separated)', required: false },
];

export type ColumnMapping = Partial<Record<TargetField, number>>;

function truthy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === 'y' || v === '1' || v === 'caught' || v === 'x';
}

export interface ImportPreviewRow {
  species: string | null;
  pokemonId: number | null;
  nickname: string;
  level: number;
  shiny: boolean;
  ball: string;
  tags: string[];
  included: boolean;
}

/** Resolves each row against the mapping and the live species list, without writing anything yet. */
export async function buildPreview(rows: string[][], mapping: ColumnMapping): Promise<ImportPreviewRow[]> {
  const species = await listAllSpeciesWithIds().catch(() => []);

  // PokéAPI slugs are punctuation-free ("mr-mime", "farfetchd", "type-null"),
  // but real spreadsheet cells use natural display names ("Mr. Mime",
  // "Farfetch'd", "Type: Null") — normalize both sides the same way so
  // punctuation doesn't cause an otherwise-correct name to go unmatched.
  function normalize(name: string): string {
    return name
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/[.''’:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const byName = new Map(species.map((s) => [normalize(s.name), s.pokemonId]));
  const byId = new Map(species.map((s) => [s.pokemonId, s.name]));

  function titleCase(name: string): string {
    return name.split(/[\s-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  return rows.map((row) => {
    let pokemonId: number | null = null;
    let speciesName: string | null = null;

    if (mapping.dexNo !== undefined) {
      const n = Number(row[mapping.dexNo]);
      if (!Number.isNaN(n) && byId.has(n)) {
        pokemonId = n;
        speciesName = titleCase(byId.get(n)!);
      }
    }
    if (pokemonId === null && mapping.species !== undefined) {
      const raw = normalize(row[mapping.species] ?? '');
      const match = byName.get(raw);
      if (match !== undefined) {
        pokemonId = match;
        speciesName = titleCase(byId.get(match)!);
      }
    }

    const included = mapping.caughtStatus !== undefined ? truthy(row[mapping.caughtStatus] ?? '') : true;

    return {
      species: speciesName,
      pokemonId,
      nickname: mapping.nickname !== undefined ? (row[mapping.nickname] ?? '').trim() : '',
      level: mapping.level !== undefined ? Math.max(1, Number(row[mapping.level]) || 5) : 5,
      shiny: mapping.shiny !== undefined ? truthy(row[mapping.shiny] ?? '') : false,
      ball: mapping.ball !== undefined ? (row[mapping.ball] ?? '').trim() : '',
      tags: mapping.tags !== undefined ? (row[mapping.tags] ?? '').split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [],
      included,
    };
  });
}

/** Commits resolvable, included preview rows into the active save's Vault (PRD 15.1). */
export async function commitImport(gameInstanceId: string, preview: ImportPreviewRow[]): Promise<{ imported: number; skipped: number }> {
  const importable = preview.filter((r) => r.included && r.pokemonId !== null && r.species !== null);
  if (importable.length === 0) return { imported: 0, skipped: preview.length };

  await recordSnapshot('smart_import', `Smart-Map imported ${importable.length} specimen(s)`);

  const now = new Date().toISOString();
  await db.transaction('rw', db.vault, async () => {
    let nextIndex = await getNextBoxIndex(gameInstanceId);
    const occupied = new Set<number>();

    for (const row of importable) {
      while (occupied.has(nextIndex)) nextIndex++;
      await db.vault.add({
        uuid: crypto.randomUUID(),
        species: row.species!,
        pokemon_id: row.pokemonId!,
        nickname: row.nickname || null,
        level: row.level,
        hp: 100,
        dead: false,
        gender: 'genderless',
        shiny: row.shiny,
        form: 'default',
        catchLocation: null,
        origin_game_instance_id: gameInstanceId,
        current_game_instance_id: gameInstanceId,
        box_index: nextIndex,
        captured_date: now,
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        moves: [],
        held_item: null,
        ball: row.ball || null,
        tags: [...row.tags, 'smart-import'],
        reservation_status: { is_reserved: false, target_evolution_id: null },
        breeding_project_lock: { is_locked: false, notes: null },
        history_log: [{ timestamp: now, action: 'imported', details: 'Imported via Smart-Map Importer.' }],
        is_sandbox_anomalous: false,
        sort_priority: nextIndex,
      });
      occupied.add(nextIndex);
      nextIndex++;
    }
  });

  return { imported: importable.length, skipped: preview.length - importable.length };
}
