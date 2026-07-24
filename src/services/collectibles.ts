import { db, type CollectibleCatalogItem, type CollectibleCopy } from '../db/schema';
import { recordSnapshot } from './versionHistory';

/**
 * Game Collection catalog (PRD 22.1) — a hand-typed stand-in for a live
 * TheGamesDB fetch. The real integration needs a TheGamesDB API key (PRD
 * 4.1's reasoning for picking it over IGDB still applies — simple key-based
 * auth, safe client-side), which isn't available in this build; swapping
 * this seed for a live fetch is a one-file change since the rest of the
 * feature reads catalog_id/name/platform/region/release_year generically.
 *
 * Mainline titles only, for now — spin-offs (Stadium, Mystery Dungeon,
 * Ranger, ...) and mobile-only free-to-play titles are left out entirely
 * rather than filtered, keeping the Shelf a single flat, evenly-spaced
 * grid instead of the earlier franchise-grouping/slide-open UI. The
 * `is_mainline`/`franchise`/`digital_only` fields stay on the schema in
 * case spin-offs come back later, but every row here is `is_mainline: true`
 * with no franchise. `release_year` is the NA release year (display-only);
 * `release_order` is the true worldwide release sequence, since same-year
 * titles and JP-first releases don't sort correctly by year alone.
 */
