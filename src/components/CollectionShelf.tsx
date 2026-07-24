import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CollectibleCatalogItem } from '../db/schema';
import { addCopy, ensureSeedCatalog, removeCopy } from '../services/collectibles';

const PLATFORM_COLOR: Record<string, string> = {
  'Game Boy': '#22c55e',
  'Game Boy Color': '#eab308',
  'Game Boy Advance': '#8b5cf6',
  'Nintendo 64': '#fb923c',
  GameCube: '#818cf8',
  'Nintendo DS': '#38bdf8',
  Wii: '#e2e8f0',
  'Wii U': '#60a5fa',
  'Nintendo 3DS': '#f472b6',
  'Nintendo Switch': '#f87171',
};

const FRANCHISE_LABEL: Record<string, string> = {
  stadium: 'Stadium',
  snap: 'Snap',
  colosseum: 'Colosseum / XD',
  ranger: 'Ranger',
  'mystery-dungeon': 'Mystery Dungeon',
  pinball: 'Pinball',
  pokepark: 'PokéPark',
  pokken: 'Pokkén Tournament',
  'detective-pikachu': 'Detective Pikachu',
  trozei: 'Trozei',
  rumble: 'Rumble',
};

/** Consoles present in the catalog, in hardware-generation order — drives the filter dropdown. */
const CONSOLE_ORDER = [
  'Game Boy',
  'Game Boy Color',
  'Game Boy Advance',
  'Nintendo 64',
  'GameCube',
  'Nintendo DS',
  'Wii',
  'Wii U',
  'Nintendo 3DS',
  'Nintendo Switch',
];

// Fixed pixel tiles (same approach as the Pokédex box grid's TILE_PX) —
// keeps every tile the same real-world size instead of stretching to fill
// whatever width the container happens to have, and lets us pad an
// incomplete last row out into a full, even rectangle.
const SHELF_TILE_PX = 92;
const SHELF_COLUMNS = 4;

function CatalogTile({
  item,
  owned,
  active,
  onSelect,
}: {
  item: CollectibleCatalogItem;
  owned: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const color = PLATFORM_COLOR[item.platform] ?? '#94a3b8';
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ width: SHELF_TILE_PX }}
      className={[
        'flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all',
        active ? 'border-cyan-400' : 'border-slate-700',
        owned ? '' : 'opacity-40 grayscale',
      ].join(' ')}
    >
      <div
        className="h-14 w-10 rounded-sm border-2 border-slate-900"
        style={{ backgroundColor: color, boxShadow: `inset 0 0 0 3px rgba(0,0,0,0.25)` }}
      />
      <span className="text-[10px] text-slate-200">{item.name}</span>
      <span className="text-[9px] text-slate-500">
        {item.release_year}
        {item.digital_only ? ' · Digital' : ''}
      </span>
    </button>
  );
}

/**
 * A collapsed multi-entry spin-off series (Mystery Dungeon, Ranger, ...) —
 * the same slide-open/collapse mechanic the Pokédex grid uses for
 * multi-form species (SpeciesGrid's Variant Slide), applied here so a
 * franchise with five sub-titles doesn't drown out standalone spin-offs at
 * a glance. Tapping the tile itself slides it open into one tile per
 * member; a family is never "owned" on its own, so it's never desaturated.
 */
