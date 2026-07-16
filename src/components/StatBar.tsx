interface StatBarProps {
  label: string;
  value: number;
}

const TIERS = [
  { max: 59, color: 'bg-red-500', text: 'Poor' },
  { max: 89, color: 'bg-orange-500', text: 'Below Avg' },
  { max: 119, color: 'bg-green-500', text: 'Strong' },
  { max: 255, color: 'bg-cyan-400', text: 'Elite' },
] as const;

function getTier(value: number) {
  return TIERS.find((tier) => value <= tier.max) ?? TIERS[TIERS.length - 1];
}

export function StatBar({ label, value }: StatBarProps) {
  const tier = getTier(value);
  const pct = Math.min(100, (value / 255) * 100);

  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="w-10 shrink-0 uppercase tracking-wide text-slate-300">{label}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-sm border border-slate-600 bg-slate-800">
        <div className={`h-full ${tier.color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-slate-200">{value}</span>
      <span className="w-16 shrink-0 text-[10px] uppercase text-slate-400">{tier.text}</span>
    </div>
  );
}