const SEED_CATALOG: CollectibleCatalogItem[] = [
  { catalog_id: 'red', category: 'game', name: 'Red', platform: 'Game Boy', region: 'NA', release_year: 1998, is_mainline: true, franchise: null, release_order: 0, digital_only: false },
  { catalog_id: 'blue', category: 'game', name: 'Blue', platform: 'Game Boy', region: 'NA', release_year: 1998, is_mainline: true, franchise: null, release_order: 1, digital_only: false },
  { catalog_id: 'yellow', category: 'game', name: 'Yellow', platform: 'Game Boy', region: 'NA', release_year: 1999, is_mainline: true, franchise: null, release_order: 2, digital_only: false },
  { catalog_id: 'gold', category: 'game', name: 'Gold', platform: 'Game Boy Color', region: 'NA', release_year: 2000, is_mainline: true, franchise: null, release_order: 3, digital_only: false },
  { catalog_id: 'silver', category: 'game', name: 'Silver', platform: 'Game Boy Color', region: 'NA', release_year: 2000, is_mainline: true, franchise: null, release_order: 4, digital_only: false },
  { catalog_id: 'crystal', category: 'game', name: 'Crystal', platform: 'Game Boy Color', region: 'NA', release_year: 2001, is_mainline: true, franchise: null, release_order: 5, digital_only: false },
  { catalog_id: 'ruby', category: 'game', name: 'Ruby', platform: 'Game Boy Advance', region: 'NA', release_year: 2003, is_mainline: true, franchise: null, release_order: 6, digital_only: false },
  { catalog_id: 'sapphire', category: 'game', name: 'Sapphire', platform: 'Game Boy Advance', region: 'NA', release_year: 2003, is_mainline: true, franchise: null, release_order: 7, digital_only: false },
  { catalog_id: 'firered', category: 'game', name: 'FireRed', platform: 'Game Boy Advance', region: 'NA', release_year: 2004, is_mainline: true, franchise: null, release_order: 8, digital_only: false },
  { catalog_id: 'leafgreen', category: 'game', name: 'LeafGreen', platform: 'Game Boy Advance', region: 'NA', release_year: 2004, is_mainline: true, franchise: null, release_order: 9, digital_only: false },
  { catalog_id: 'emerald', category: 'game', name: 'Emerald', platform: 'Game Boy Advance', region: 'NA', release_year: 2005, is_mainline: true, franchise: null, release_order: 10, digital_only: false },
  { catalog_id: 'diamond', category: 'game', name: 'Diamond', platform: 'Nintendo DS', region: 'NA', release_year: 2007, is_mainline: true, franchise: null, release_order: 11, digital_only: false },
  { catalog_id: 'pearl', category: 'game', name: 'Pearl', platform: 'Nintendo DS', region: 'NA', release_year: 2007, is_mainline: true, franchise: null, release_order: 12, digital_only: false },
  { catalog_id: 'platinum', category: 'game', name: 'Platinum', platform: 'Nintendo DS', region: 'NA', release_year: 2009, is_mainline: true, franchise: null, release_order: 13, digital_only: false },
  { catalog_id: 'heartgold', category: 'game', name: 'HeartGold', platform: 'Nintendo DS', region: 'NA', release_year: 2010, is_mainline: true, franchise: null, release_order: 14, digital_only: false },
  { catalog_id: 'soulsilver', category: 'game', name: 'SoulSilver', platform: 'Nintendo DS', region: 'NA', release_year: 2010, is_mainline: true, franchise: null, release_order: 15, digital_only: false },
  { catalog_id: 'black', category: 'game', name: 'Black', platform: 'Nintendo DS', region: 'NA', release_year: 2011, is_mainline: true, franchise: null, release_order: 16, digital_only: false },
  { catalog_id: 'white', category: 'game', name: 'White', platform: 'Nintendo DS', region: 'NA', release_year: 2011, is_mainline: true, franchise: null, release_order: 17, digital_only: false },
  { catalog_id: 'black2', category: 'game', name: 'Black 2', platform: 'Nintendo DS', region: 'NA', release_year: 2012, is_mainline: true, franchise: null, release_order: 18, digital_only: false },
  { catalog_id: 'white2', category: 'game', name: 'White 2', platform: 'Nintendo DS', region: 'NA', release_year: 2012, is_mainline: true, franchise: null, release_order: 19, digital_only: false },
  { catalog_id: 'x', category: 'game', name: 'X', platform: 'Nintendo 3DS', region: 'NA', release_year: 2013, is_mainline: true, franchise: null, release_order: 20, digital_only: false },
  { catalog_id: 'y', category: 'game', name: 'Y', platform: 'Nintendo 3DS', region: 'NA', release_year: 2013, is_mainline: true, franchise: null, release_order: 21, digital_only: false },
  { catalog_id: 'omegaruby', category: 'game', name: 'Omega Ruby', platform: 'Nintendo 3DS', region: 'NA', release_year: 2014, is_mainline: true, franchise: null, release_order: 22, digital_only: false },
  { catalog_id: 'alphasapphire', category: 'game', name: 'Alpha Sapphire', platform: 'Nintendo 3DS', region: 'NA', release_year: 2014, is_mainline: true, franchise: null, release_order: 23, digital_only: false },
  { catalog_id: 'sun', category: 'game', name: 'Sun', platform: 'Nintendo 3DS', region: 'NA', release_year: 2016, is_mainline: true, franchise: null, release_order: 24, digital_only: false },
  { catalog_id: 'moon', category: 'game', name: 'Moon', platform: 'Nintendo 3DS', region: 'NA', release_year: 2016, is_mainline: true, franchise: null, release_order: 25, digital_only: false },
  { catalog_id: 'ultrasun', category: 'game', name: 'Ultra Sun', platform: 'Nintendo 3DS', region: 'NA', release_year: 2017, is_mainline: true, franchise: null, release_order: 26, digital_only: false },
  { catalog_id: 'ultramoon', category: 'game', name: 'Ultra Moon', platform: 'Nintendo 3DS', region: 'NA', release_year: 2017, is_mainline: true, franchise: null, release_order: 27, digital_only: false },
  { catalog_id: 'letsgopikachu', category: 'game', name: "Let's Go, Pikachu!", platform: 'Nintendo Switch', region: 'NA', release_year: 2018, is_mainline: true, franchise: null, release_order: 28, digital_only: false },
  { catalog_id: 'letsgoeevee', category: 'game', name: "Let's Go, Eevee!", platform: 'Nintendo Switch', region: 'NA', release_year: 2018, is_mainline: true, franchise: null, release_order: 29, digital_only: false },
  { catalog_id: 'sword', category: 'game', name: 'Sword', platform: 'Nintendo Switch', region: 'NA', release_year: 2019, is_mainline: true, franchise: null, release_order: 30, digital_only: false },
  { catalog_id: 'shield', category: 'game', name: 'Shield', platform: 'Nintendo Switch', region: 'NA', release_year: 2019, is_mainline: true, franchise: null, release_order: 31, digital_only: false },
  { catalog_id: 'brilliantdiamond', category: 'game', name: 'Brilliant Diamond', platform: 'Nintendo Switch', region: 'NA', release_year: 2021, is_mainline: true, franchise: null, release_order: 32, digital_only: false },
  { catalog_id: 'shiningpearl', category: 'game', name: 'Shining Pearl', platform: 'Nintendo Switch', region: 'NA', release_year: 2021, is_mainline: true, franchise: null, release_order: 33, digital_only: false },
  { catalog_id: 'legendsarceus', category: 'game', name: 'Legends: Arceus', platform: 'Nintendo Switch', region: 'NA', release_year: 2022, is_mainline: true, franchise: null, release_order: 34, digital_only: false },
  { catalog_id: 'scarlet', category: 'game', name: 'Scarlet', platform: 'Nintendo Switch', region: 'NA', release_year: 2022, is_mainline: true, franchise: null, release_order: 35, digital_only: false },
  { catalog_id: 'violet', category: 'game', name: 'Violet', platform: 'Nintendo Switch', region: 'NA', release_year: 2022, is_mainline: true, franchise: null, release_order: 36, digital_only: false },
];

