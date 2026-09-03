/// <reference types="@types/google.maps" />
import { useRef, useEffect, useCallback } from "react";
import { MapView } from "./Map";

// Known barangay coordinates for San Pedro, Laguna
// These are approximate center coordinates for each barangay
const BARANGAY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Magsaysay":        { lat: 14.3517, lng: 121.0478 },
  "San Vicente":      { lat: 14.3620, lng: 121.0390 },
  "San Antonio":      { lat: 14.3450, lng: 121.0550 },
  "Langgam":          { lat: 14.3380, lng: 121.0430 },
  "Landayan":         { lat: 14.3290, lng: 121.0360 },
  "Cuyab":            { lat: 14.3700, lng: 121.0470 },
  "Estrella":         { lat: 14.3560, lng: 121.0310 },
  "United Bayanihan": { lat: 14.3480, lng: 121.0600 },
  "Poblacion":        { lat: 14.3540, lng: 121.0500 },
  "Bagong Silang":    { lat: 14.3410, lng: 121.0490 },
  "Calendola":        { lat: 14.3330, lng: 121.0520 },
  "Chrysanthemum":    { lat: 14.3600, lng: 121.0540 },
  "Fatima":           { lat: 14.3650, lng: 121.0420 },
  "G.S.I.S.":         { lat: 14.3470, lng: 121.0440 },
  "Pacita 1":         { lat: 14.3720, lng: 121.0510 },
  "Pacita 2":         { lat: 14.3740, lng: 121.0490 },
  "San Lorenzo Ruiz": { lat: 14.3590, lng: 121.0570 },
  "Santo Niño":       { lat: 14.3510, lng: 121.0460 },
};

// Default fallback center (San Pedro, Laguna)
const SAN_PEDRO_CENTER = { lat: 14.3520, lng: 121.0480 };

export interface BarangayCrimeEntry {
  barangay: string;
  totalHouseholds: number;
  victimHouseholds: number;
  victimRate: number;
  totalVictims: number;
  maleVictims: number;
  femaleVictims: number;
  crimeTypes: string[];
}

interface CrimeHotspotMapProps {
  data: BarangayCrimeEntry[];
  className?: string;
}

/**
 * Returns a color based on crime victimization rate:
 * 0%       → green  (#22c55e)
 * 1–5%     → yellow (#eab308)
 * 5–10%    → orange (#f97316)
 * >10%     → red    (#ef4444)
 */
function getCrimeColor(rate: number): string {
  if (rate === 0) return "#22c55e";
  if (rate < 5) return "#eab308";
  if (rate < 10) return "#f97316";
  return "#ef4444";
}

function getCrimeLabel(rate: number): string {
  if (rate === 0) return "None";
  if (rate < 5) return "Low";
  if (rate < 10) return "Moderate";
  return "High";
}

export default function CrimeHotspotMap({ data, className }: CrimeHotspotMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
  }, []);

  const plotMarkers = useCallback((map: google.maps.Map) => {
    clearMarkers();

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
    infoWindowRef.current = new google.maps.InfoWindow();

    // If no data, show a placeholder marker for Magsaysay
    const entries: BarangayCrimeEntry[] = data.length > 0 ? data : [
      {
        barangay: "Magsaysay",
        totalHouseholds: 0,
        victimHouseholds: 0,
        victimRate: 0,
        totalVictims: 0,
        maleVictims: 0,
        femaleVictims: 0,
        crimeTypes: [],
      }
    ];

    entries.forEach(entry => {
      const coords = BARANGAY_COORDS[entry.barangay] || SAN_PEDRO_CENTER;
      const color = getCrimeColor(entry.victimRate);
      const label = getCrimeLabel(entry.victimRate);

      // Build a custom pin element
      const pinEl = document.createElement("div");
      pinEl.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: ${color};
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      `;
      const innerEl = document.createElement("div");
      innerEl.style.cssText = `
        transform: rotate(45deg);
        color: white;
        font-size: 10px;
        font-weight: bold;
        text-align: center;
        line-height: 1.1;
      `;
      innerEl.textContent = entry.victimRate > 0 ? `${entry.victimRate}%` : "0%";
      pinEl.appendChild(innerEl);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: coords,
        title: entry.barangay,
        content: pinEl,
      });

      // Info window content
      const crimeTypesList = entry.crimeTypes.length > 0
        ? entry.crimeTypes.map(t => `<li style="font-size:11px;color:#374151;">${t}</li>`).join("")
        : `<li style="font-size:11px;color:#9ca3af;font-style:italic;">No crime types recorded</li>`;

      const infoContent = `
        <div style="font-family:sans-serif;min-width:200px;padding:4px;">
          <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:6px;">
            Brgy. ${entry.barangay}
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span style="
              background:${color};
              color:white;
              font-size:11px;
              font-weight:600;
              padding:2px 8px;
              border-radius:9999px;
            ">${label} Risk — ${entry.victimRate}%</span>
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr>
              <td style="color:#6b7280;padding:2px 0;">Total Households</td>
              <td style="font-weight:600;text-align:right;">${entry.totalHouseholds}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;padding:2px 0;">Victim Households</td>
              <td style="font-weight:600;color:${color};text-align:right;">${entry.victimHouseholds}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;padding:2px 0;">Total Victims</td>
              <td style="font-weight:600;text-align:right;">${entry.totalVictims}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;padding:2px 0;">Male / Female</td>
              <td style="font-weight:600;text-align:right;">${entry.maleVictims}M / ${entry.femaleVictims}F</td>
            </tr>
          </table>
          ${entry.crimeTypes.length > 0 ? `
            <div style="margin-top:8px;">
              <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:3px;">Crime Types Reported:</div>
              <ul style="margin:0;padding-left:14px;">${crimeTypesList}</ul>
            </div>
          ` : ""}
        </div>
      `;

      marker.addListener("click", () => {
        infoWindowRef.current?.setContent(infoContent);
        infoWindowRef.current?.open({ anchor: marker, map });
      });

      markersRef.current.push(marker);
    });
  }, [data, clearMarkers]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    plotMarkers(map);
  }, [plotMarkers]);

  // Re-plot markers when data changes
  useEffect(() => {
    if (mapRef.current) {
      plotMarkers(mapRef.current);
    }
  }, [data, plotMarkers]);

  return (
    <div className={className}>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 px-1">
        <span className="text-xs font-semibold text-gray-600">Crime Risk Level:</span>
        {[
          { color: "#22c55e", label: "None (0%)" },
          { color: "#eab308", label: "Low (1–5%)" },
          { color: "#f97316", label: "Moderate (5–10%)" },
          { color: "#ef4444", label: "High (>10%)" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full border border-white shadow-sm"
              style={{ background: color }}
            />
            <span className="text-xs text-gray-600">{label}</span>
          </div>
        ))}
      </div>
      <MapView
        initialCenter={SAN_PEDRO_CENTER}
        initialZoom={13}
        onMapReady={handleMapReady}
        className="w-full h-[420px] rounded-lg overflow-hidden border border-gray-200"
      />
      <p className="text-xs text-gray-400 mt-2">
        Click any marker to view detailed crime statistics for that barangay. Data is computed from approved household survey responses.
      </p>
    </div>
  );
}
