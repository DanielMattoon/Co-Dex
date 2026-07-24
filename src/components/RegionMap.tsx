import { type RegionNode, type RegionNodeKind } from '../services/regionLayouts';

const TILE_PX = 44;

/** Original per-terrain tile palettes (all inline SVG shapes drawn by this app, not sourced from any game asset) — a cooler, higher-contrast palette than the first pass, aiming for a chunkier handheld-console mood. */
const TILE_PALETTE: Record<RegionNodeKind, { base: string; edge: string; accent: string }> = {
  town: { base: '#8a7f74', edge: '#5c5349', accent: '#e2e8f0' },
  route: { base: '#3f7d20', edge: '#2c5915', accent: '#a3e635' },
  cave: { base: '#4b4945', edge: '#302e2b', accent: '#a8a29e' },
  forest: { base: '#1d5c33', edge: '#123d21', accent: '#4ade80' },
  water: { base: '#1e5fae', edge: '#123e73', accent: '#93c5fd' },
  landmark: { base: '#6d2f8f', edge: '#481f60', accent: '#e9d5ff' },
};

function TileArt({ kind, caught, active, hasItem }: { kind: RegionNodeKind; caught: boolean; active: boolean; hasItem: boolean }) {
  const p = TILE_PALETTE[kind];
  return (
    <svg width={TILE_PX} height={TILE_PX} viewBox="0 0 44 44" className="pointer-events-none">
      {/* Base tile with a two-tone bevel for a chunkier, more "console tile" feel. */}
      <rect x={1} y={1} width={42} height={42} rx={5} fill={p.edge} />
      <rect x={2} y={2} width={40} height={37} rx={4} fill={p.base} />
      <rect x={2} y={2} width={40} height={12} rx={4} fill="#ffffff" opacity={0.08} />

      {kind === 'route' && (
        <>
          <circle cx={11} cy={12} r={2} fill={p.accent} />
          <circle cx={27} cy={10} r={2} fill={p.accent} />
          <circle cx={19} cy={21} r={2} fill={p.accent} />
          <circle cx={33} cy={27} r={2} fill={p.accent} />
          <circle cx={9} cy={30} r={2} fill={p.accent} />
          <circle cx={24} cy={33} r={2} fill={p.accent} />
        </>
      )}
      {kind === 'forest' && (
        <>
          <polygon points="12,9 17,21 7,21" fill={p.accent} />
          <polygon points="28,7 33,19 23,19" fill={p.accent} />
          <polygon points="20,20 25,32 15,32" fill={p.accent} />
          <rect x={11} y={21} width={2} height={4} fill="#5c4326" />
          <rect x={27} y={19} width={2} height={4} fill="#5c4326" />
        </>
      )}
      {kind === 'water' && (
        <>
          <path d="M5 15 q4 -4 8 0 t8 0 t8 0 t8 0" stroke={p.accent} strokeWidth={2} fill="none" />
          <path d="M5 24 q4 -4 8 0 t8 0 t8 0 t8 0" stroke={p.accent} strokeWidth={2} fill="none" />
          <path d="M5 33 q4 -4 8 0 t8 0 t8 0 t8 0" stroke={p.accent} strokeWidth={1.6} fill="none" opacity={0.6} />
        </>
      )}
      {kind === 'cave' && (
        <>
          <polygon points="7,34 12,15 18,26 24,11 31,23 37,34" fill={p.edge} />
          <polygon points="7,34 12,15 18,26 24,11 31,23 37,34" fill="none" stroke={p.accent} strokeWidth={0.6} opacity={0.5} />
        </>
      )}
      {kind === 'town' && (
        <>
          <rect x={11} y={20} width={22} height={15} fill={p.accent} />
          <rect x={11} y={20} width={22} height={15} fill="#000" opacity={0.08} />
          <polygon points="9,20 22,9 35,20" fill="#c23a3a" />
          <rect x={20} y={26} width={5} height={9} fill={p.edge} />
        </>
      )}
      {kind === 'landmark' && (
        <>
          <polygon points="22,7 30,20 25,20 25,35 19,35 19,20 14,20" fill={p.accent} />
          <circle cx={22} cy={12} r={2.4} fill="#fde68a" />
        </>
      )}

      <rect x={1} y={1} width={42} height={42} rx={5} fill="none" stroke={active ? '#22d3ee' : '#0b0c10'} strokeWidth={active ? 3 : 1.5} />

      {hasItem && (
        <>
          <rect x={2} y={31} width={11} height={10} rx={2} fill="#0b0c10" stroke="#fbbf24" strokeWidth={1.2} />
          <rect x={5} y={33} width={5} height={2} fill="#fbbf24" />
        </>
      )}
      {caught && (
        <>
          <circle cx={36} cy={9} r={6.5} fill="#0b0c10" stroke="#34d399" strokeWidth={1.5} />
          <path d="M32.5 9 l2.2 2.4 l4.3 -4.8" stroke="#34d399" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/**
 * Original geographic Map view (not the abstract vertical list) — real
 * Kanto/etc. topology from regionLayouts.ts rendered as hand-drawn tile
 * art, laid out on an SVG canvas so routes visibly connect to the towns
 * and caves they lead to, the way the actual region reads at a glance.
 * Every tile shape here is drawn by this component; nothing is a game
 * asset or a traced/extracted map image (see regionLayouts.ts's doc
 * comment for why that boundary matters).
 */
export function RegionMap({
  nodes,
  selected,
  caughtLocations,
  itemLocations,
  onSelect,
}: {
  nodes: RegionNode[];
  selected: string | null;
  /** Location names with at least one already-caught species, for the small checkmark badge. */
  caughtLocations: Set<string>;
  /** Location names with at least one real recorded item (only populated when the Items layer is on and data's back), for the small bag badge. */
  itemLocations: Set<string>;
  onSelect: (locationName: string) => void;
}) {
  const cellW = TILE_PX + 18;
  const cellH = TILE_PX + 18;
  const pad = TILE_PX;
  const maxCol = Math.max(...nodes.map((n) => n.col));
  const maxRow = Math.max(...nodes.map((n) => n.row));
  const width = maxCol * cellW + pad * 2;
  const height = maxRow * cellH + pad * 2;

  function xy(n: RegionNode): [number, number] {
    return [pad + n.col * cellW, pad + n.row * cellH];
  }

  const byName = new Map(nodes.map((n) => [n.locationName, n]));
  const drawnEdges = new Set<string>();
  const edges: { from: RegionNode; to: RegionNode }[] = [];
  for (const n of nodes) {
    for (const conn of n.connections) {
      const other = byName.get(conn);
      if (!other) continue;
      const key = [n.locationName, other.locationName].sort().join('|');
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      edges.push({ from: n, to: other });
    }
  }

  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-700 bg-slate-950/70 p-2">
      <svg width={width} height={height} className="block">
        {edges.map(({ from, to }, i) => {
          const [x1, y1] = xy(from);
          const [x2, y2] = xy(to);
          return (
            <line
              key={i}
              x1={x1 + TILE_PX / 2}
              y1={y1 + TILE_PX / 2}
              x2={x2 + TILE_PX / 2}
              y2={y2 + TILE_PX / 2}
              stroke="#44403c"
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}
        {nodes.map((n) => {
          const [x, y] = xy(n);
          return (
            <foreignObject key={n.locationName} x={x} y={y} width={TILE_PX} height={TILE_PX + 12}>
              <button
                type="button"
                title={n.label}
                onClick={() => onSelect(n.locationName)}
                className="flex flex-col items-center gap-0.5 cursor-pointer"
                style={{ width: TILE_PX }}
              >
                <TileArt
                  kind={n.kind}
                  caught={caughtLocations.has(n.locationName)}
                  active={selected === n.locationName}
                  hasItem={itemLocations.has(n.locationName)}
                />
                <span className="w-full truncate text-center text-[7px] leading-none text-slate-400">{n.label}</span>
              </button>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
