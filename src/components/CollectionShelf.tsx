import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CollectibleCatalogItem } from '../db/schema';
import { addCopy, ensureSeedCatalog, removeCopy } from '../services/collectibles';

const PLATFORM_COLOR: Record<string, string> = {
  'Game Boy': '#22c55e',
  'Game Boy Color': '#eab308',
  'Game Boy Advance': '#8b5cf6',
  'Nintendo DS': '#38bdf8',
  'Nintendo 3DS': '#f472b6',
  'Nintendo Switch': '#f87171',
};

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
      <span className="text-[9px] text-slate-500">{item.release_year}</span>
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

  useEffect(() => {
    ensureSeedCatalog().then(() => setReady(true));
  }, []);

  const catalog = useLiveQuery(() => db.collectible_catalog.toArray(), [ready]) ?? [];
  const allCopies = useLiveQuery(() => db.collectible_copies.toArray(), [ready]) ?? [];

  const ownedCatalogIds = useMemo(() => new Set(allCopies.map((c) => c.catalog_id)), [allCopies]);
  const visibleCatalog = ownedOnly ? catalog.filter((c) => ownedCatalogIds.has(c.catalog_id)) : catalog;
  const selectedItem = catalog.find((c) => c.catalog_id === selectedId) ?? null;
  const selectedCopies = allCopies.filter((c) => c.catalog_id === selectedId);

  const completion = catalog.length > 0 ? Math.round((ownedCatalogIds.size / catalog.length) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-900">
          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${completion}%` }} />
        </div>
        <span className="shrink-0 text-slate-400">
          {ownedCatalogIds.size}/{catalog.length}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOwnedOnly((v) => !v)}
        className={[
          'self-start rounded-md border px-2.5 py-1 text-[10px]',
          ownedOnly
            ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
            : 'border-slate-700 text-slate-400 hover:bg-slate-800/60',
        ].join(' ')}
      >
        {ownedOnly ? 'Showing Owned' : 'Showing All'}
      </button>

      <div className="grid flex-1 auto-rows-min grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        {visibleCatalog.map((item) => (
          <CatalogTile
            key={item.catalog_id}
            item={item}
            owned={ownedCatalogIds.has(item.catalog_id)}
            active={selectedId === item.catalog_id}
            onSelect={() => {
              setSelectedId(item.catalog_id);
              setFormOpen(false);
            }}
          />
        ))}
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
          {['CIB', 'Loose', 'Sealed', 'New', 'Box-Only', 'Manual-Only'].map((c) => (
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
