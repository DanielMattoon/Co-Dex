import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Generations } from '@smogon/calc';
import { db, type Team, type TeamSlot } from '../db/schema';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';
import { SpeciesPicker } from './SpeciesPicker';
import {
  deleteTeam,
  emptySlot,
  exportShowdownTeam,
  listTeams,
  parseShowdownTeam,
  saveTeam,
} from '../services/teambuilder';

const GEN = Generations.get(9);
const ALL_SPECIES = [...GEN.species].map((s) => s.name).sort();
const ALL_MOVES = ['(none)', ...[...GEN.moves].map((m) => m.name).sort()];
const ALL_NATURES = [...GEN.natures].map((n) => n.name).sort();

const EV_LABELS: [keyof TeamSlot['evs'], string][] = [
  ['hp', 'HP'],
  ['atk', 'Atk'],
  ['def', 'Def'],
  ['spa', 'SpA'],
  ['spd', 'SpD'],
  ['spe', 'Spe'],
];

function emptyTeamSlots(): TeamSlot[] {
  return Array.from({ length: 6 }, () => emptySlot(''));
}

/**
 * Vault-Aware Teambuilder + Showdown Tiers 1-2 (PRD 8.1, 8.3). Team slots
 * are edited freely (any species/move/item combination — legality checking
 * against the source game isn't in scope here, that's the Sandbox/Strict
 * transfer engine's job for actual Vault specimens). Each filled slot with
 * a species already caught in the active save surfaces that ownership,
 * per 8.1's "you already own a battle-ready X" example.
 */
