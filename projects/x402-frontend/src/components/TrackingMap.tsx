import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface HistoryPoint {
  latitude: number;
  longitude: number;
  speed: number;
  timestamp: string;
}

interface TrackingMapProps {
  latitude: number;
  longitude: number;
  speed: number;
  routeName: string;
  destination: string;
  historyPath?: HistoryPoint[];
  selectedDate?: string;
}

export const TrackingMap: React.FC<TrackingMapProps> = ({
  latitude,
  longitude,
  speed,
  routeName,
  destination,
  historyPath,
  selectedDate
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pathRef = useRef<L.Polyline | null>(null);
  const coordinatesHistoryRef = useRef<L.LatLngExpression[]>([]);

  // History references
  const historyPolylineRef = useRef<L.Polyline | null>(null);
  const historyMarkersRef = useRef<L.Marker[]>([]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Dark-themed Leaflet Map initialization
    const map = L.map(mapContainerRef.current, {
      zoomControl: false // Disable default zoom controls to reposition later
    }).setView([16.5062, 80.6480], 14); // Default centering on Vijayawada

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Add zoom control to top-right
    L.control.zoom({
      position: 'topright'
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Bus Location and Draw Path (LIVE MODE or HISTORY MODE)
  useEffect(() => {
    if (!mapRef.current) return;

    // --- CASE 1: HISTORY MODE PLAYBACK ---
    if (historyPath && historyPath.length > 0) {
      // 1. Clear any active live markers/polylines
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (pathRef.current) {
        pathRef.current.remove();
        pathRef.current = null;
      }
      coordinatesHistoryRef.current = [];

      // 2. Clear old history layers
      if (historyPolylineRef.current) {
        historyPolylineRef.current.remove();
      }
      historyMarkersRef.current.forEach(m => m.remove());
      historyMarkersRef.current = [];

      // 3. Map history path coords
      const latLngs = historyPath.map(p => [p.latitude, p.longitude] as [number, number]);

      // 4. Draw history route polyline
      historyPolylineRef.current = L.polyline(latLngs, {
        color: '#818cf8', // Indigo light
        weight: 5,
        opacity: 0.9
      }).addTo(mapRef.current);

      // 5. Draw Start Marker
      const startPoint = latLngs[0];
      const startMarker = L.marker(startPoint, {
        icon: L.divIcon({
          html: `<div class="w-7 h-7 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-lg flex items-center justify-center text-xs font-black text-slate-100">S</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(mapRef.current).bindPopup(`
        <div class="text-dark-900 font-sans p-1 text-xs">
          <b>Route Start Location</b><br/>
          <b>Time:</b> ${historyPath[0].timestamp}
        </div>
      `);
      historyMarkersRef.current.push(startMarker);

      // 6. Draw End Marker
      const endPoint = latLngs[latLngs.length - 1];
      const endMarker = L.marker(endPoint, {
        icon: L.divIcon({
          html: `<div class="w-7 h-7 bg-rose-500 rounded-full border-2 border-slate-900 shadow-lg flex items-center justify-center text-xs font-black text-slate-100">E</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(mapRef.current).bindPopup(`
        <div class="text-dark-900 font-sans p-1 text-xs">
          <b>Last Tracked Location</b><br/>
          <b>Time:</b> ${historyPath[historyPath.length - 1].timestamp}
        </div>
      `);
      historyMarkersRef.current.push(endMarker);

      // 7. Auto zoom/pan map bounds to fit the complete polyline path
      mapRef.current.fitBounds(latLngs, { padding: [50, 50] });
      return;
    }

    // --- CASE 2: LIVE TRACKING MODE ---
    // Clear history layers
    if (historyPolylineRef.current) {
      historyPolylineRef.current.remove();
      historyPolylineRef.current = null;
    }
    historyMarkersRef.current.forEach(m => m.remove());
    historyMarkersRef.current = [];

    // Draw live updates
    const latLng: L.LatLngExpression = [latitude, longitude];
    mapRef.current.panTo(latLng);

    // Update/Create Live Bus Marker
    if (markerRef.current) {
      markerRef.current.setLatLng(latLng);
      markerRef.current.setIcon(createBusIcon(speed));
    } else {
      markerRef.current = L.marker(latLng, {
        icon: createBusIcon(speed)
      }).addTo(mapRef.current);
    }

    // Accumulate route coordinates
    const prevCoords = coordinatesHistoryRef.current[coordinatesHistoryRef.current.length - 1];
    if (!prevCoords || (prevCoords as any)[0] !== latitude || (prevCoords as any)[1] !== longitude) {
      coordinatesHistoryRef.current.push(latLng);
    }

    // Update/Create Route Polyline
    if (pathRef.current) {
      pathRef.current.setLatLngs(coordinatesHistoryRef.current);
    } else {
      pathRef.current = L.polyline(coordinatesHistoryRef.current, {
        color: '#6366f1',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 10'
      }).addTo(mapRef.current);
    }

    // Add popup info
    markerRef.current.bindPopup(`
      <div class="text-dark-900 font-sans p-1">
        <h4 class="font-bold text-sm text-indigo-600">${routeName}</h4>
        <p class="text-xs text-gray-600 mt-1"><b>Heading to:</b> ${destination}</p>
        <p class="text-xs text-gray-600"><b>Speed:</b> ${speed} km/h</p>
      </div>
    `);

  }, [latitude, longitude, speed, routeName, destination, historyPath]);

  // Custom bus SVG marker helper
  const createBusIcon = (speedKmh: number) => {
    const isMoving = speedKmh > 2;
    const colorClass = isMoving ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-amber-500 shadow-amber-500/50';
    const icon = isMoving ? '🚍' : '🚌';
    const statusText = isMoving ? 'Moving' : 'Stationary';

    return L.divIcon({
      html: `
        <div class="relative flex flex-col items-center">
          <div class="w-10 h-10 ${colorClass} rounded-2xl flex items-center justify-center text-xl shadow-lg border-2 border-slate-900 transition-all duration-300">
            ${icon}
          </div>
          <div class="absolute -bottom-7 bg-slate-900 text-slate-100 border border-slate-700 rounded px-1.5 py-0.5 text-[9px] font-bold shadow-md whitespace-nowrap">
            ${speedKmh} km/h (${statusText})
          </div>
        </div>
      `,
      className: '',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  };

  const isHistoryActive = historyPath && historyPath.length > 0;

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border border-dark-700">
      <div ref={mapContainerRef} className="w-full h-full" />
      
      {/* Map status overlay panel */}
      <div className="absolute bottom-3 left-3 bg-dark-900/90 backdrop-blur-md border border-dark-700 rounded-lg p-3 z-[1000] text-xs max-w-xs shadow-lg">
        {isHistoryActive ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
              <span className="font-semibold text-slate-200">Historical Route Display</span>
            </div>
            <div className="text-slate-400">
              <p><b>Date:</b> <span className="text-indigo-400 font-mono">{selectedDate}</span></p>
              <p><b>Total Nodes:</b> <span className="text-indigo-400 font-mono">{historyPath.length} points</span></p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="font-semibold text-slate-200">Live GPS Stream Active</span>
            </div>
            <div className="text-slate-400">
              <p><b>Latitude:</b> <span className="font-mono text-indigo-400">{latitude.toFixed(6)}</span></p>
              <p><b>Longitude:</b> <span className="font-mono text-indigo-400">{longitude.toFixed(6)}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
