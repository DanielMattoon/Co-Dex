import { db, type CollectibleCatalogItem, type CollectibleCopy } from '../db/schema';
import { recordSnapshot } from './versionHistory';

/**
 * Game Collection catalog (PRD 22.1) — a small hand-typed stand-in for a
 * live TheGamesDB fetch. The real integration needs a TheGamesDB API key
 * (PRD 4.1's reasoning for picking it over IGDB still applies — simple
 * key-based auth, safe client-side), which isn't available in this build;
 * swapping this seed for a live fetch is a one-file change since the rest
 * of the feature reads catalog_id/name/platform/region/release_year
 * generically.
 */
const SEED_CATALOG: CollectibleCatalogItem[] = [
  { catalog_id: 'red', category: 'game', name: 'Red', platform: 'Game Boy', region: 'NA', release_year: 1998 },
  { catalog_id: 'gold', category: 'game', name: 'Gold', platform: 'Game Boy Color', region: 'NA', release_year: 2000 },
  { catalog_id: 'ruby', category: 'game', name: 'Ruby', platform: 'Game Boy Advance', region: 'NA', release_year: 2003 },
  { catalog_id: 'firered', category: 'game', name: 'FireRed', platform: 'Game Boy Advance', region: 'NA', release_year: 2004 },
  { catalog_id: 'diamond', category: 'game', name: 'Diamond', platform: 'Nintendo DS', region: 'NA', release_year: 2007 },
  { catalog_id: 'heartgold', category: 'game', name: 'HeartGold', platform: 'Nintendo DS', region: 'NA', release_year: 2010 },
  { catalog_id: 'black', category: 'game', name: 'Black', platform: 'Nintendo DS', region: 'NA', release_year: 2011 },
  { catalog_id: 'x', category: 'game', name: 'X', platform: 'Nintendo 3DS', region: 'NA', release_year: 2013 },
  { catalog_id: 'sun', category: 'game', name: 'Sun', platform: 'Nintendo 3DS', region: 'NA', release_year: 2016 },
  { catalog_id: 'sword', category: 'game', name: 'Sword', platform: 'Nintendo Switch', region: 'NA', release_year: 2019 },
  { catalog_id: 'scarlet', category: 'game', name: 'Scarlet', platform: 'Nintendo Switch', region: 'NA', release_year: 2022 },
];

export async function ensureSeedCatalog(): Promise<void> {
  // bulkPut, not bulkAdd — idempotent under concurrent bootstrap callers,
  // same reasoning as gameInstances.ts's ensureSeedTitles.
  await db.collectible_catalog.bulkPut(SEED_CATALOG);
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
