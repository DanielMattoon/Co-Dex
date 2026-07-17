interface QueryBarProps {
  value: string;
  onChange: (value: string) => void;
}

/** Dynamic Tagging query bar (PRD 15.3) — tag:"X", ball:"X", from:XX, dex:###, plus fuzzy name fallback. */
export function QueryBar({ value, onChange }: QueryBarProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Search… e.g. tag:"trade bait" dex:25 ball:"premier"'
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-400"
      />
      {value && <p className="text-[10px] text-slate-600">Operators: tag:"X" · ball:"X" · from:XX · dex:### · plain text = name search</p>}
    </div>
  );
}
