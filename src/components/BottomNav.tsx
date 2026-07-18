import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  color: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dex', icon: '▦', color: 'text-cyan-300' },
  { to: '/map', label: 'Map', icon: '▲', color: 'text-emerald-300' },
  { to: '/team', label: 'Team', icon: '✦', color: 'text-fuchsia-300' },
  { to: '/collection', label: 'Shelf', icon: '▣', color: 'text-amber-300' },
  { to: '/link', label: 'Link', icon: '⇄', color: 'text-lime-300' },
  { to: '/profile', label: 'Profile', icon: '★', color: 'text-amber-300' },
];

/**
 * Always-accessible bottom control deck. Lives entirely in the thumb zone
 * (PRD 2.1) and doubles as the "Back to Box" anchor (PRD 2.2) via the Dex tab
 * (the unified Living Dex that replaced the separate Box screen).
 */
export function BottomNav() {
  return (
    <nav className="grid grid-cols-6 gap-1.5 font-retro text-[8px]">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2 transition-colors',
              isActive
                ? 'border-slate-400/60 bg-slate-700/60'
                : 'border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/70',
            ].join(' ')
          }
        >
          <span className={`text-base leading-none ${item.color}`}>{item.icon}</span>
          <span className="text-slate-200">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
