import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type RegionNode, type RegionNodeKind } from '../services/regionLayouts';

/** Original per-terrain tile palettes (all inline SVG shapes drawn by this app, not sourced from any game asset). */
const TILE_PALETTE: Record<RegionNodeKind, { base: string; edge: string; accent: string }> = {
  town: { base: '#8a7f74', edge: '#5c5349', accent: '#e2e8f0' },
  route: { base: '#3f7d20', edge: '#2c5915', accent: '#a3e635' },
  cave: { base: '#4b4945', edge: '#302e2b', accent: '#a8a29e' },
  forest: { base: '#1d5c33', edge: '#123d21', accent: '#4ade80' },
  water: { base: '#1e5fae', edge: '#123e73', accent: '#93c5fd' },
  landmark: { base: '#6d2f8f', edge: '#481f60', accent: '#e9d5ff' },
};

const TERRAIN_DETAIL: Record<RegionNodeKind, string> = {
  route: `
    <circle cx="11" cy="12" r="2" fill="{accent}" />
    <circle cx="27" cy="10" r="2" fill="{accent}" />
    <circle cx="19" cy="21" r="2" fill="{accent}" />
    <circle cx="33" cy="27" r="2" fill="{accent}" />
    <circle cx="9" cy="30" r="2" fill="{accent}" />
    <circle cx="24" cy="33" r="2" fill="{accent}" />`,
  forest: `
    <polygon points="12,9 17,21 7,21" fill="{accent}" />
    <polygon points="28,7 33,19 23,19" fill="{accent}" />
    <polygon points="20,20 25,32 15,32" fill="{accent}" />
    <rect x="11" y="21" width="2" height="4" fill="#5c4326" />
    <rect x="27" y="19" width="2" height="4" fill="#5c4326" />`,
  water: `
    <path d="M5 15 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="{accent}" stroke-width="2" fill="none" />
    <path d="M5 24 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="{accent}" stroke-width="2" fill="none" />
    <path d="M5 33 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="{accent}" stroke-width="1.6" fill="none" opacity="0.6" />`,
  cave: `
    <polygon points="7,34 12,15 18,26 24,11 31,23 37,34" fill="{edge}" />
    <polygon points="7,34 12,15 18,26 24,11 31,23 37,34" fill="none" stroke="{accent}" stroke-width="0.6" opacity="0.5" />`,
  town: `
    <rect x="11" y="20" width="22" height="15" fill="{accent}" />
    <rect x="11" y="20" width="22" height="15" fill="#000" opacity="0.08" />
    <polygon points="9,20 22,9 35,20" fill="#c23a3a" />
    <rect x="20" y="26" width="5" height="9" fill="{edge}" />`,
  landmark: `
    <polygon points="22,7 30,20 25,20 25,35 19,35 19,20 14,20" fill="{accent}" />
    <circle cx="22" cy="12" r="2.4" fill="#fde68a" />`,
};

function tileSvg(kind: RegionNodeKind, caught: boolean, hasItem: boolean, active: boolean): string {
  const p = TILE_PALETTE[kind];
  const detail = TERRAIN_DETAIL[kind].replaceAll('{accent}', p.accent).replaceAll('{edge}', p.edge);
  return `
    <rect x="1" y="1" width="42" height="42" rx="5" fill="${p.edge}" />
    <rect x="2" y="2" width="40" height="37" rx="4" fill="${p.base}" />
    <rect x="2" y="2" width="40" height="12" rx="4" fill="#ffffff" opacity="0.08" />
    ${detail}
    <rect x="1" y="1" width="42" height="42" rx="5" fill="none" stroke="${active ? '#22d3ee' : '#0b0c10'}" stroke-width="${active ? 3 : 1.5}" />
    ${hasItem ? '<rect x="2" y="31" width="11" height="10" rx="2" fill="#0b0c10" stroke="#fbbf24" stroke-width="1.2" /><rect x="5" y="33" width="5" height="2" fill="#fbbf24" />' : ''}
    ${caught ? '<circle cx="36" cy="9" r="6.5" fill="#0b0c10" stroke="#34d399" stroke-width="1.5" /><path d="M32.5 9 l2.2 2.4 l4.3 -4.8" stroke="#34d399" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />' : ''}
  `;
}

function tileIcon(node: RegionNode, caught: boolean, hasItem: boolean, active: boolean): L.DivIcon {
  return L.divIcon({
    html: `<div style="text-align:center;pointer-events:none;">
      <svg width="44" height="44" viewBox="0 0 44 44">${tileSvg(node.kind, caught, hasItem, active)}</svg>
      <div style="font-size:8px;line-height:1;color:#94a3b8;margin-top:2px;white-space:nowrap;text-shadow:0 1px 2px #000;">${node.label}</div>
    </div>`,
    className: '',
    iconSize: [70, 60],
    iconAnchor: [35, 22],
  });
}

/**
 * Original geographic Map view — real region topology from
 * regionLayouts.ts rendered as hand-drawn tile art, panned/zoomed with
 * Leaflet (the same CRS.Simple engine the sample route map already uses)
 * instead of a plain scrollable div, so dragging/pinching/zooming feels
 * like an actual map instead of a scrollbar. Every tile shape here is
 * drawn by this component; nothing is a game asset or a traced/extracted
 * map image (see regionLayouts.ts's doc comment for why that boundary
 * matters).
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const SCALE = 1.6;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 2,
      zoomControl: true,
      attributionControl: false,
    });
    mapRef.current = map;

    const byName = new Map(nodes.map((n) => [n.locationName, n]));
    const drawnEdges = new Set<string>();
    for (const n of nodes) {
      for (const conn of n.connections) {
        const other = byName.get(conn);
        if (!other) continue;
        const key = [n.locationName, other.locationName].sort().join('|');
        if (drawnEdges.has(key)) continue;
        drawnEdges.add(key);
        L.polyline(
          [
            [-n.row * SCALE, n.col * SCALE],
            [-other.row * SCALE, other.col * SCALE],
          ],
          { color: '#44403c', weight: 6, lineCap: 'round' },
        ).addTo(map);
      }
    }

    for (const n of nodes) {
      const marker = L.marker([-n.row * SCALE, n.col * SCALE], {
        icon: tileIcon(n, false, false, false),
      }).addTo(map);
      marker.on('click', () => onSelectRef.current(n.locationName));
      markersRef.current.set(n.locationName, marker);
    }

    const allLatLngs = nodes.map((n): [number, number] => [-n.row * SCALE, n.col * SCALE]);
    const bounds = L.latLngBounds(allLatLngs);
    map.fitBounds(bounds, { padding: [30, 30] });
    map.setMaxBounds(bounds.pad(0.3));

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  useEffect(() => {
    for (const n of nodes) {
      const marker = markersRef.current.get(n.locationName);
      if (!marker) continue;
      marker.setIcon(tileIcon(n, caughtLocations.has(n.locationName), itemLocations.has(n.locationName), selected === n.locationName));
    }
  }, [nodes, caughtLocations, itemLocations, selected]);

  return <div ref={containerRef} className="h-full w-full rounded-lg border border-slate-700 bg-slate-950/70" />;
}
