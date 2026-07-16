import type { ReactNode } from 'react';

interface ConsoleFrameProps {
  /** Passive readouts: title, artwork, status metrics. Never interactive. */
  header: ReactNode;
  /** Primary content + controls. Must live in the bottom 60% thumb zone (PRD 2.1). */
  children: ReactNode;
  /** Always-accessible bottom control deck (nav). */
  nav: ReactNode;
}

/**
 * The handheld device shell: a 4:3 "screen" area (header + content) inside a
 * dark-glass bezel, with a fixed bottom control deck for nav — the "One-Handed
 * Thumb Zone" rule (PRD 2.1) and "Retro-Modern Console" aesthetic (PRD 2.3).
 */
export function ConsoleFrame({ header, children, nav }: ConsoleFrameProps) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 p-4">
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border-2 border-slate-700/60 bg-slate-900/70 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="flex aspect-[4/3] flex-col overflow-hidden border-b-2 border-slate-700/60 bg-slate-950/60">
          <div className="shrink-0 px-4 pt-4">{header}</div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        </div>
        <div className="shrink-0 bg-slate-900/90 p-3">{nav}</div>
      </div>
    </div>
  );
}