function FamilyTile({
  label,
  count,
  ownedCount,
  onExpand,
}: {
  label: string;
  count: number;
  ownedCount: number;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Slide open ${count} ${label} titles`}
      style={{ width: SHELF_TILE_PX }}
      className="flex flex-col items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 p-2 text-center transition-all hover:bg-violet-500/20"
    >
      <div className="relative h-14 w-10">
        <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-sm border-2 border-slate-900 bg-slate-700" />
        <div className="absolute inset-0 rounded-sm border-2 border-slate-900 bg-violet-500" style={{ boxShadow: 'inset 0 0 0 3px rgba(0,0,0,0.25)' }} />
      </div>
      <span className="text-[10px] text-violet-200">{label}</span>
      <span className="text-[9px] text-slate-500">
        {ownedCount}/{count} · tap to expand
      </span>
    </button>
  );
}

/**
 * Game Collection (PRD 22) — tracks physical media owned in real life,
 * separate from the Vault (which tracks in-game species). Catalog tiles use
 * original app-drawn placeholders rather than real box art (see
 * collectibles.ts's note on the missing TheGamesDB key); the ownership
 * mechanics — desaturate-until-owned, multiple copies per title, condition/
 * grading/acquisition tracking — are the real functional core of this
 * screen and work exactly as PRD 22.1/22.2 describe.
 */
export function CollectionShelf() {
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mainlineOnly, setMainlineOnly] = useState(true);
  const [consoleFilter, setConsoleFilter] = useState('all');
  const [slidOpenFamilies, setSlidOpenFamilies] = useState<Set<string>>(new Set());

  useEffect(() => {
    ensureSeedCatalog().then(() => setReady(true));
  }, []);

  const catalog = useLiveQuery(() => db.collectible_catalog.toArray(), [ready]) ?? [];
  const allCopies = useLiveQuery(() => db.collectible_copies.toArray(), [ready]) ?? [];

  const ownedCatalogIds = useMemo(() => new Set(allCopies.map((c) => c.catalog_id)), [allCopies]);

  const availableConsoles = useMemo(
    () => CONSOLE_ORDER.filter((platform) => catalog.some((c) => c.platform === platform)),
    [catalog],
  );

  // Chronological, mainline-default, console-only — per the standing filter
  // defaults; mobile-only F2P titles never enter the catalog at all (see
  // collectibles.ts), so "consoles only" is already true by construction.
  // "digital" is a synthetic filter value (not a real platform) that cuts
  // across hardware to isolate eShop-only titles regardless of which
  // console they ran on.
  const scopedCatalog = useMemo(() => {
    return [...catalog]
      .filter((c) => (mainlineOnly ? c.is_mainline : true))
      .filter((c) => {
        if (consoleFilter === 'all') return true;
        if (consoleFilter === 'digital') return c.digital_only;
        return c.platform === consoleFilter;
      })
      .sort((a, b) => a.release_order - b.release_order);
  }, [catalog, mainlineOnly, consoleFilter]);

  const visibleCatalog = ownedOnly ? scopedCatalog.filter((c) => ownedCatalogIds.has(c.catalog_id)) : scopedCatalog;

  // Group multi-entry spin-off series into one collapsed family tile unless
  // that family has been slid open (mirrors SpeciesGrid's Variant Slide).
  const displayList = useMemo(() => {
    const out: Array<{ kind: 'item'; item: CollectibleCatalogItem } | { kind: 'family'; key: string; label: string; items: CollectibleCatalogItem[] }> = [];
    const seenFamilies = new Set<string>();
    for (const item of visibleCatalog) {
      if (item.franchise && !slidOpenFamilies.has(item.franchise)) {
        if (seenFamilies.has(item.franchise)) continue;
        seenFamilies.add(item.franchise);
        const members = visibleCatalog.filter((c) => c.franchise === item.franchise);
        if (members.length > 1) {
          out.push({ kind: 'family', key: item.franchise, label: FRANCHISE_LABEL[item.franchise] ?? item.franchise, items: members });
          continue;
        }
      }
      out.push({ kind: 'item', item });
    }
    return out;
  }, [visibleCatalog, slidOpenFamilies]);

  function toggleFamily(key: string) {
    setSlidOpenFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedItem = catalog.find((c) => c.catalog_id === selectedId) ?? null;
  const selectedCopies = allCopies.filter((c) => c.catalog_id === selectedId);

  const completion = scopedCatalog.length > 0 ? Math.round((ownedCatalogIds.size / scopedCatalog.length) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-900">
          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${completion}%` }} />
        </div>
        <span className="shrink-0 text-slate-400">
          {scopedCatalog.filter((c) => ownedCatalogIds.has(c.catalog_id)).length}/{scopedCatalog.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOwnedOnly((v) => !v)}
          className={[
            'rounded-md border px-2.5 py-1 text-[10px]',
            ownedOnly
              ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
          ].join(' ')}
        >
          {ownedOnly ? 'Showing Owned' : 'Showing All'}
        </button>

        <button
          type="button"
          onClick={() => setMainlineOnly((v) => !v)}
          title={mainlineOnly ? 'Showing the 37 mainline RPGs only' : 'Showing mainline + spin-off series'}
          className={[
            'rounded-md border px-2.5 py-1 text-[10px]',
            mainlineOnly
              ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
              : 'border-amber-500/50 bg-amber-500/20 text-amber-300',
          ].join(' ')}
        >
          {mainlineOnly ? 'Mainline Only' : 'Mainline + Spin-Offs'}
        </button>

        <select
          value={consoleFilter}
          onChange={(e) => setConsoleFilter(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-cyan-400"
        >
          <option value="all">All Consoles</option>
          <option value="digital">Digital (eShop)</option>
          {availableConsoles.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <div
          className="grid auto-rows-min justify-center gap-2"
          style={{ gridTemplateColumns: `repeat(${SHELF_COLUMNS}, ${SHELF_TILE_PX}px)` }}
        >
          {displayList.map((entry) =>
            entry.kind === 'family' ? (
              <FamilyTile
                key={entry.key}
                label={entry.label}
                count={entry.items.length}
                ownedCount={entry.items.filter((i) => ownedCatalogIds.has(i.catalog_id)).length}
                onExpand={() => toggleFamily(entry.key)}
              />
            ) : (
              <div key={entry.item.catalog_id} className="relative">
                {entry.item.franchise && (
                  <button
                    type="button"
                    onClick={() => toggleFamily(entry.item.franchise!)}
                    title={`Collapse ${FRANCHISE_LABEL[entry.item.franchise] ?? entry.item.franchise} back into one tile`}
                    className="absolute right-0.5 top-0.5 z-10 rounded bg-slate-950/70 px-1 text-[9px] text-violet-300 hover:text-violet-200"
                  >
                    ↺
                  </button>
                )}
                <CatalogTile
                  item={entry.item}
                  owned={ownedCatalogIds.has(entry.item.catalog_id)}
                  active={selectedId === entry.item.catalog_id}
                  onSelect={() => {
                    setSelectedId(entry.item.catalog_id);
                    setFormOpen(false);
                  }}
                />
              </div>
            ),
          )}
          {/* Pad the last row out to a full width so the grid always ends as an even rectangle instead of a lone orphaned tile. */}
          {Array.from({ length: (SHELF_COLUMNS - (displayList.length % SHELF_COLUMNS)) % SHELF_COLUMNS }).map((_, i) => (
            <div key={`pad-${i}`} style={{ width: SHELF_TILE_PX }} className="rounded-lg border border-dashed border-slate-800/50" />
          ))}
        </div>
      </div>

      {selectedItem && (
        <div className="max-h-[45%] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-retro text-[9px] text-slate-200">{selectedItem.name}</span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              close
            </button>
          </div>
          <p className="mb-2 text-slate-500">
            {selectedItem.platform} · {selectedItem.region} · {selectedItem.release_year}
          </p>

          <ul className="mb-2 flex flex-col gap-1.5">
            {selectedCopies.map((copy) => (
              <li key={copy.copy_id} className="rounded border border-slate-700 bg-slate-900/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200">{copy.condition}</span>
                  <button
                    type="button"
                    onClick={() => void removeCopy(copy.copy_id, selectedItem.name)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    remove
                  </button>
                </div>
                {copy.grading.is_graded && (
                  <p className="text-amber-300">
                    {copy.grading.company} {copy.grading.grade}
                  </p>
                )}
                {copy.acquisition.purchase_price !== null && (
                  <p className="text-slate-500">
                    ₽{copy.acquisition.purchase_price}
                    {copy.acquisition.source ? ` · ${copy.acquisition.source}` : ''}
                  </p>
                )}
              </li>
            ))}
            {selectedCopies.length === 0 && <p className="text-slate-500">No copies logged yet.</p>}
          </ul>

          {formOpen ? (
            <AddCopyForm
              catalogId={selectedItem.catalog_id}
              catalogName={selectedItem.name}
              onDone={() => setFormOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30"
            >
              + Add a copy
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddCopyForm({
  catalogId,
  catalogName,
  onDone,
}: {
  catalogId: string;
  catalogName: string;
  onDone: () => void;
}) {
  const [condition, setCondition] = useState('CIB');
  const [isGraded, setIsGraded] = useState(false);
  const [gradingCompany, setGradingCompany] = useState('WATA');
  const [grade, setGrade] = useState('');
  const [price, setPrice] = useState('');
  const [source, setSource] = useState('');

  async function handleSubmit() {
    await addCopy({
      catalogId,
      catalogName,
      condition,
      isGraded,
      gradingCompany,
      grade,
      purchasePrice: price ? Number(price) : null,
      purchaseDate: new Date().toISOString().slice(0, 10),
      source,
    });
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-700 bg-slate-900/60 p-2">
      <div className="flex gap-2">
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        >
          {['CIB', 'Loose', 'Sealed', 'New', 'Box-Only', 'Manual-Only', 'Digital'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          type="number"
          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        />
      </div>
      <input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source (e.g. Local game store)"
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
      />
      <label className="flex items-center gap-1.5 text-slate-400">
        <input
          type="checkbox"
          checked={isGraded}
          onChange={(e) => setIsGraded(e.target.checked)}
          className="accent-amber-400"
        />
        Graded
      </label>
      {isGraded && (
        <div className="flex gap-2">
          <select
            value={gradingCompany}
            onChange={(e) => setGradingCompany(e.target.value)}
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
          >
            {['WATA', 'VGA', 'AFA'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Grade (e.g. 9.6 A+)"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-400 hover:bg-slate-800/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
