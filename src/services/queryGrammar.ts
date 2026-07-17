import type { VaultEntry } from '../db/schema';

/**
 * Dynamic Tagging query grammar (PRD 15.3). v1 operators: tag:"X", ball:"X",
 * from:XX (cross-game origin, matched against the origin game's title),
 * dex:###. Plain text with no operator falls back to a fuzzy name search.
 * Operators are parsed independently and ANDed together, so
 * `tag:"shiny-hunt" dex:25` narrows correctly; unrecognized text still
 * falls through to the name search rather than being dropped, so a typo'd
 * operator degrades gracefully instead of returning nothing.
 */
export interface ParsedQuery {
  tags: string[];
  balls: string[];
  from: string[];
  dex: number[];
  freeText: string[];
}

const OPERATOR_RE = /(tag|ball|from|dex):"([^"]*)"|(tag|ball|from|dex):(\S+)/gi;

export function parseQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = { tags: [], balls: [], from: [], dex: [], freeText: [] };
  let remainder = raw;

  for (const match of raw.matchAll(OPERATOR_RE)) {
    const op = (match[1] ?? match[3]).toLowerCase();
    const value = match[2] ?? match[4];
    remainder = remainder.replace(match[0], ' ');
    if (op === 'tag') parsed.tags.push(value.toLowerCase());
    else if (op === 'ball') parsed.balls.push(value.toLowerCase());
    else if (op === 'from') parsed.from.push(value.toLowerCase());
    else if (op === 'dex') {
      const n = Number(value);
      if (!Number.isNaN(n)) parsed.dex.push(n);
    }
  }

  const leftover = remainder.trim();
  if (leftover) parsed.freeText.push(leftover.toLowerCase());

  return parsed;
}

export interface QueryContext {
  /** Title of the game each entry originated in, keyed by origin_game_instance_id. */
  originTitleByInstanceId: Map<string, string>;
}

export function matchesQuery(entry: VaultEntry, query: ParsedQuery, ctx: QueryContext): boolean {
  if (query.tags.length > 0) {
    const entryTags = entry.tags.map((t) => t.toLowerCase());
    if (!query.tags.every((t) => entryTags.includes(t))) return false;
  }
  if (query.balls.length > 0) {
    const ball = (entry.ball ?? '').toLowerCase();
    if (!query.balls.some((b) => ball === b)) return false;
  }
  if (query.from.length > 0) {
    const originTitle = (ctx.originTitleByInstanceId.get(entry.origin_game_instance_id) ?? '').toLowerCase();
    if (!query.from.some((f) => originTitle.includes(f))) return false;
  }
  if (query.dex.length > 0) {
    if (!query.dex.includes(entry.pokemon_id)) return false;
  }
  if (query.freeText.length > 0) {
    const haystack = `${entry.species} ${entry.nickname ?? ''}`.toLowerCase();
    if (!query.freeText.every((t) => haystack.includes(t))) return false;
  }
  return true;
}