export async function ensureSeedCatalog(): Promise<void> {
  // bulkPut, not bulkAdd — idempotent under concurrent bootstrap callers,
  // same reasoning as gameInstances.ts's ensureSeedTitles. Also reconciles
  // deletions: titles that have been dropped from SEED_CATALOG (e.g. the
  // mobile-only F2P titles pulled out when this became console-only) must
  // not linger in IndexedDB from an earlier seed version, since a stale row
  // missing today's fields (release_order, is_mainline) breaks sorting and
  // filtering for everyone who already has the app open.
  const seedIds = new Set(SEED_CATALOG.map((c) => c.catalog_id));
  const existingIds = await db.collectible_catalog.toCollection().primaryKeys();
  const staleIds = existingIds.filter((id) => !seedIds.has(id as string));
  await db.collectible_catalog.bulkPut(SEED_CATALOG);
  if (staleIds.length > 0) await db.collectible_catalog.bulkDelete(staleIds);
}

export async function listCatalog(): Promise<CollectibleCatalogItem[]> {
  return db.collectible_catalog.toArray();
}

export async function listCopies(catalogId: string): Promise<CollectibleCopy[]> {
  return db.collectible_copies.where('catalog_id').equals(catalogId).toArray();
}

export interface AddCopyParams {
  catalogId: string;
  catalogName: string;
  condition: string;
  isGraded: boolean;
  gradingCompany: string;
  grade: string;
  purchasePrice: number | null;
  purchaseDate: string | null;
  source: string;
}

export async function addCopy(params: AddCopyParams): Promise<void> {
  const copy: CollectibleCopy = {
    copy_id: crypto.randomUUID(),
    catalog_id: params.catalogId,
    condition: params.condition,
    grading: {
      is_graded: params.isGraded,
      company: params.isGraded ? params.gradingCompany || null : null,
      grade: params.isGraded ? params.grade || null : null,
      cert_number: null,
    },
    acquisition: {
      purchase_price: params.purchasePrice,
      purchase_date: params.purchaseDate,
      source: params.source || null,
    },
    disposition: { is_sold: false, sold_price: null, sold_date: null, sold_via: null },
    linked_game_instance_id: null,
    notes: '',
    tags: [],
  };
  await recordSnapshot('collection_add', `Added a copy of ${params.catalogName} to the Collection`);
  await db.collectible_copies.add(copy);
}

export async function removeCopy(copyId: string, catalogName: string): Promise<void> {
  await recordSnapshot('collection_remove', `Removed a copy of ${catalogName} from the Collection`);
  await db.collectible_copies.delete(copyId);
}
