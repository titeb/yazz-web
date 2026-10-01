"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { cn } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@/lib/yazz/mock-data";

type YazzMapboxProps = {
  vehicles: Vehicle[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

const statusConfig: Record<VehicleStatus, { color: string; label: string }> = {
  // Flutter yazz user : TOUS les markers sont bleu primary (#2B44EE)
  // Sauf engine_cut_state=true → rouge (#F44336)
  // L'opacité distingue online (1.0) vs offline (0.3)
  moving: { color: "#2B44EE", label: "En mouvement" },
  idle: { color: "#2B44EE", label: "À l'arrêt" },
  offline: { color: "#2B44EE", label: "Hors-ligne" },
  alert: { color: "#F44336", label: "Alerte" },
};

// Kinshasa center — matches Flutter yazz user (lib/ui/features/base/dashboard/dashbord.dart:108)
const KINSHASA_CENTER: [number, number] = [15.31, -4.32];
// Zoom limites — Flutter yazz user (dashbord.dart:894-896)
const MIN_ZOOM = 10;
const MAX_ZOOM = 18;
const INITIAL_ZOOM = 13;
// Animation flyTo — Flutter yazz user (dashbord.dart:786, 500ms duration)
const FLYTO_ZOOM = 15.6;
const FLYTO_PITCH = 45; // inclinaison 3D
const FLYTO_DURATION = 500; // ms (Flutter: 500ms, throttle 1500ms)

export function YazzMapbox({ vehicles, selectedId, onSelect }: YazzMapboxProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [filter, setFilter] = useState<VehicleStatus | "all">("all");

  // Fit bounds sur tous les markers visibles
  const fitAllMarkers = useCallback(() => {
    if (!map.current) return;
    const filtered = filter === "all" ? vehicles : vehicles.filter((v) => v.status === filter);
    if (filtered.length === 0) return;

    const coords = filtered.map(toLngLat);
    if (coords.length === 1) {
      map.current.flyTo({
        center: coords[0],
        zoom: FLYTO_ZOOM,
        pitch: FLYTO_PITCH,
        duration: FLYTO_DURATION,
      });
    } else {
      const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
      map.current.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 380 }, // 380 = laisse place pour le panneau détail
        pitch: 0,
        bearing: 0,
        duration: 800,
      });
    }
  }, [vehicles, filter]);

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
      // Style Mapbox — fallback sur streets-v12 si le custom style est inaccessible
      style: process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL && process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL !== "mapbox://styles/devzak/cmkwzy0w5001b01qx7653fjne"
        ? process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL
        : "mapbox://styles/mapbox/streets-v12",
      center: KINSHASA_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      pitch: 0,
      maxPitch: 85,
      bearing: 0,
      attributionControl: true,
      dragRotate: false,
      touchPitch: true,
      pitchWithRotate: true,
    });
    // Expose map instance for debugging
    (window as any).__yazzMap = map.current;

    map.current.on("load", () => {
      setMapReady(true);
      // Force resize after load — sometimes Mapbox needs a kick
      setTimeout(() => {
        map.current?.resize();
        // Fit bounds pour voir tous les markers au chargement
        fitAllMarkers();
      }, 200);
    });

    // Navigation controls — zoom only, no compass (rotation disabled)
    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false, showCompass: false }),
      "top-right"
    );

    // Resize on window resize
    const handleResize = () => map.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Re-fit bounds quand les véhicules changent (au premier chargement)
  // ⚠️ Ne pas fit si un véhicule est sélectionné (sinon reset pitch/zoom)
  useEffect(() => {
    if (!mapReady || !map.current || vehicles.length === 0 || selectedId) return;
    // Petit délai pour que les markers soient créés
    const t = setTimeout(() => fitAllMarkers(), 300);
    return () => clearTimeout(t);
  }, [mapReady, vehicles, fitAllMarkers, selectedId]);

  // Convert vehicle position to [lng, lat]
  const toLngLat = (v: Vehicle): [number, number] => {
    // Use real lat/lng if available (from Supabase)
    const lat = (v as any).lat;
    const lng = (v as any).lng;
    if (typeof lat === "number" && typeof lng === "number" && (lat !== -4.325 || lng !== 15.313)) {
      return [lng, lat];
    }
    // Fallback: project x/y around Kinshasa
    return [
      KINSHASA_CENTER[0] + (v.position.x - 50) * 0.01,
      KINSHASA_CENTER[1] + (v.position.y - 50) * -0.01,
    ];
  };

  // Update markers
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const filtered = filter === "all" ? vehicles : vehicles.filter((v) => v.status === filter);

    // Remove markers not in filtered list
    markersRef.current.forEach((marker, id) => {
      if (!filtered.find((v) => v.id === id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    filtered.forEach((v) => {
      const lngLat = toLngLat(v);
      const cfg = statusConfig[v.status];
      const isSelected = v.id === selectedId;
      // Flutter dashbord.dart:537 — opacité 1.0 si online, 0.3 si offline
      const isOffline = v.status === "offline";
      const markerOpacity = isOffline ? 0.3 : 1.0;

      // Build marker DOM element — style YAZZ Flutter
      // ⚠️ IMPORTANT : ne jamais modifier el.style.transform — Mapbox l'utilise
      // pour positionner le marker à chaque frame (surtout avec pitch 3D).
      // On wrappe le contenu dans un inner div qui gère le hover via CSS.
      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.alignItems = "center";
      el.style.lineHeight = "0"; // éviter espace sous la tige

      // Inner wrapper — gère le hover SANS toucher au transform de el
      const inner = document.createElement("div");
      inner.style.display = "flex";
      inner.style.flexDirection = "column";
      inner.style.alignItems = "center";
      inner.style.transition = "transform 0.2s ease, filter 0.2s ease";
      inner.style.transformOrigin = "bottom center"; // le pin grandit depuis le bas

      // Tige du pin (petit trait vertical pour effet 3D)
      const stem = document.createElement("div");
      stem.style.width = "2px";
      stem.style.height = `${isSelected ? 10 : 7}px`;
      stem.style.backgroundColor = cfg.color;
      stem.style.opacity = "0.6";
      stem.style.borderRadius = "1px";
      inner.appendChild(stem);

      // Cercle du marker
      const circle = document.createElement("div");
      circle.style.display = "flex";
      circle.style.alignItems = "center";
      circle.style.justifyContent = "center";
      circle.style.width = `${isSelected ? 32 : 26}px`;
      circle.style.height = `${isSelected ? 32 : 26}px`;
      circle.style.borderRadius = "50%";
      circle.style.backgroundColor = cfg.color;
      circle.style.boxShadow = `0 2px 6px rgba(0,0,0,0.3), 0 0 0 3px ${cfg.color}33`;
      circle.style.position = "relative";
      circle.style.opacity = String(markerOpacity); // Flutter: 0.3 si offline

      // Pulse ring — visible pour : moving, alert, ET le marker sélectionné
      // (Flutter : pulse autour du marker actif / en mouvement)
      const showPulse = v.status === "moving" || v.status === "alert" || isSelected;
      if (showPulse) {
        const pulse = document.createElement("div");
        pulse.style.position = "absolute";
        pulse.style.inset = isSelected ? "-10px" : "-4px";
        pulse.style.borderRadius = "50%";
        pulse.style.border = `2px solid ${cfg.color}`;
        pulse.style.backgroundColor = cfg.color;
        pulse.style.opacity = "0.4";
        pulse.style.animation = "yazz-pulse-ring 2.4s ease-out infinite";
        pulse.style.pointerEvents = "none";
        pulse.style.zIndex = "0";
        circle.appendChild(pulse);
      }

      // Icon inside marker
      const iconSize = isSelected ? 16 : 13;
      const iconHtml =
        v.status === "alert"
          ? `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="position:relative;z-index:1"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`
          : `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0.5" style="position:relative;z-index:1;transform:rotate(${v.heading || 0}deg)"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;
      circle.insertAdjacentHTML("beforeend", iconHtml);
      inner.appendChild(circle);
      el.appendChild(inner);

      // Hover : on modifie inner.style.transform (pas el.style.transform !)
      // Utilisation de listeners pour éviter les conflits avec Mapbox
      let hoverScale = 1;
      const applyTransform = () => {
        inner.style.transform = hoverScale > 1 ? `scale(${hoverScale}) translateY(-3px)` : "scale(1)";
      };
      el.addEventListener("mouseenter", () => {
        hoverScale = 1.15;
        applyTransform();
      });
      el.addEventListener("mouseleave", () => {
        hoverScale = 1;
        applyTransform();
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(v.id);
        // flyTo style Flutter yazz user — zoom 15.6, pitch 45°, 500ms
        map.current?.flyTo({
          center: lngLat,
          zoom: FLYTO_ZOOM,
          pitch: FLYTO_PITCH,
          bearing: 0,
          duration: FLYTO_DURATION,
          essential: true,
        });
      });

      // Popup
      const popup = new mapboxgl.Popup({
        offset: 22,
        closeButton: false,
        className: "yazz-mapbox-popup",
      }).setHTML(`
        <div style="padding:8px;min-width:180px;font-family:var(--font-inter),sans-serif">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <p style="font-family:var(--font-outfit),sans-serif;font-weight:600;font-size:12px;color:#1a1a2e;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px">${escapeHtml(v.name)}</p>
            <span style="background-color:${cfg.color};color:white;border-radius:999px;padding:2px 6px;font-size:9px;font-weight:700;flex-shrink:0">${cfg.label}</span>
          </div>
          <p style="font-size:10px;color:#5a5f8a;margin:2px 0 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(v.address || "—")}</p>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px">
            <span style="font-family:var(--font-outfit),sans-serif;font-weight:600;color:#2b44ee">${v.speed > 0 ? `${v.speed} km/h` : "À l'arrêt"}</span>
            <span style="color:#888ca8">Batt: ${v.battery ?? "—"}%</span>
          </div>
        </div>
      `);

      let marker = markersRef.current.get(v.id);
      if (marker) {
        marker.setLngLat(lngLat).setPopup(popup);
        marker.getElement().replaceWith(el);
        marker = new mapboxgl.Marker(el, { anchor: "bottom" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map.current);
        markersRef.current.set(v.id, marker);
      } else {
        marker = new mapboxgl.Marker(el, { anchor: "bottom" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map.current);
        markersRef.current.set(v.id, marker);
      }
    });
  }, [vehicles, filter, selectedId, mapReady, onSelect]);

  // Throttle pour le follow Realtime (Flutter: 1500ms)
  const lastFollowRef = useRef<number>(0);
  const userInteractingRef = useRef<boolean>(false);

  // Détecter quand l'utilisateur manipule la carte manuellement
  useEffect(() => {
    if (!map.current) return;
    const onDragStart = () => { userInteractingRef.current = true; };
    const onDragEnd = () => {
      // Petit délai avant de réautoriser le follow (évite re-center immédiat)
      setTimeout(() => { userInteractingRef.current = false; }, 3000);
    };
    const onZoomStart = () => { userInteractingRef.current = true; };
    const onZoomEnd = () => {
      setTimeout(() => { userInteractingRef.current = false; }, 3000);
    };
    map.current.on("dragstart", onDragStart);
    map.current.on("dragend", onDragEnd);
    map.current.on("zoomstart", onZoomStart);
    map.current.on("zoomend", onZoomEnd);
    return () => {
      map.current?.off("dragstart", onDragStart);
      map.current?.off("dragend", onDragEnd);
      map.current?.off("zoomstart", onZoomStart);
      map.current?.off("zoomend", onZoomEnd);
    };
  }, [mapReady]);

  // Suivi du véhicule sélectionné
  // - Au clic (selectedId change) → flyTo immédiat (agressif)
  // - Position update (vehicles change mais selectedId identique) → easeTo fluide avec throttle
  const prevSelectedRef = useRef<string | undefined>(undefined);
  const prevPositionRef = useRef<string>("");

  useEffect(() => {
    if (!mapReady || !map.current || !selectedId) {
      prevSelectedRef.current = selectedId;
      return;
    }

    const v = vehicles.find((x) => x.id === selectedId);
    if (!v) {
      prevSelectedRef.current = selectedId;
      return;
    }

    const lngLat = toLngLat(v);
    const posKey = `${lngLat[0].toFixed(5)},${lngLat[1].toFixed(5)}`;
    const isNewSelection = prevSelectedRef.current !== selectedId;
    const positionChanged = prevPositionRef.current !== posKey;

    // Ne rien faire si l'utilisateur est en train de manipuler la carte
    // ET que ce n'est pas une nouvelle sélection
    if (userInteractingRef.current && !isNewSelection) {
      prevSelectedRef.current = selectedId;
      return;
    }

    if (isNewSelection) {
      // Nouvelle sélection → flyTo agressif (comme Flutter ligne 969)
      map.current.flyTo({
        center: lngLat,
        zoom: FLYTO_ZOOM,
        pitch: FLYTO_PITCH,
        bearing: 0,
        duration: FLYTO_DURATION,
        essential: true,
      });
      // Force le pitch après l'animation (parfois flyTo ne l'applique pas)
      setTimeout(() => {
        if (map.current && map.current.getPitch() < 1) {
          map.current.setPitch(FLYTO_PITCH);
        }
      }, FLYTO_DURATION + 100);
    } else if (positionChanged) {
      // Position mise à jour via Realtime → easeTo fluide avec throttle 1.5s
      const now = Date.now();
      if (now - lastFollowRef.current >= 1500) {
        lastFollowRef.current = now;
        map.current.easeTo({
          center: lngLat,
          duration: 800,
          essential: true,
        });
      }
    }

    prevSelectedRef.current = selectedId;
    prevPositionRef.current = posKey;
  }, [selectedId, mapReady, vehicles]);

  const counts = useMemo(() => ({
    all: vehicles.length,
    moving: vehicles.filter((v) => v.status === "moving").length,
    idle: vehicles.filter((v) => v.status === "idle").length,
    alert: vehicles.filter((v) => v.status === "alert").length,
    offline: vehicles.filter((v) => v.status === "offline").length,
  }), [vehicles]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Mapbox container — fixed dimensions via style to ensure proper rendering */}
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Loading state */}
      {!mapReady && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-yazz-background">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-yazz-border-light border-t-yazz-primary" />
            <p className="font-inter text-[12px] font-medium text-yazz-text-muted">
              Chargement de la carte…
            </p>
          </div>
        </div>
      )}

      {/* Filter pills (overlay top-left) */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-yazz-sm bg-yazz-surface/95 p-1 yazz-glass">
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
              <span className={cn("ml-1.5", active ? "opacity-80" : "opacity-50")}>{f.count}</span>
            </button>
          );
        })}
      </div>

      {/* Scale bottom-right */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-yazz-sm bg-yazz-surface/95 px-2.5 py-1.5 yazz-glass">
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
        .mapboxgl-ctrl-top-right {
          top: 12px !important;
          right: 12px !important;
        }
        .mapboxgl-ctrl-group {
          border-radius: 9px !important;
          box-shadow: 0 1px 3px rgba(43, 68, 238, 0.12) !important;
          overflow: hidden;
          border: 1px solid #dde1f2 !important;
        }
        .mapboxgl-ctrl-group button {
          width: 32px !important;
          height: 32px !important;
        }
        .mapboxgl-ctrl-group button:hover {
          background-color: #f0f1fa !important;
        }
        .mapboxgl-ctrl-attrib {
          font-size: 9px !important;
          background: rgba(255,255,255,0.7) !important;
        }
        .mapboxgl-ctrl-attrib-button {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}
