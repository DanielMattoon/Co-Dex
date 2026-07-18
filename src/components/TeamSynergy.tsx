import { useEffect, useState } from 'react';
import type { Team } from '../db/schema';
import { listTeams } from '../services/teambuilder';
import { analyzeTeamSynergy, type SynergyReport } from '../services/synergyAnalysis';
import { useActiveGameInstance } from '../hooks/useActiveGameInstance';

const CATEGORY_COLOR: Record<string, string> = {
  weak: 'text-red-400',
  resist: 'text-emerald-400',
  immune: 'text-cyan-300',
  neutral: 'text-slate-600',
};

function formatMultiplier(multiplier: number, category: string): string {
  if (category === 'neutral') return '·';
  if (category === 'immune') return '0';
  if (Number.isInteger(multiplier)) return `${multiplier}x`;
  // Resistances are fractions (1/2, 1/4) — show as a fraction rather than a decimal.
  return multiplier === 0.5 ? '½' : multiplier === 0.25 ? '¼' : `${multiplier}x`;
}

export function TeamSynergy() {
  const { gameInstanceId } = useActiveGameInstance();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [report, setReport] = useState<SynergyReport | null>(null);

  useEffect(() => {
    if (!gameInstanceId) return;
    listTeams(gameInstanceId).then((t) => {
      setTeams(t);
      if (t.length > 0) setSelectedId(t[0].team_id);
    });
  }, [gameInstanceId]);

  useEffect(() => {
    const team = teams.find((t) => t.team_id === selectedId);
    if (!team) {
      setReport(null);
      return;
    }
    setReport(analyzeTeamSynergy(team.slots));
  }, [selectedId, teams]);

  if (teams.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Save a team in the Builder tab first — Synergy analyzes saved teams.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
      >
        {teams.map((t) => (
          <option key={t.team_id} value={t.team_id}>
            {t.name}
          </option>
        ))}
      </select>

      {report && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2">
          {report.teammates.length === 0 ? (
            <p className="text-slate-500">This team has no Pokémon in it yet.</p>
          ) : (
            <>
              <p className="mb-1 font-retro text-[9px] text-slate-300">Defensive Coverage</p>
              <div className="mb-3 overflow-x-auto">
                <table className="border-collapse text-[10px]">
                  <thead>
                    <tr>
                      <th className="p-0.5 text-left text-slate-500"> </th>
                      {report.teammates.map((tm) => (
                        <th key={tm.species} className="p-0.5 text-slate-400" title={tm.species}>
                          {tm.species.slice(0, 4)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.teammates[0].matchups.map((_, typeIndex) => {
                      const type = report.teammates[0].matchups[typeIndex].type;
                      return (
                        <tr key={type}>
                          <td className="p-0.5 text-slate-400">{type}</td>
                          {report.teammates.map((tm) => {
                            const m = tm.matchups[typeIndex];
                            return (
                              <td key={tm.species} className={`p-0.5 text-center ${CATEGORY_COLOR[m.category]}`}>
                                {formatMultiplier(m.multiplier, m.category)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mb-1 font-retro text-[9px] text-slate-300">Shared Weaknesses</p>
              {report.sharedWeaknesses.length === 0 ? (
                <p className="mb-3 text-slate-500">No type hits more than one teammate hard.</p>
              ) : (
                <p className="mb-3 text-slate-300">
                  {report.sharedWeaknesses.map((w) => `${w.type} (${w.count})`).join(', ')}
                </p>
              )}

              <p className="mb-1 font-retro text-[9px] text-slate-300">Coverage Gaps</p>
              {report.coverageGaps.length === 0 ? (
                <p className="text-emerald-400">Your moves hit every type at least neutrally.</p>
              ) : (
                <p className="text-red-400">
                  Your team has no super-effective answer to: {report.coverageGaps.join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
