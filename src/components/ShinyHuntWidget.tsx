import { useEffect, useMemo, useRef, useState } from 'react';
import { listAllSpeciesWithIds, getSpriteUrl, type SpeciesWithId } from '../services/pokeapi';
import {
  cumulativeProbability,
  formatOdds,
  formatPercent,
  perEncounterProbability,
  totalRolls,
  type OddsEra,
} from '../services/shinyOdds';
import { catchFromHunt } from '../services/shinyHunt';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';

function titleCase(name: string): string {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

function formatStopwatch(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Shiny Hunting Companion (PRD 11) — a full odds calculator (11.1) plus a
 * tactile tap-counter/stopwatch tracker (11.2) that converts straight into a
 * Vault entry on capture. The PRD frames 11.2 as a long-press/right-click
 * widget anchored to a PC box slot; the current box grid only allows
 * interaction on occupied slots, so this is built as a dedicated screen
 * instead — same tap+timer+live-odds+one-click-catch flow, reached
 * deliberately out of the main navigation rather than a prominent button.
 */
export function ShinyHuntWidget() {
  const { gameInstanceId } = useActiveGameInstance();
  const [species, setSpecies] = useState<SpeciesWithId[]>([]);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<SpeciesWithId | null>(null);
  const [level, setLevel] = useState(5);

  const [era, setEra] = useState<OddsEra>('gen6plus');
  const [shinyCharm, setShinyCharm] = useState(false);
  const [masuda, setMasuda] = useState(false);
  const [manualBonusRolls, setManualBonusRolls] = useState(0);

  const [encounters, setEncounters] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [caughtMessage, setCaughtMessage] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    listAllSpeciesWithIds().then(setSpecies).catch(() => setSpecies([]));
  }, []);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return species.filter((s) => s.name.includes(q.replace(/\s+/g, '-'))).slice(0, 20);
  }, [species, query]);

  const perEncounter = useMemo(
    () => perEncounterProbability({ era, shinyCharm, masudaMethod: masuda, manualBonusRolls }),
    [era, shinyCharm, masuda, manualBonusRolls],
  );
  const cumulative = cumulativeProbability(perEncounter, encounters);
  const rolls = totalRolls({ era, shinyCharm, masudaMethod: masuda, manualBonusRolls });

  function startHunt() {
    setEncounters(0);
    setElapsedSeconds(0);
    setCaughtMessage(null);
    setRunning(true);
  }

  function resetHunt() {
    setRunning(false);
    setEncounters(0);
    setElapsedSeconds(0);
    setCaughtMessage(null);
  }

  async function markCaught() {
    if (!target || !gameInstanceId) return;
    setRunning(false);
    await catchFromHunt(gameInstanceId, titleCase(target.name), target.pokemonId, level, encounters);
    setCaughtMessage(`Shiny ${titleCase(target.name)} added to your Vault!`);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto text-xs">
      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-1 font-retro text-[9px] text-amber-300">Target Species</p>
        {target ? (
          <div className="flex items-center gap-2">
            <img src={getSpriteUrl(target.pokemonId, true)} alt={target.name} className="h-12 w-12 [image-rendering:pixelated]" />
            <div className="flex-1">
              <p className="text-slate-200">{titleCase(target.name)}</p>
              <button type="button" onClick={() => { setTarget(null); resetHunt(); }} className="text-[10px] text-cyan-400 hover:underline">
                Change target
              </button>
            </div>
          </div>
        ) : (
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a species to hunt…"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
            />
            {filtered.length > 0 && (
              <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-slate-700 bg-slate-900">
                {filtered.map((s) => (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => setTarget(s)}
                      className="w-full px-2 py-1 text-left text-slate-300 hover:bg-slate-700/60"
                    >
                      {titleCase(s.name)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-2 font-retro text-[9px] text-amber-300">Odds Calculator</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-slate-300">
            <span>Era:</span>
            <select
              value={era}
              onChange={(e) => setEra(e.target.value as OddsEra)}
              className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-200"
            >
              <option value="gen6plus">Gen 6+ (1/4096)</option>
              <option value="gen1to5">Gen 1-5 (1/8192)</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={shinyCharm} onChange={(e) => setShinyCharm(e.target.checked)} disabled={era !== 'gen6plus'} />
            Shiny Charm
          </label>
          <label className="flex items-center gap-1 text-slate-300">
            <input type="checkbox" checked={masuda} onChange={(e) => setMasuda(e.target.checked)} />
            Masuda Method
          </label>
          <label className="flex items-center gap-1 text-slate-300">
            <span>Manual bonus rolls:</span>
            <input
              type="number"
              min={0}
              value={manualBonusRolls}
              onChange={(e) => setManualBonusRolls(Math.max(0, Number(e.target.value)))}
              className="w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-200"
            />
          </label>
        </div>
        <p className="mt-1 text-slate-500">
          Chain Fishing, DexNav, SOS chains, and Mass Outbreaks each use their own tier tables that vary by
          game — enter the extra rolls your method grants manually rather than trusting a guessed number.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="rounded border border-slate-700 bg-slate-900 p-2">
            <p className="text-slate-500">Per Encounter ({rolls} roll{rolls === 1 ? '' : 's'})</p>
            <p className="text-cyan-300">{formatOdds(perEncounter)}</p>
            <p className="text-slate-500">{formatPercent(perEncounter)}</p>
          </div>
          <div className="rounded border border-slate-700 bg-slate-900 p-2">
            <p className="text-slate-500">Cumulative ({encounters} so far)</p>
            <p className="text-emerald-300">{formatPercent(cumulative)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <p className="mb-2 font-retro text-[9px] text-amber-300">Hunt Tracker</p>
        <div className="flex items-center justify-between">
          <p className="font-retro text-[14px] text-slate-100">{formatStopwatch(elapsedSeconds)}</p>
          <p className="text-slate-300">Encounters: <span className="text-slate-100">{encounters}</span></p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {!running && encounters === 0 && (
            <button
              type="button"
              onClick={startHunt}
              disabled={!target}
              className="rounded-md border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 text-emerald-300 disabled:opacity-40"
            >
              Start Hunt
            </button>
          )}
          {running && (
            <button
              type="button"
              onClick={() => setEncounters((n) => n + 1)}
              className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300"
            >
              Encounter (+1)
            </button>
          )}
          {(running || encounters > 0) && (
            <button type="button" onClick={() => setRunning((r) => !r)} className="rounded-md border border-slate-700 px-2.5 py-1 text-slate-300">
              {running ? 'Pause' : 'Resume'}
            </button>
          )}
          {encounters > 0 && (
            <button type="button" onClick={resetHunt} className="rounded-md border border-slate-700 px-2.5 py-1 text-slate-400">
              Reset
            </button>
          )}
        </div>
        {target && encounters > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-slate-700 pt-2">
            <label className="flex items-center gap-1 text-slate-300">
              Level caught:
              <input
                type="number"
                min={1}
                max={100}
                value={level}
                onChange={(e) => setLevel(Math.max(1, Math.min(100, Number(e.target.value))))}
                className="w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-200"
              />
            </label>
            <button
              type="button"
              onClick={markCaught}
              disabled={!gameInstanceId}
              className="ml-auto rounded-md border border-amber-500/50 bg-amber-500/20 px-2.5 py-1 text-amber-300 disabled:opacity-40"
            >
              ✨ Caught it!
            </button>
          </div>
        )}
        {caughtMessage && <p className="mt-2 text-emerald-300">{caughtMessage}</p>}
      </div>
    </div>
  );
}
