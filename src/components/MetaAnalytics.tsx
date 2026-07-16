import { useEffect, useRef, useState } from 'react';
import {
  KNOWN_FORMATS,
  getFormatUsage,
  getPokemonMetaProfile,
  type PokemonMetaProfile,
  type UsageEntry,
} from '../services/smogonStats';

export function MetaAnalytics() {
  const [format, setFormat] = useState<string>(KNOWN_FORMATS[0]);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<PokemonMetaProfile | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against out-of-order async responses: if format/selection changes
  // again before an in-flight request resolves, the stale response is
  // dropped instead of overwriting newer state.
  const listRequestId = useRef(0);
  const profileRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++listRequestId.current;
    setLoadingList(true);
    setError(null);
    setSelected(null);
    setProfile(null);
    getFormatUsage(format)
      .then((entries) => {
        if (listRequestId.current !== requestId) return;
        setUsage(entries.slice(0, 30));
      })
      .catch((e) => {
        if (listRequestId.current !== requestId) return;
        setError(e instanceof Error ? e.message : 'Failed to load usage stats');
      })
      .finally(() => {
        if (listRequestId.current !== requestId) return;
        setLoadingList(false);
      });
  }, [format]);

  useEffect(() => {
    if (!selected) return;
    const requestId = ++profileRequestId.current;
    setLoadingProfile(true);
    getPokemonMetaProfile(format, selected)
      .then((p) => {
        if (profileRequestId.current !== requestId) return;
        setProfile(p);
      })
      .catch((e) => {
        if (profileRequestId.current !== requestId) return;
        setError(e instanceof Error ? e.message : 'Failed to load profile');
      })
      .finally(() => {
        if (profileRequestId.current !== requestId) return;
        setLoadingProfile(false);
      });
  }, [format, selected]);

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
      >
        {KNOWN_FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {error && <p className="text-red-400">{error}</p>}

      {!selected && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40">
          {loadingList && <p className="p-2 text-slate-500">Loading usage stats…</p>}
          <ul>
            {usage.map((entry, i) => (
              <li key={entry.species}>
                <button
                  type="button"
                  onClick={() => setSelected(entry.species)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left hover:bg-slate-700/60"
                >
                  <span className="text-slate-300">
                    {i + 1}. {entry.species}
                  </span>
                  <span className="text-slate-500">{(entry.usage * 100).toFixed(1)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-retro text-[9px] text-slate-200">{selected}</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              back
            </button>
          </div>
          {loadingProfile && <p className="text-slate-500">Loading…</p>}
          {profile && (
            <div className="flex flex-col gap-3">
              <p className="text-emerald-400">Usage: {(profile.usage * 100).toFixed(1)}%</p>
              <div>
                <p className="text-slate-400">Abilities</p>
                <p className="text-slate-200">
                  {profile.topAbilities.map((a) => `${a.name} (${(a.share * 100).toFixed(0)}%)`).join(', ')}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Items</p>
                <p className="text-slate-200">
                  {profile.topItems.map((it) => `${it.name} (${(it.share * 100).toFixed(0)}%)`).join(', ')}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Moves</p>
                <p className="text-slate-200">
                  {profile.topMoves.map((m) => `${m.name} (${(m.share * 100).toFixed(0)}%)`).join(', ')}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Common Counters</p>
                <p className="text-slate-200">{profile.topCounters.map((c) => c.name).join(', ')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
