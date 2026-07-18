import { db, type Team, type TeamSlot } from '../db/schema';
import { recordSnapshot } from './versionHistory';

const ZERO_STATS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function emptySlot(species: string): TeamSlot {
  return {
    species,
    level: 100,
    item: '',
    ability: '',
    nature: 'Hardy',
    moves: ['', '', '', ''],
    evs: { ...ZERO_STATS },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
}

export async function listTeams(): Promise<Team[]> {
  return db.teams.orderBy('created_date').reverse().toArray();
}

export async function saveTeam(name: string, slots: TeamSlot[], existingId?: string): Promise<string> {
  const now = new Date().toISOString();
  const teamId = existingId ?? crypto.randomUUID();
  await recordSnapshot('team_save', `Saved team "${name}"`);
  await db.teams.put({
    team_id: teamId,
    name,
    slots,
    created_date: existingId ? (await db.teams.get(existingId))?.created_date ?? now : now,
    updated_date: now,
  });
  return teamId;
}

export async function deleteTeam(teamId: string, name: string): Promise<void> {
  await recordSnapshot('team_delete', `Deleted team "${name}"`);
  await db.teams.delete(teamId);
}

/**
 * Showdown Tier 1 import (PRD 8.3) — parses the standard export text format:
 *
 *   Species @ Item
 *   Ability: X
 *   Level: 100
 *   EVs: 252 SpA / 4 SpD / 252 Spe
 *   Timid Nature
 *   - Move 1
 *   - Move 2
 *
 * Teams separated by blank lines. Unrecognized lines are ignored rather than
 * rejected, since real exports vary (Shiny: Yes, Tera Type, IVs, etc.) and a
 * strict parser would break on common real-world pastes.
 */
export function parseShowdownTeam(text: string): TeamSlot[] {
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const [headerLine, ...rest] = lines;

    let species = headerLine;
    let item = '';
    const atIndex = headerLine.indexOf(' @ ');
    if (atIndex !== -1) {
      species = headerLine.slice(0, atIndex).trim();
      item = headerLine.slice(atIndex + 3).trim();
    }
    // Strip a trailing gender marker first ("Species (M)"), then treat any
    // remaining "(...)" as a nickname wrapper ("Nickname (Species)") — doing
    // this in the other order mistook a genderless nickname-free "(M)"/"(F)"
    // marker for the nickname paren and overwrote species with just "M"/"F".
    species = species.replace(/\s*\((M|F)\)\s*$/, '').trim();
    const parenMatch = species.match(/\(([^)]+)\)/);
    if (parenMatch) species = parenMatch[1].trim();

    const slot = emptySlot(species);
    slot.item = item;

    const moves: string[] = [];
    for (const line of rest) {
      if (line.startsWith('Ability:')) {
        slot.ability = line.slice('Ability:'.length).trim();
      } else if (line.startsWith('Level:')) {
        const lvl = Number(line.slice('Level:'.length).trim());
        if (!Number.isNaN(lvl)) slot.level = lvl;
      } else if (line.startsWith('EVs:')) {
        slot.evs = parseStatLine(line.slice('EVs:'.length));
      } else if (line.startsWith('IVs:')) {
        slot.ivs = parseStatLine(line.slice('IVs:'.length), 31);
      } else if (line.endsWith('Nature')) {
        slot.nature = line.replace('Nature', '').trim();
      } else if (line.startsWith('-')) {
        moves.push(line.slice(1).trim());
      }
    }
    slot.moves = [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''];
    return slot;
  });
}

const STAT_KEY_MAP: Record<string, keyof typeof ZERO_STATS> = {
  HP: 'hp',
  Atk: 'atk',
  Def: 'def',
  SpA: 'spa',
  SpD: 'spd',
  Spe: 'spe',
};

/**
 * Showdown's export convention prints only stats that deviate from the
 * format's default — 0 for EVs, 31 for IVs — so an unlisted stat must fall
 * back to that default, not always 0.
 */
function parseStatLine(raw: string, defaultValue = 0): typeof ZERO_STATS {
  const stats = { hp: defaultValue, atk: defaultValue, def: defaultValue, spa: defaultValue, spd: defaultValue, spe: defaultValue };
  for (const part of raw.split('/')) {
    const [valueStr, statAbbr] = part.trim().split(/\s+/);
    const value = Number(valueStr);
    const key = statAbbr ? STAT_KEY_MAP[statAbbr] : undefined;
    if (key && !Number.isNaN(value)) stats[key] = value;
  }
  return stats;
}

/** Showdown Tier 1 export (PRD 8.3) — the inverse of parseShowdownTeam. */
export function exportShowdownTeam(slots: TeamSlot[]): string {
  return slots
    .filter((s) => s.species.trim())
    .map((slot) => {
      const lines: string[] = [];
      lines.push(slot.item ? `${slot.species} @ ${slot.item}` : slot.species);
      if (slot.ability) lines.push(`Ability: ${slot.ability}`);
      if (slot.level !== 100) lines.push(`Level: ${slot.level}`);
      const evLine = formatStatLine(slot.evs);
      if (evLine) lines.push(`EVs: ${evLine}`);
      if (slot.nature && slot.nature !== 'Hardy') lines.push(`${slot.nature} Nature`);
      const ivLine = formatStatLine(slot.ivs, 31);
      if (ivLine) lines.push(`IVs: ${ivLine}`);
      for (const move of slot.moves) {
        if (move.trim()) lines.push(`- ${move}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function formatStatLine(stats: typeof ZERO_STATS, skipValue = 0): string {
  const labels: [keyof typeof ZERO_STATS, string][] = [
    ['hp', 'HP'],
    ['atk', 'Atk'],
    ['def', 'Def'],
    ['spa', 'SpA'],
    ['spd', 'SpD'],
    ['spe', 'Spe'],
  ];
  return labels
    .filter(([key]) => stats[key] !== skipValue)
    .map(([key, label]) => `${stats[key]} ${label}`)
    .join(' / ');
}
