import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { SAMPLE_ROUTE, type EncounterZone, type MapMarker } from '../services/mapData';
import { suggestCounters } from '../services/counterStrategy';

/** No active trainer/game-instance selection UI exists yet — placeholder scope key. */
const DEFAULT_GAME_INSTANCE_ID = 'demo_instance';

const ZONE_COLOR: Record<EncounterZone['kind'], string> = {
  grass: '#22c55e',
  water: '#38bdf8',
  cave: '#94a3b8',
};

const MARKER_COLOR: Record<MapMarker['kind'], string> = {
  item: '#fbbf24',
  trainer: '#f472b6',
  gym: '#f87171',
};

type LayerKind = EncounterZone['kind'] | MapMarker['kind'];

const LAYER_LABELS: Record<LayerKind, string> = {
  grass: 'Grass',
  water: 'Water',
  cave: 'Cave',
  item: 'Items',
  trainer: 'Trainers',
  gym: 'Gyms',
};

type ActivePanel = { type: 'zone'; zone: EncounterZone } | { type: 'marker'; marker: MapMarker } | null;

export function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoneLayersRef = useRef<Map<string, L.Rectangle>>(new Map());
  const markerLayersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const itemMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const availableLayers = useMemo<LayerKind[]>(() => {
    const kinds = new Set<LayerKind>();
    SAMPLE_ROUTE.zones.forEach((z) => kinds.add(z.kind));
    SAMPLE_ROUTE.markers.forEach((m) => kinds.add(m.kind));
    return [...kinds];
  }, []);
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerKind>>(() => new Set(availableLayers));

  function toggleLayer(kind: LayerKind) {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const progressId = `${DEFAULT_GAME_INSTANCE_ID}_${SAMPLE_ROUTE.routeId}`;
  const progress = useLiveQuery(() => db.map_progress.get(progressId), [progressId]);
  const vaultEntries = useLiveQuery(() => db.vault.toArray(), []);
  const caughtSet = new Set((vaultEntries ?? []).map((entry) => entry.pokemon_id));
  const ownedSpeciesNames = [...new Set((vaultEntries ?? []).map((entry) => entry.species))];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -1,
      maxZoom: 2,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const [h, w] = SAMPLE_ROUTE.gridSize;
    const bounds = L.latLngBounds([0, 0], [h, w]);
    map.fitBounds(bounds);
    map.setMaxBounds(bounds.pad(0.15));

    for (const zone of SAMPLE_ROUTE.zones) {
      const rect = L.rectangle(zone.bounds, {
        color: ZONE_COLOR[zone.kind],
        weight: 2,
        fillOpacity: 0.25,
      });
      rect.on('click', () => setActivePanel({ type: 'zone', zone }));
      zoneLayersRef.current.set(zone.id, rect);
    }

    for (const marker of SAMPLE_ROUTE.markers) {
      const dot = L.circleMarker(marker.position, {
        radius: 7,
        color: MARKER_COLOR[marker.kind],
        fillColor: MARKER_COLOR[marker.kind],
        fillOpacity: 0.9,
      });
      dot.bindTooltip(marker.label);
      if (marker.kind === 'item') {
        itemMarkersRef.current.set(marker.id, dot);
        dot.on('click', () => {
          void toggleItemClaimed(marker.id);
        });
      } else {
        dot.on('click', () => setActivePanel({ type: 'marker', marker }));
      }
      markerLayersRef.current.set(marker.id, dot);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      zoneLayersRef.current.clear();
      markerLayersRef.current.clear();
      itemMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layer visibility + "uncaught route glow" (PRD 7.1, 7.2): zones with an
  // uncaught species render with a bolder, more opaque outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const zone of SAMPLE_ROUTE.zones) {
      const rect = zoneLayersRef.current.get(zone.id);
      if (!rect) continue;
      const visible = visibleLayers.has(zone.kind);
      if (visible && !map.hasLayer(rect)) rect.addTo(map);
      if (!visible && map.hasLayer(rect)) map.removeLayer(rect);

      const hasUncaught = zone.encounters.some((e) => !caughtSet.has(e.pokemon_id));
      rect.setStyle({
        weight: hasUncaught ? 3 : 1,
        fillOpacity: hasUncaught ? 0.35 : 0.12,
        opacity: hasUncaught ? 1 : 0.5,
      });
    }

    for (const marker of SAMPLE_ROUTE.markers) {
      const dot = markerLayersRef.current.get(marker.id);
      if (!dot) continue;
      const visible = visibleLayers.has(marker.kind);
      if (visible && !map.hasLayer(dot)) dot.addTo(map);
      if (!visible && map.hasLayer(dot)) map.removeLayer(dot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLayers, vaultEntries]);

  // Sync claimed-item styling whenever Dexie's map_progress record changes —
  // item markers render semi-transparent once claimed (PRD 7.2).
  useEffect(() => {
    for (const [markerId, dot] of itemMarkersRef.current) {
      const claimed = Boolean(progress?.itemChecklist?.[markerId]);
      dot.setStyle({ fillOpacity: claimed ? 0.25 : 0.9 });
    }
  }, [progress]);

  async function toggleItemClaimed(markerId: string) {
    const current = await db.map_progress.get(progressId);
    const nextChecklist = { ...(current?.itemChecklist ?? {}) };
    nextChecklist[markerId] = !nextChecklist[markerId];
    await db.map_progress.put({
      id: progressId,
      routeId: SAMPLE_ROUTE.routeId,
      game_instance_id: DEFAULT_GAME_INSTANCE_ID,
      firstEncounterLogged: current?.firstEncounterLogged ?? false,
      itemChecklist: nextChecklist,
    });
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        ref={containerRef}
        className="h-40 w-full shrink-0 rounded-lg border border-slate-700 bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:24px_24px]"
      />

      <div className="flex flex-wrap gap-1.5">
        {availableLayers.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => toggleLayer(kind)}
            className={[
              'rounded-md border px-2 py-0.5 text-[10px]',
              visibleLayers.has(kind)
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 text-slate-500 hover:bg-slate-800/60',
            ].join(' ')}
          >
            {LAYER_LABELS[kind]}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-slate-500">{SAMPLE_ROUTE.name} — bolder patches have uncaught species</p>

      {activePanel?.type === 'zone' && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-retro text-[9px] text-slate-200">Encounters</span>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              close
            </button>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs">
            {activePanel.zone.encounters.map((enc) => {
              const owned = caughtSet.has(enc.pokemon_id);
              return (
                <li key={enc.species} className="flex items-center justify-between">
                  <span className="text-slate-200">{enc.species}</span>
                  <span className="text-slate-400">{enc.rate}%</span>
                  <span className={owned ? 'text-emerald-400' : 'text-slate-500'}>
                    {owned ? 'Caught' : 'Uncaught'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activePanel?.type === 'marker' && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-retro text-[9px] text-slate-200">{activePanel.marker.label}</span>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              close
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {(activePanel.marker.roster ?? []).map((member) => {
              const counters = suggestCounters(member.species, ownedSpeciesNames);
              return (
                <div key={member.species} className="rounded-md border border-slate-700 bg-slate-900/60 p-2">
                  <p className="text-slate-200">
                    {member.species} <span className="text-slate-500">Lv. {member.level}</span>
                  </p>
                  <p className="text-slate-500">{member.moves.join(', ')}</p>
                  {counters.length > 0 ? (
                    <p className="mt-1 text-emerald-400">
                      Counters in your Vault: {counters.map((c) => `${c.vaultSpecies} (${c.bestMultiplier}x)`).join(', ')}
                    </p>
                  ) : (
                    <p className="mt-1 text-slate-500">No super-effective Vault matchups found.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
