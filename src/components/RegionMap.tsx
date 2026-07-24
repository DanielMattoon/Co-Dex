import { type RegionNode, type RegionNodeKind } from '../services/regionLayouts';

const TILE_PX = 34;

/** Original per-terrain tile art (all inline SVG shapes drawn by this app, not sourced from any game asset). */
const TILE_FILL: Record<RegionNodeKind, string> = {
  town: '#78716c',
  route: '#3f6212',
  cave: '#57534e',
  forest: '#14532d',
  water: '#1d4ed8',
  landmark: '#7c2d92',
};

function TileArt({ kind, caught, active }: { kind: RegionNodeKind; caught: boolean; active: boolean }) {
  const base = TILE_FILL[kind];
  return (
    <svg width={TILE_PX} height={TILE_PX} viewBox="0 0 34 34" className="pointer-events-none">
      <rect x={1} y={1} width={32} height={32} rx={4} fill={base} stroke={active ? '#22d3ee' : '#0b0c10'} strokeWidth={active ? 2.5 : 1.5} />
      {kind === 'route' && (
        <>
          <circle cx={9} cy={10} r={1.6} fill="#84cc16" />
          <circle cx={21} cy={9} r={1.6} fill="#84cc16" />
          <circle cx={15} cy={17} r={1.6} fill="#84cc16" />
          <circle cx={25} cy={22} r={1.6} fill="#84cc16" />
          <circle cx={8} cy={24} r={1.6} fill="#84cc16" />
        </>
      )}
      {kind === 'forest' && (
        <>
          <polygon points="10,8 14,17 6,17" fill="#166534" />
          <polygon points="22,6 26,15 18,15" fill="#166534" />
          <polygon points="16,16 20,25 12,25" fill="#166534" />
        </>
      )}
      {kind === 'water' && (
        <>
          <path d="M4 12 q3 -3 6 0 t6 0 t6 0 t6 0" stroke="#7dd3fc" strokeWidth={1.6} fill="none" />
          <path d="M4 20 q3 -3 6 0 t6 0 t6 0 t6 0" stroke="#7dd3fc" strokeWidth={1.6} fill="none" />
        </>
      )}
      {kind === 'cave' && (
        <>
          <polygon points="6,26 10,12 15,20 19,9 24,18 28,26" fill="#292524" />
        </>
      )}
      {kind === 'town' && (
        <>
          <rect x={9} y={16} width={16} height={11} fill="#a8a29e" />
          <polygon points="7,16 17,7 27,16" fill="#dc2626" />
        </>
      )}
      {kind === 'landmark' && (
        <>
          <polygon points="17,6 24,15 20,15 20,28 14,28 14,15 10,15" fill="#e9d5ff" />
        </>
      )}
      {caught && (
        <circle cx={27} cy={7} r={5} fill="#0b0c10" stroke="#34d399" strokeWidth={1.5} />
      )}
      {caught && (
        <path d="M24.5 7 l1.6 1.8 l3.2 -3.6" stroke="#34d399" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
  onSelect,
}: {
  nodes: RegionNode[];
  selected: string | null;
  /** Location names with at least one already-caught species, for the small checkmark badge. */
  caughtLocations: Set<string>;
  onSelect: (locationName: string) => void;
}) {
  const cellW = TILE_PX + 14;
  const cellH = TILE_PX + 14;
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
    <div className="overflow-auto rounded-lg border border-slate-700 bg-slate-950/60 p-2">
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
              stroke="#3f3f46"
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
        {nodes.map((n) => {
          const [x, y] = xy(n);
          return (
            <foreignObject key={n.locationName} x={x} y={y} width={TILE_PX} height={TILE_PX}>
              <button
                type="button"
                title={n.label}
                onClick={() => onSelect(n.locationName)}
                className="block cursor-pointer"
                style={{ width: TILE_PX, height: TILE_PX }}
              >
                <TileArt kind={n.kind} caught={caughtLocations.has(n.locationName)} active={selected === n.locationName} />
              </button>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}
