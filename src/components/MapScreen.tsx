import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { SAMPLE_ROUTE, type EncounterZone, type MapMarker } from '../services/mapData';

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

export function MapScreen() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const itemMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const [selectedZone, setSelectedZone] = useState<EncounterZone | null>(null);

  const progressId = `${DEFAULT_GAME_INSTANCE_ID}_${SAMPLE_ROUTE.routeId}`;
  const progress = useLiveQuery(() => db.map_progress.get(progressId), [progressId]);
  const vaultEntries = useLiveQuery(() => db.vault.toArray(), []);
  const caughtSet = new Set((vaultEntries ?? []).map((entry) => entry.pokemon_id));

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
      }).addTo(map);
      rect.on('click', () => setSelectedZone(zone));
    }

    for (const marker of SAMPLE_ROUTE.markers) {
      const dot = L.circleMarker(marker.position, {
        radius: 7,
        color: MARKER_COLOR[marker.kind],
        fillColor: MARKER_COLOR[marker.kind],
        fillOpacity: 0.9,
      }).addTo(map);
      dot.bindTooltip(marker.label);
      if (marker.kind === 'item') {
        itemMarkersRef.current.set(marker.id, dot);
        dot.on('click', () => {
          void toggleItemClaimed(marker.id);
        });
      }
    }

    return () => {
      map.remove();
      mapRef.current = null;
      itemMarkersRef.current.clear();
    };
  }, []);

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
      <p className="text-[10px] text-slate-500">{SAMPLE_ROUTE.name} — tap a grass patch or item</p>

      {selectedZone && (
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-retro text-[9px] text-slate-200">Encounters</span>
            <button
              type="button"
              onClick={() => setSelectedZone(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              close
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {selectedZone.encounters.map((enc) => {
              const owned = caughtSet.has(enc.pokemon_id);
              return (
                <li
                  key={enc.species}
                  className="flex items-center justify-between text-xs"
                >
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
    </div>
  );
}
