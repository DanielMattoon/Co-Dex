import type { ReactNode } from 'react';

interface ConsoleFrameProps {
  /** Passive readouts: title, artwork, status metrics. Never interactive. */
  header: ReactNode;
  /** Primary content + controls. */
  children: ReactNode;
  /** Always-accessible bottom control deck (nav). */
  nav: ReactNode;
}

/**
 * The app shell: full-viewport, retro dark-glass theme, header pinned top
 * and nav pinned bottom with the content area filling everything in
 * between and scrolling independently. Previously a fixed 4:3 handheld
 * frame capped at 480px — dropped in favor of using the whole page, since
 * the Living Dex (and everything else) benefits from real width instead of
 * being squeezed into a phone-sized bezel on desktop.
 */
export function ConsoleFrame({ header, children, nav }: ConsoleFrameProps) {
  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="shrink-0 border-b-2 border-slate-700/60 bg-slate-900/70 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto w-full max-w-[1400px]">{header}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto h-full w-full max-w-[1400px]">{children}</div>
      </div>
      <div className="shrink-0 border-t-2 border-slate-700/60 bg-slate-900/90 px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-[1400px]">{nav}</div>
      </div>
    </div>
  );
}
