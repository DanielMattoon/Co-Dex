import { db } from '../db/schema';
import { listAllSpeciesWithIds } from './pokeapi';
import { ensureSeedCatalog } from './collectibles';

/**
 * Rewards Engine (PRD 12.4) — badges are computed entirely from local data,
 * no manual entry. Everything here reads across ALL game instances (not
 * just the active save), since the Trainer Profile is an account-wide view,
 * the same way Origin Badges (6.4) read cross-game.
 */
export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  progress: number; // 0..1
  progressLabel: string;
  /** Higher-tier badges get a shareable certificate export (PRD 12.4). */
  certificateEligible: boolean;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export async function computeBadges(): Promise<Badge[]> {
  await ensureSeedCatalog();
  const [allVault, allSpecies, catalog, copies, instances, profile] = await Promise.all([
    db.vault.toArray(),
    listAllSpeciesWithIds().catch(() => []),
    db.collectible_catalog.toArray(),
    db.collectible_copies.toArray(),
    db.game_instances.toArray(),
    db.trainer_profile.get('default'),
  ]);

  const totalSpecies = allSpecies.length || 1025;
  const ownedIds = new Set(allVault.map((e) => e.pokemon_id));
  const shinyOwnedIds = new Set(allVault.filter((e) => e.shiny).map((e) => e.pokemon_id));

  const ownedCatalogIds = new Set(copies.map((c) => c.catalog_id));
  const catalogTotal = catalog.length || 1;
  const catalogOwned = catalog.filter((c) => ownedCatalogIds.has(c.catalog_id)).length;

  const hasPerfectIvProject = allVault.some(
    (e) =>
      e.breeding_project_lock.is_locked &&
      e.ivs.hp === 31 &&
      e.ivs.atk === 31 &&
      e.ivs.def === 31 &&
      e.ivs.spa === 31 &&
      e.ivs.spd === 31 &&
      e.ivs.spe === 31,
  );

  const hasNuzlockeVictory = instances.some((i) => i.is_victory);
  const tradeCount = profile?.link_cable_trade_count ?? 0;

  const badges: Badge[] = [
    {
      id: 'national_living_dex',
      name: 'National Living Dex',
      description: `Own at least one of every species (${ownedIds.size}/${totalSpecies}).`,
      earned: ownedIds.size >= totalSpecies,
      progress: clamp01(ownedIds.size / totalSpecies),
      progressLabel: `${ownedIds.size}/${totalSpecies}`,
      certificateEligible: true,
    },
    {
      id: 'shiny_living_dex',
      name: 'Shiny Living Dex',
      description: `Own a shiny of every species (${shinyOwnedIds.size}/${totalSpecies}).`,
      earned: shinyOwnedIds.size >= totalSpecies,
      progress: clamp01(shinyOwnedIds.size / totalSpecies),
      progressLabel: `${shinyOwnedIds.size}/${totalSpecies}`,
      certificateEligible: true,
    },
    {
      id: 'game_collection_complete',
      name: 'Complete Collection',
      description: `Own a copy of every cataloged game (${catalogOwned}/${catalogTotal}).`,
      earned: catalogOwned >= catalogTotal,
      progress: clamp01(catalogOwned / catalogTotal),
      progressLabel: `${catalogOwned}/${catalogTotal}`,
      certificateEligible: true,
    },
    {
      id: 'perfect_iv_project',
      name: 'Perfect IV Breeder',
      description: 'Lock a breeding project on a specimen with flawless 31/31/31/31/31/31 IVs.',
      earned: hasPerfectIvProject,
      progress: hasPerfectIvProject ? 1 : 0,
      progressLabel: hasPerfectIvProject ? 'Complete' : 'Not yet',
      certificateEligible: false,
    },
    {
      id: 'nuzlocke_victory',
      name: 'Nuzlocke Champion',
      description: 'Win a Nuzlocke run.',
      earned: hasNuzlockeVictory,
      progress: hasNuzlockeVictory ? 1 : 0,
      progressLabel: hasNuzlockeVictory ? 'Victorious' : 'Not yet',
      certificateEligible: true,
    },
    {
      id: 'trade_first',
      name: 'First Trade',
      description: 'Complete your first Link Cable trade.',
      earned: tradeCount >= 1,
      progress: clamp01(tradeCount / 1),
      progressLabel: `${Math.min(tradeCount, 1)}/1`,
      certificateEligible: false,
    },
    {
      id: 'trade_veteran',
      name: 'Trade Veteran',
      description: 'Complete 5 Link Cable trades.',
      earned: tradeCount >= 5,
      progress: clamp01(tradeCount / 5),
      progressLabel: `${Math.min(tradeCount, 5)}/5`,
      certificateEligible: false,
    },
    {
      id: 'trade_master',
      name: 'Trade Master',
      description: 'Complete 25 Link Cable trades.',
      earned: tradeCount >= 25,
      progress: clamp01(tradeCount / 25),
      progressLabel: `${Math.min(tradeCount, 25)}/25`,
      certificateEligible: false,
    },
  ];

  return badges;
}
