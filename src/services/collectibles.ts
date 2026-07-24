import { db, type CollectibleCatalogItem, type CollectibleCopy } from '../db/schema';
import { recordSnapshot } from './versionHistory';

/**
 * Game Collection catalog (PRD 22.1) — a hand-typed stand-in for a live
 * TheGamesDB fetch. The real integration needs a TheGamesDB API key (PRD
 * 4.1's reasoning for picking it over IGDB still applies — simple key-based
 * auth, safe client-side), which isn't available in this build; swapping
 * this seed for a live fetch is a one-file change since the rest of the
 * feature reads catalog_id/name/platform/region/release_year generically.
 * Every mainline release plus every major official spin-off, not just a
 * sampler — release years are NA release dates where the title released
 * there, JP otherwise (noted per entry where it differs).
 */
const SEED_CATALOG: CollectibleCatalogItem[] = [
  // Mainline RPGs
  { catalog_id: 'red', category: 'game', name: 'Red', platform: 'Game Boy', region: 'NA', release_year: 1998 },
  { catalog_id: 'blue', category: 'game', name: 'Blue', platform: 'Game Boy', region: 'NA', release_year: 1998 },
  { catalog_id: 'yellow', category: 'game', name: 'Yellow', platform: 'Game Boy', region: 'NA', release_year: 1999 },
  { catalog_id: 'gold', category: 'game', name: 'Gold', platform: 'Game Boy Color', region: 'NA', release_year: 2000 },
  { catalog_id: 'silver', category: 'game', name: 'Silver', platform: 'Game Boy Color', region: 'NA', release_year: 2000 },
  { catalog_id: 'crystal', category: 'game', name: 'Crystal', platform: 'Game Boy Color', region: 'NA', release_year: 2001 },
  { catalog_id: 'ruby', category: 'game', name: 'Ruby', platform: 'Game Boy Advance', region: 'NA', release_year: 2003 },
  { catalog_id: 'sapphire', category: 'game', name: 'Sapphire', platform: 'Game Boy Advance', region: 'NA', release_year: 2003 },
  { catalog_id: 'firered', category: 'game', name: 'FireRed', platform: 'Game Boy Advance', region: 'NA', release_year: 2004 },
  { catalog_id: 'leafgreen', category: 'game', name: 'LeafGreen', platform: 'Game Boy Advance', region: 'NA', release_year: 2004 },
  { catalog_id: 'emerald', category: 'game', name: 'Emerald', platform: 'Game Boy Advance', region: 'NA', release_year: 2005 },
  { catalog_id: 'diamond', category: 'game', name: 'Diamond', platform: 'Nintendo DS', region: 'NA', release_year: 2007 },
  { catalog_id: 'pearl', category: 'game', name: 'Pearl', platform: 'Nintendo DS', region: 'NA', release_year: 2007 },
  { catalog_id: 'platinum', category: 'game', name: 'Platinum', platform: 'Nintendo DS', region: 'NA', release_year: 2009 },
  { catalog_id: 'heartgold', category: 'game', name: 'HeartGold', platform: 'Nintendo DS', region: 'NA', release_year: 2010 },
  { catalog_id: 'soulsilver', category: 'game', name: 'SoulSilver', platform: 'Nintendo DS', region: 'NA', release_year: 2010 },
  { catalog_id: 'black', category: 'game', name: 'Black', platform: 'Nintendo DS', region: 'NA', release_year: 2011 },
  { catalog_id: 'white', category: 'game', name: 'White', platform: 'Nintendo DS', region: 'NA', release_year: 2011 },
  { catalog_id: 'black2', category: 'game', name: 'Black 2', platform: 'Nintendo DS', region: 'NA', release_year: 2012 },
  { catalog_id: 'white2', category: 'game', name: 'White 2', platform: 'Nintendo DS', region: 'NA', release_year: 2012 },
  { catalog_id: 'x', category: 'game', name: 'X', platform: 'Nintendo 3DS', region: 'NA', release_year: 2013 },
  { catalog_id: 'y', category: 'game', name: 'Y', platform: 'Nintendo 3DS', region: 'NA', release_year: 2013 },
  { catalog_id: 'omegaruby', category: 'game', name: 'Omega Ruby', platform: 'Nintendo 3DS', region: 'NA', release_year: 2014 },
  { catalog_id: 'alphasapphire', category: 'game', name: 'Alpha Sapphire', platform: 'Nintendo 3DS', region: 'NA', release_year: 2014 },
  { catalog_id: 'sun', category: 'game', name: 'Sun', platform: 'Nintendo 3DS', region: 'NA', release_year: 2016 },
  { catalog_id: 'moon', category: 'game', name: 'Moon', platform: 'Nintendo 3DS', region: 'NA', release_year: 2016 },
  { catalog_id: 'ultrasun', category: 'game', name: 'Ultra Sun', platform: 'Nintendo 3DS', region: 'NA', release_year: 2017 },
  { catalog_id: 'ultramoon', category: 'game', name: 'Ultra Moon', platform: 'Nintendo 3DS', region: 'NA', release_year: 2017 },
  { catalog_id: 'letsgopikachu', category: 'game', name: "Let's Go, Pikachu!", platform: 'Nintendo Switch', region: 'NA', release_year: 2018 },
  { catalog_id: 'letsgoeevee', category: 'game', name: "Let's Go, Eevee!", platform: 'Nintendo Switch', region: 'NA', release_year: 2018 },
  { catalog_id: 'sword', category: 'game', name: 'Sword', platform: 'Nintendo Switch', region: 'NA', release_year: 2019 },
  { catalog_id: 'shield', category: 'game', name: 'Shield', platform: 'Nintendo Switch', region: 'NA', release_year: 2019 },
  { catalog_id: 'brilliantdiamond', category: 'game', name: 'Brilliant Diamond', platform: 'Nintendo Switch', region: 'NA', release_year: 2021 },
  { catalog_id: 'shiningpearl', category: 'game', name: 'Shining Pearl', platform: 'Nintendo Switch', region: 'NA', release_year: 2021 },
  { catalog_id: 'legendsarceus', category: 'game', name: 'Legends: Arceus', platform: 'Nintendo Switch', region: 'NA', release_year: 2022 },
  { catalog_id: 'scarlet', category: 'game', name: 'Scarlet', platform: 'Nintendo Switch', region: 'NA', release_year: 2022 },
  { catalog_id: 'violet', category: 'game', name: 'Violet', platform: 'Nintendo Switch', region: 'NA', release_year: 2022 },

  // Stadium / battle & puzzle spin-offs
  { catalog_id: 'stadium', category: 'game', name: 'Stadium', platform: 'Nintendo 64', region: 'NA', release_year: 2000 },
  { catalog_id: 'stadium2', category: 'game', name: 'Stadium 2', platform: 'Nintendo 64', region: 'NA', release_year: 2001 },
  { catalog_id: 'puzzleleague', category: 'game', name: 'Puzzle League', platform: 'Nintendo 64', region: 'NA', release_year: 2000 },
  { catalog_id: 'pinball', category: 'game', name: 'Pinball', platform: 'Game Boy Color', region: 'NA', release_year: 1999 },
  { catalog_id: 'tradingcardgame', category: 'game', name: 'Trading Card Game', platform: 'Game Boy Color', region: 'NA', release_year: 2000 },
  { catalog_id: 'pinballrs', category: 'game', name: 'Pinball: Ruby & Sapphire', platform: 'Game Boy Advance', region: 'NA', release_year: 2003 },
  { catalog_id: 'battlerevolution', category: 'game', name: 'Battle Revolution', platform: 'Wii', region: 'NA', release_year: 2007 },
  { catalog_id: 'battletrozei', category: 'game', name: 'Battle Trozei', platform: 'Nintendo 3DS', region: 'NA', release_year: 2014 },
  { catalog_id: 'pokkentournament', category: 'game', name: 'Pokkén Tournament', platform: 'Wii U', region: 'NA', release_year: 2016 },
  { catalog_id: 'pokkentournamentdx', category: 'game', name: 'Pokkén Tournament DX', platform: 'Nintendo Switch', region: 'NA', release_year: 2017 },
  { catalog_id: 'shuffle', category: 'game', name: 'Shuffle', platform: 'Nintendo 3DS', region: 'NA', release_year: 2015 },
  { catalog_id: 'picross', category: 'game', name: 'Picross', platform: 'Nintendo 3DS', region: 'NA', release_year: 2015 },

  // Snap / Channel / Park
  { catalog_id: 'snap', category: 'game', name: 'Snap', platform: 'Nintendo 64', region: 'NA', release_year: 1999 },
  { catalog_id: 'snapswitch', category: 'game', name: 'New Pokémon Snap', platform: 'Nintendo Switch', region: 'NA', release_year: 2021 },
  { catalog_id: 'channel', category: 'game', name: 'Channel', platform: 'GameCube', region: 'NA', release_year: 2003 },
  { catalog_id: 'pokepark', category: 'game', name: 'PokéPark Wii: Pikachu\'s Adventure', platform: 'Wii', region: 'NA', release_year: 2009 },
  { catalog_id: 'pokepark2', category: 'game', name: 'PokéPark 2: Wonders Beyond', platform: 'Wii', region: 'NA', release_year: 2011 },

  // Colosseum / Ranger / Mystery Dungeon / Conquest
  { catalog_id: 'colosseum', category: 'game', name: 'Colosseum', platform: 'GameCube', region: 'NA', release_year: 2004 },
  { catalog_id: 'xd', category: 'game', name: 'XD: Gale of Darkness', platform: 'GameCube', region: 'NA', release_year: 2005 },
  { catalog_id: 'dash', category: 'game', name: 'Dash', platform: 'Nintendo DS', region: 'NA', release_year: 2005 },
  { catalog_id: 'trozei', category: 'game', name: 'Trozei!', platform: 'Nintendo DS', region: 'NA', release_year: 2006 },
  { catalog_id: 'ranger', category: 'game', name: 'Ranger', platform: 'Nintendo DS', region: 'NA', release_year: 2006 },
  { catalog_id: 'rangershadows', category: 'game', name: 'Ranger: Shadows of Almia', platform: 'Nintendo DS', region: 'NA', release_year: 2008 },
  { catalog_id: 'rangerguardian', category: 'game', name: 'Ranger: Guardian Signs', platform: 'Nintendo DS', region: 'NA', release_year: 2010 },
  { catalog_id: 'mdrescueteam', category: 'game', name: 'Mystery Dungeon: Red/Blue Rescue Team', platform: 'Game Boy Advance / DS', region: 'NA', release_year: 2006 },
  { catalog_id: 'mdexplorers', category: 'game', name: 'Mystery Dungeon: Explorers of Time/Darkness', platform: 'Nintendo DS', region: 'NA', release_year: 2008 },
  { catalog_id: 'mdsky', category: 'game', name: 'Mystery Dungeon: Explorers of Sky', platform: 'Nintendo DS', region: 'NA', release_year: 2009 },
  { catalog_id: 'mdgates', category: 'game', name: 'Mystery Dungeon: Gates to Infinity', platform: 'Nintendo 3DS', region: 'NA', release_year: 2013 },
  { catalog_id: 'mdrescueteamdx', category: 'game', name: 'Mystery Dungeon: Rescue Team DX', platform: 'Nintendo Switch', region: 'NA', release_year: 2020 },
  { catalog_id: 'conquest', category: 'game', name: 'Conquest', platform: 'Nintendo DS', region: 'NA', release_year: 2012 },
  { catalog_id: 'rumbleblast', category: 'game', name: 'Rumble Blast', platform: 'Nintendo 3DS', region: 'NA', release_year: 2011 },
  { catalog_id: 'rumbleworld', category: 'game', name: 'Rumble World', platform: 'Nintendo 3DS', region: 'NA', release_year: 2015 },
  { catalog_id: 'artacademy', category: 'game', name: 'Art Academy: Pokémon', platform: 'Nintendo 3DS', region: 'NA', release_year: 2016 },
  { catalog_id: 'detectivepikachu', category: 'game', name: 'Detective Pikachu', platform: 'Nintendo 3DS', region: 'NA', release_year: 2018 },
  { catalog_id: 'detectivepikachureturns', category: 'game', name: 'Detective Pikachu Returns', platform: 'Nintendo Switch', region: 'NA', release_year: 2023 },

  // Mobile / free-to-play (no physical media, but real official releases)
  { catalog_id: 'go', category: 'game', name: 'GO', platform: 'Mobile', region: 'NA', release_year: 2016 },
  { catalog_id: 'duel', category: 'game', name: 'Duel', platform: 'Mobile', region: 'NA', release_year: 2016 },
  { catalog_id: 'magikarpjump', category: 'game', name: 'Magikarp Jump', platform: 'Mobile', region: 'NA', release_year: 2017 },
  { catalog_id: 'questmobile', category: 'game', name: 'Quest', platform: 'Mobile / Switch', region: 'NA', release_year: 2018 },
  { catalog_id: 'masters', category: 'game', name: 'Masters EX', platform: 'Mobile', region: 'NA', release_year: 2019 },
  { catalog_id: 'cafemix', category: 'game', name: 'Café Mix', platform: 'Mobile / Switch', region: 'NA', release_year: 2020 },
  { catalog_id: 'smile', category: 'game', name: 'Smile', platform: 'Mobile', region: 'NA', release_year: 2020 },
  { catalog_id: 'unite', category: 'game', name: 'Unite', platform: 'Mobile / Switch', region: 'NA', release_year: 2021 },
  { catalog_id: 'sleep', category: 'game', name: 'Sleep', platform: 'Mobile', region: 'NA', release_year: 2023 },
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
