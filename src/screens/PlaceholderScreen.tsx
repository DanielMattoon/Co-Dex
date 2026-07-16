interface PlaceholderScreenProps {
  title: string;
  note: string;
}

export function PlaceholderScreen({ title, note }: PlaceholderScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="font-retro text-xs text-slate-300">{title}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}