export function Teambuilder() {
  const { gameInstanceId } = useActiveGameInstance();
  const vaultEntries = useLiveQuery(
    () => (gameInstanceId ? db.vault.where('current_game_instance_id').equals(gameInstanceId).toArray() : []),
    [gameInstanceId],
  );
  const ownedSpecies = new Set((vaultEntries ?? []).map((e) => e.species));

  const [slots, setSlots] = useState<TeamSlot[]>(emptyTeamSlots());
  const [teamName, setTeamName] = useState('New Team');
  const [currentTeamId, setCurrentTeamId] = useState<string | undefined>(undefined);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [savedTeams, setSavedTeams] = useState<Team[]>([]);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshTeams() {
    if (!gameInstanceId) return;
    setSavedTeams(await listTeams(gameInstanceId));
  }
  useEffect(() => {
    void refreshTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameInstanceId]);

  function updateSlot(index: number, patch: Partial<TeamSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateMove(index: number, moveIndex: number, value: string) {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const moves = [...s.moves];
        moves[moveIndex] = value === '(none)' ? '' : value;
        return { ...s, moves };
      }),
    );
  }

  function updateEv(index: number, stat: keyof TeamSlot['evs'], value: number) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, evs: { ...s.evs, [stat]: value } } : s)));
  }

  async function handleSave() {
    if (!gameInstanceId) return;
    const id = await saveTeam(gameInstanceId, teamName, slots, currentTeamId);
    setCurrentTeamId(id);
    await refreshTeams();
    setMessage(`Saved "${teamName}".`);
  }

  function handleNew() {
    setSlots(emptyTeamSlots());
    setTeamName('New Team');
    setCurrentTeamId(undefined);
    setSelectedIndex(0);
    setMessage(null);
  }

  function handleLoad(team: Team) {
    setSlots(team.slots.map((s) => ({ ...s, moves: [...s.moves] })));
    setTeamName(team.name);
    setCurrentTeamId(team.team_id);
    setSelectedIndex(0);
    setMessage(`Loaded "${team.name}".`);
  }

  async function handleDelete(team: Team) {
    await deleteTeam(team.team_id, team.name);
    if (currentTeamId === team.team_id) handleNew();
    await refreshTeams();
  }

  function handleImport() {
    const parsed = parseShowdownTeam(importText).slice(0, 6);
    const next = emptyTeamSlots();
    parsed.forEach((slot, i) => {
      next[i] = slot;
    });
    setSlots(next);
    setShowImport(false);
    setImportText('');
    setMessage(`Imported ${parsed.length} Pokémon from Showdown text.`);
  }

  function handleExport() {
    setExportText(exportShowdownTeam(slots));
  }

  function handlePushToBattle() {
    const text = exportShowdownTeam(slots);
    navigator.clipboard?.writeText(text).catch(() => {});
    window.open('https://play.pokemonshowdown.com/teambuilder', '_blank', 'noopener');
    setMessage('Team copied — paste it into the Showdown teambuilder that just opened.');
  }

  const selected = slots[selectedIndex];

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          className="rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleNew}
          className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:bg-slate-800/60"
        >
          New
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1">
        {slots.map((slot, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelectedIndex(i)}
            className={[
              'truncate rounded border px-1 py-2 text-[9px]',
              selectedIndex === i ? 'border-cyan-400 bg-slate-900/80' : 'border-slate-700 bg-slate-900/40',
            ].join(' ')}
          >
            {slot.species || `Slot ${i + 1}`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
        <div className="mb-2">
          <SpeciesPicker
            instanceId={`team-slot-${selectedIndex}`}
            value={selected.species}
            onChange={(name) => updateSlot(selectedIndex, { species: name })}
            options={ALL_SPECIES}
            placeholder="(empty slot)"
          />
        </div>

        {selected.species && ownedSpecies.has(selected.species) && (
          <p className="mb-2 text-emerald-400">You already own a {selected.species} in your Vault.</p>
        )}

        {selected.species && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={selected.item}
                onChange={(e) => updateSlot(selectedIndex, { item: e.target.value })}
                placeholder="Held item"
                className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
              />
              <input
                value={selected.ability}
                onChange={(e) => updateSlot(selectedIndex, { ability: e.target.value })}
                placeholder="Ability"
                className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
              />
            </div>

            <select
              value={selected.nature}
              onChange={(e) => updateSlot(selectedIndex, { nature: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-400"
            >
              {ALL_NATURES.map((n) => (
                <option key={n} value={n}>
                  {n} Nature
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-1.5">
              {selected.moves.map((move, mi) => (
                <select
                  key={mi}
                  value={move || '(none)'}
                  onChange={(e) => updateMove(selectedIndex, mi, e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 outline-none focus:border-cyan-400"
                >
                  {ALL_MOVES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ))}
            </div>

            <div>
              <p className="mb-1 text-slate-500">
                EVs ({EV_LABELS.reduce((sum, [k]) => sum + selected.evs[k], 0)}/508)
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {EV_LABELS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1 text-slate-400">
                    {label}
                    <input
                      type="number"
                      min={0}
                      max={252}
                      value={selected.evs[key]}
                      onChange={(e) => updateEv(selectedIndex, key, Number(e.target.value) || 0)}
                      className="w-14 rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-200 outline-none focus:border-cyan-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {message && <p className="text-emerald-400">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60"
        >
          Import from Showdown
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800/60"
        >
          Export to Showdown
        </button>
        <button
          type="button"
          onClick={handlePushToBattle}
          className="rounded border border-red-500/40 px-2 py-1 text-red-300 hover:bg-red-500/10"
        >
          Push to Battle ↗
        </button>
      </div>

      {showImport && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste a Showdown export here…"
            rows={5}
            className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={handleImport}
            className="self-start rounded border border-cyan-500/50 bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
          >
            Parse & Load
          </button>
        </div>
      )}

      {exportText !== null && (
        <textarea
          readOnly
          value={exportText}
          rows={6}
          onFocus={(e) => e.currentTarget.select()}
          className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 outline-none"
        />
      )}

      {savedTeams.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          <p className="mb-1 font-retro text-[9px] text-slate-300">Saved Teams</p>
          <ul className="flex flex-col gap-1">
            {savedTeams.map((team) => (
              <li key={team.team_id} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleLoad(team)}
                  className="text-slate-300 hover:text-cyan-300"
                >
                  {team.name}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(team)}
                  className="text-[10px] text-red-400 hover:text-red-300"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
