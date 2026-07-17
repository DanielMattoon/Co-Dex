import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps the app operational when a single screen throws, instead of an
 * uncaught render error unmounting the entire tree — something this
 * project actually hit mid-session (a Dexie error in one panel blanked
 * the whole page, header/nav included, since nothing was catching it).
 * Scoped around each route's content in App.tsx (not the whole app), so
 * the header and bottom nav stay alive and the user can navigate to a
 * working screen instead of being stuck on a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught a render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-xs">
          <p className="font-retro text-[10px] text-red-400">This screen hit a snag.</p>
          <p className="max-w-xs text-slate-400">{this.state.error.message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/30"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-400 hover:bg-slate-800/60"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
