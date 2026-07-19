/**
 * Real, shareable Trainer Profiles (PRD 12.1/12.3) without a backend — now
 * that Co-Dex has a real persistent URL (GitHub Pages), a profile "link"
 * can be a real link: the whole snapshot is encoded into the URL itself
 * (base64, UTF-8 safe), and anyone who opens it gets a read-only render of
 * it — no server, no database, no account, nothing to host beyond the
 * static site that's already there. This is deliberately a snapshot, not a
 * live view: opening the link later won't reflect changes made since.
 */
export interface ShareableProfile {
  trainerName: string;
  stats: {
    totalSpecimens: number;
    uniqueSpecies: number;
    shinyCount: number;
    gamesOwned: number;
  };
  badgesEarned: string[];
  wantsAndNeeds: {
    missingSpeciesCount: number;
    missingGames: string[];
  };
  generatedAt: string;
}

export function encodeProfileForSharing(profile: ShareableProfile): string {
  const json = JSON.stringify(profile);
  const utf8Bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return btoa(utf8Bytes);
}

export function decodeSharedProfile(encoded: string): ShareableProfile | null {
  try {
    const utf8Bytes = atob(encoded);
    const json = decodeURIComponent(
      utf8Bytes
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.trainerName !== 'string') return null;
    return parsed as ShareableProfile;
  } catch {
    return null;
  }
}

/** The full shareable URL for a profile snapshot, built off whatever origin/path the app is actually running at — works the same on GitHub Pages or a local dev server. */
export function buildProfileShareUrl(profile: ShareableProfile): string {
  const encoded = encodeProfileForSharing(profile);
  const base = window.location.href.split('#')[0];
  return `${base}#/profile/view?data=${encoded}`;
}
