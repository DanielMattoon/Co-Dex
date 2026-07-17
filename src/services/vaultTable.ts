import { db, type VaultEntry } from '../db/schema';
import { toCsv, downloadTextFile } from './csv';

/**
 * Open-Gate Export (PRD 15.1) — a clean, structured export of just the
 * Vault (not the whole app's tables like the .codex backup), meant for
 * spreadsheet power users to pull into their own tools.
 */
export interface VaultRow {
  species: string;
  pokemonId: number;
  nickname: string;
  level: number;
  shiny: boolean;
  ball: string;
  gender: string;
  form: string;
  caughtLocation: string;
  capturedDate: string;
  tags: string;
}

function toRow(e: VaultEntry): VaultRow {
  return {
    species: e.species,
    pokemonId: e.pokemon_id,
    nickname: e.nickname ?? '',
    level: e.level,
    shiny: e.shiny,
    ball: e.ball ?? '',
    gender: e.gender,
    form: e.form,
    caughtLocation: e.catchLocation ?? '',
    capturedDate: e.captured_date,
    tags: e.tags.join(';'),
  };
}

export async function exportVaultJson(): Promise<void> {
  const entries = await db.vault.toArray();
  const rows = entries.map(toRow);
  downloadTextFile(JSON.stringify(rows, null, 2), 'co-dex-vault.json', 'application/json');
}

const CSV_HEADERS: (keyof VaultRow)[] = [
  'species',
  'pokemonId',
  'nickname',
  'level',
  'shiny',
  'ball',
  'gender',
  'form',
  'caughtLocation',
  'capturedDate',
  'tags',
];

export async function exportVaultCsv(): Promise<void> {
  const entries = await db.vault.toArray();
  const rows = entries.map(toRow);
  const csv = toCsv(
    CSV_HEADERS,
    rows.map((r) => CSV_HEADERS.map((h) => r[h])),
  );
  downloadTextFile(csv, 'co-dex-vault.csv', 'text/csv');
}
