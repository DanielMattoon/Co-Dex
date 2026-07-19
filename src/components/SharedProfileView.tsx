import { useSearchParams } from 'react-router-dom';
import { decodeSharedProfile } from '../services/profileShare';

/**
 * The read-only page a shared profile link actually opens to — deliberately
 * outside the app's console-frame chrome (no bottom nav, no active Dex,
 * nothing that implies the viewer has their own data here) since whoever
 * opens this link is very likely not the person who generated it.
 */
export function SharedProfileView() {
  const [searchParams] = useSearchParams();
  const encoded = searchParams.get('data');
  const profile = encoded ? decodeSharedProfile(encoded) : null;

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 p-6 text-center text-xs text-slate-400">
        <p>This profile link is missing or couldn't be read.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md text-xs">
        <p className="mb-1 text-center text-[9px] uppercase tracking-wide text-slate-500">Co-Dex Trainer Profile</p>
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <p className="font-retro text-[14px] text-cyan-300">{profile.trainerName}</p>
          <p className="mt-1 text-slate-500">Shared {new Date(profile.generatedAt).toLocaleDateString()}</p>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-slate-100">{profile.stats.totalSpecimens}</p>
              <p className="text-slate-500">Specimens</p>
            </div>
            <div>
              <p className="text-slate-100">{profile.stats.uniqueSpecies}</p>
              <p className="text-slate-500">Species</p>
            </div>
            <div>
              <p className="text-amber-300">{profile.stats.shinyCount}</p>
              <p className="text-slate-500">Shiny</p>
            </div>
            <div>
              <p className="text-slate-100">{profile.stats.gamesOwned}</p>
              <p className="text-slate-500">Games</p>
            </div>
          </div>
        </div>

        {profile.badgesEarned.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <p className="mb-2 font-retro text-[9px] text-amber-300">Trophy Case</p>
            <ul className="flex flex-col gap-1">
              {profile.badgesEarned.map((name) => (
                <li key={name} className="text-amber-300">★ {name}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <p className="mb-1 font-retro text-[9px] text-amber-300">Wants &amp; Needs</p>
          <p className="text-slate-300">{profile.wantsAndNeeds.missingSpeciesCount} species not yet owned.</p>
          {profile.wantsAndNeeds.missingGames.length > 0 && (
            <p className="mt-1 text-slate-300">
              Missing games: <span className="text-slate-100">{profile.wantsAndNeeds.missingGames.join(', ')}</span>
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-slate-600">
          This is a snapshot from when it was shared — it won't update. Co-Dex is a free, local-first Pokémon companion app.
        </p>
      </div>
    </div>
  );
}
