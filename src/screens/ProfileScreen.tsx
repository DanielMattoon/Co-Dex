import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { getOrCreateTrainerProfile, setTrainerName } from '../services/gameInstances';
import { computeBadges, type Badge } from '../services/badges';
import { renderCertificate, downloadCertificate } from '../services/certificates';
import { getWantsAndNeeds, type WantsAndNeeds } from '../services/wantsAndNeeds';
import { Dashboards } from '../components/Dashboards';

/**
 * Trainer Profile / Social Trade Hub (PRD 12.1, 12.4). Ships the Passive
 * Bulletin half of Section 12: a self-contained, exportable snapshot view
 * (stats, badges, Wants & Needs) generated entirely from local Vault data.
 * There's no hosted profiles service in this $0/serverless build (PRD
 * 12.3), so "shareable URL" here means the Export Snapshot download below —
 * a JSON card meant for pasting into Discord/a trade post, not a live link.
 * The async Active Trade Inquiry flow (12.2) stays designed-for-not-built,
 * exactly as the PRD specifies, since it needs a persistent backend.
 */
export function ProfileScreen() {
  const profile = useLiveQuery(() => getOrCreateTrainerProfile(), []);
  const allVault = useLiveQuery(() => db.vault.toArray(), []) ?? [];
  const allCopies = useLiveQuery(() => db.collectible_copies.toArray(), []) ?? [];
  const instances = useLiveQuery(() => db.game_instances.toArray(), []) ?? [];

  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [wants, setWants] = useState<WantsAndNeeds | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    // Depend on the array references, not their lengths — useLiveQuery hands
    // back a new array whenever any watched row changes, including
    // field-only edits (e.g. toggling a specimen's shiny flag) that don't
    // change the row count but do change badge progress.
    computeBadges().then(setBadges).catch(() => setBadges([]));
    getWantsAndNeeds().then(setWants).catch(() => setWants({ missingSpecies: [], missingGames: [] }));
  }, [allVault, allCopies, instances]);

  useEffect(() => {
    if (profile) setNameDraft(profile.trainer_name);
  }, [profile]);

  const uniqueSpecies = new Set(allVault.map((e) => e.pokemon_id)).size;
  const shinyCount = allVault.filter((e) => e.shiny).length;

  async function saveName() {
    await setTrainerName(nameDraft.trim() || 'Trainer');
    setEditingName(false);
  }

  function exportSnapshot() {
    const snapshot = {
      trainerName: profile?.trainer_name ?? 'Trainer',
      stats: { totalSpecimens: allVault.length, uniqueSpecies, shinyCount, gamesOwned: new Set(allCopies.map((c) => c.catalog_id)).size },
      badgesEarned: (badges ?? []).filter((b) => b.earned).map((b) => b.name),
      wantsAndNeeds: {
        missingSpeciesCount: wants?.missingSpecies.length ?? 0,
        missingGames: wants?.missingGames.map((g) => g.name) ?? [],
      },
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codex-profile-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCertificate(badge: Badge) {
    const dataUrl = renderCertificate(badge, profile?.trainer_name ?? 'Trainer');
    if (dataUrl) downloadCertificate(dataUrl, badge.id);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto text-xs">
      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
            />
            <button type="button" onClick={() => void saveName()} className="rounded border border-emerald-500/50 px-2 py-1 text-emerald-300">
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="font-retro text-[12px] text-cyan-300">{profile?.trainer_name ?? 'Trainer'}</p>
            <button type="button" onClick={() => setEditingName(true)} className="text-[10px] text-slate-400 hover:underline">
              Edit name
            </button>
          </div>
        )}
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-slate-100">{allVault.length}</p>
            <p className="text-slate-500">Specimens</p>
          </div>
          <div>
            <p className="text-slate-100">{uniqueSpecies}</p>
            <p className="text-slate-500">Species</p>
          </div>
          <div>
            <p className="text-amber-300">{shinyCount}</p>
            <p className="text-slate-500">Shiny</p>
          </div>
          <div>
            <p className="text-slate-100">{profile?.link_cable_trade_count ?? 0}</p>
            <p className="text-slate-500">Trades</p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportSnapshot}
          className="mt-2 w-full rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-cyan-300"
        >
          Export Profile Snapshot (JSON)
        </button>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-2 font-retro text-[9px] text-amber-300">Trophy Case</p>
        <div className="flex flex-col gap-2">
          {(badges ?? []).map((badge) => (
            <div key={badge.id} className="rounded border border-slate-700 bg-slate-900/60 p-2">
              <div className="flex items-center justify-between">
                <p className={badge.earned ? 'text-amber-300' : 'text-slate-300'}>
                  {badge.earned ? '★ ' : ''}
                  {badge.name}
                </p>
                <span className="text-slate-500">{badge.progressLabel}</span>
              </div>
              <p className="text-slate-500">{badge.description}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
                <div
                  className={`h-full transition-all ${badge.earned ? 'bg-amber-400' : 'bg-cyan-400'}`}
                  style={{ width: `${Math.round(badge.progress * 100)}%` }}
                />
              </div>
              {badge.earned && badge.certificateEligible && (
                <button
                  type="button"
                  onClick={() => handleCertificate(badge)}
                  className="mt-1 rounded border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/10"
                >
                  Download Certificate
                </button>
              )}
            </div>
          ))}
          {badges === null && <p className="text-slate-500">Loading badges…</p>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-2 font-retro text-[9px] text-amber-300">Wants &amp; Needs Sheet</p>
        {wants ? (
          <>
            <p className="text-slate-300">{wants.missingSpecies.length} species not yet owned.</p>
            {wants.missingGames.length > 0 && (
              <p className="mt-1 text-slate-300">
                Missing games: <span className="text-slate-100">{wants.missingGames.map((g) => g.name).join(', ')}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-500">Loading…</p>
        )}
      </div>

      <Dashboards />
    </div>
  );
}
