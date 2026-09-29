"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { cn } from "@/lib/utils";
import {
  Navigation,
  AlertTriangle,
  Crosshair,
  Layers,
  Plus,
  Minus,
  Maximize2,
} from "lucide-react";
import type { Vehicle, VehicleStatus } from "@/lib/yazz/mock-data";

type YazzMapboxProps = {
  vehicles: Vehicle[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

const statusConfig: Record<VehicleStatus, {
  color: string;
  label: string;
}> = {
  moving: { color: "#2B44EE", label: "En mouvement" },
  idle: { color: "#5A5F8A", label: "À l'arrêt" },
  offline: { color: "#888CA8", label: "Hors-ligne" },
  alert: { color: "#E53E3E", label: "Alerte" },
};

export function YazzMapbox({ vehicles, selectedId, onSelect }: YazzMapboxProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [filter, setFilter] = useState<VehicleStatus | "all">("all");

  // Initialize Mapbox
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("❌ NEXT_PUBLIC_MAPBOX_TOKEN manquant dans .env.local");
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL || "mapbox://styles/mapbox/streets-v12",
      center: [15.3130, -4.3250], // Kinshasa
      zoom: 11.5,
      attributionControl: true,
    });

    map.current.on("load", () => {
      setMapReady(true);
    });

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers when vehicles change
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const filtered = filter === "all"
      ? vehicles
      : vehicles.filter((v) => v.status === filter);

    // Remove markers not in the filtered list
    markersRef.current.forEach((marker, id) => {
      if (!filtered.find((v) => v.id === id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    filtered.forEach((v) => {
      const lng = -4.3250 + (v.position.x - 50) * 0.01;
      const lat = 15.3130 - (v.position.y - 50) * 0.01;
      const cfg = statusConfig[v.status];
      const isSelected = v.id === selectedId;

      const el = document.createElement("div");
      el.className = cn(
        "yazz-mapbox-marker",
        "relative grid place-items-center rounded-full text-white transition-all",
        isSelected ? "scale-125" : "",
        v.status === "alert" && "yazz-blink"
      );
      el.style.width = `${isSelected ? 44 : 36}px`;
      el.style.height = `${isSelected ? 44 : 36}px`;
      el.style.backgroundColor = cfg.color;
      el.style.boxShadow = `0 0 0 4px ${cfg.color}33, 0 4px 12px ${cfg.color}40`;

      el.innerHTML =
        v.status === "alert"
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${v.heading}deg)"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;

      el.style.cursor = "pointer";

      el.addEventListener("click", () => {
        onSelect?.(v.id);
        map.current?.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.current.getZoom(), 14),
          duration: 1200,
        });
      });

      // Tooltip popup
      const popup = new mapboxgl.Popup({
        offset: 28,
        closeButton: false,
        className: "yazz-mapbox-popup",
      }).setHTML(`
        <div class="p-2 min-w-[180px]">
          <div class="flex items-start justify-between gap-2">
            <p class="font-outfit font-semibold text-[12px] text-yazz-text-dark">${v.name}</p>
            <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style="background-color:${cfg.color}">
              ${cfg.label}
            </span>
          </div>
          <p class="font-inter text-[10px] text-yazz-text-muted mt-0.5 truncate">${v.address}</p>
          <div class="flex items-center justify-between mt-1.5">
            <span class="font-outfit font-semibold text-[11px] text-yazz-primary">
              ${v.speed > 0 ? `${v.speed} km/h` : "À l'arrêt"}
            </span>
            <span class="font-inter text-[10px] text-yazz-text-caption">Batt: ${v.battery}%</span>
          </div>
        </div>
      `);

      let marker = markersRef.current.get(v.id);
      if (marker) {
        marker.setLngLat([lng, lat]).setPopup(popup);
        marker.getElement().replaceWith(el);
        marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current!);
        markersRef.current.set(v.id, marker);
      } else {
        marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current!);
        markersRef.current.set(v.id, marker);
      }
    });
  }, [vehicles, filter, selectedId, mapReady, onSelect]);

  // Center on selected vehicle
  useEffect(() => {
    if (!mapReady || !map.current || !selectedId) return;
    const v = vehicles.find((x) => x.id === selectedId);
    if (!v) return;
    const lng = -4.3250 + (v.position.x - 50) * 0.01;
    const lat = 15.3130 - (v.position.y - 50) * 0.01;
    map.current.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.current.getZoom(), 14),
      duration: 1200,
    });
  }, [selectedId, mapReady, vehicles]);

  const counts = {
    all: vehicles.length,
    moving: vehicles.filter((v) => v.status === "moving").length,
    idle: vehicles.filter((v) => v.status === "idle").length,
    alert: vehicles.filter((v) => v.status === "alert").length,
    offline: vehicles.filter((v) => v.status === "offline").length,
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-yazz-xl bg-yazz-surface yazz-shadow-soft">
      {/* Mapbox container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Loading state */}
      {!mapReady && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-yazz-background">
          <div className="text-center">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-yazz-border-light border-t-yazz-primary" />
            <p className="font-inter text-[13px] font-medium text-yazz-text-muted">
              Chargement de la carte…
            </p>
          </div>
        </div>
      )}

      {/* Header overlay */}
      <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-2 rounded-yazz-sm bg-yazz-surface/90 px-3 py-2 yazz-glass pointer-events-auto">
          <Crosshair className="h-4 w-4 text-yazz-primary" />
          <span className="font-outfit text-[12px] font-semibold text-yazz-text-dark">Kinshasa</span>
          <span className="font-inter text-[10px] text-yazz-text-caption">Live</span>
          <span className="ml-1 h-2 w-2 rounded-full bg-yazz-success yazz-blink" />
        </div>

        <div className="hidden items-center gap-1 rounded-yazz-sm bg-yazz-surface/90 p-1 yazz-glass pointer-events-auto md:flex">
          {([
            { id: "all", label: "Tous", count: counts.all },
            { id: "moving", label: "Mouvement", count: counts.moving },
            { id: "idle", label: "Arrêt", count: counts.idle },
            { id: "alert", label: "Alerte", count: counts.alert },
            { id: "offline", label: "Hors-ligne", count: counts.offline },
          ] as const).map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as VehicleStatus | "all")}
                className={cn(
                  "font-inter rounded-yazz-xs px-2.5 py-1.5 text-[11px] font-semibold transition-all",
                  active
                    ? "bg-yazz-primary text-white shadow-yazz-soft"
                    : "text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
                )}
              >
                {f.label}
                <span className={cn("ml-1.5", active ? "opacity-80" : "opacity-50")}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scale bottom-right */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-yazz-sm bg-yazz-surface/95 px-2.5 py-1.5 yazz-glass">
        <span className="font-outfit text-[10px] font-semibold text-yazz-text-muted">2 km</span>
        <div className="h-1.5 w-12 border-b-2 border-l-2 border-r-2 border-yazz-text-muted" />
      </div>

      {/* Mapbox CSS overrides */}
      <style jsx global>{`
        .yazz-mapbox-popup .mapboxgl-popup-content {
          border-radius: 14px;
          background: white;
          box-shadow: 0 8px 24px rgba(43, 68, 238, 0.16);
          border: 1px solid #dde1f2;
          padding: 0;
        }
        .yazz-mapbox-popup .mapboxgl-popup-tip {
          border-top-color: white;
        }
        .yazz-mapbox-popup.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip {
          border-top-color: white;
          border-bottom-color: transparent;
        }
        .mapboxgl-ctrl-top-right {
          top: 64px !important;
        }
        .mapboxgl-ctrl-group {
          border-radius: 9px !important;
          box-shadow: 0 1px 3px rgba(43, 68, 238, 0.12) !important;
          overflow: hidden;
          border: 1px solid #dde1f2 !important;
        }
        .mapboxgl-ctrl-group button {
          width: 36px !important;
          height: 36px !important;
        }
        .mapboxgl-ctrl-group button:hover {
          background-color: #f0f1fa !important;
        }
        .mapboxgl-ctrl-attrib {
          font-size: 10px !important;
          background: rgba(255,255,255,0.7) !important;
        }
      `}</style>
    </div>
  );
}
