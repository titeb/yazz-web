"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type TripPolylineMapProps = {
  polyline: Array<{ lat: number; lng: number }>;
  tripId: string;
};

/**
 * Carte Mapbox dédiée à l'aperçu d'un trajet dans le modal de détail.
 * - Fit automatiquement sur les points du trajet
 * - Ligne polyline avec fade-in + glow
 * - Pastilles départ (vert) / arrivée (rouge) avec halo pulsant CSS
 * - Zoom/déplacement activés, rotation désactivée (simple)
 */
export function TripPolylineMap({ polyline, tripId }: TripPolylineMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    if (!polyline || polyline.length < 2) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("❌ NEXT_PUBLIC_MAPBOX_TOKEN manquant");
      return;
    }
    mapboxgl.accessToken = token;

    // Coordonnées [lng, lat] pour Mapbox + bounds
    const coords: [number, number][] = polyline.map((p) => [p.lng, p.lat]);
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    );

    // Style Mapbox — fallback sur streets-v12 si le custom style est inaccessible
    // (même logique que yazz-mapbox.tsx)
    const styleUrl = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL;
    const style =
      styleUrl && styleUrl !== "mapbox://styles/devzak/cmkwzy0w5001b01qx7653fjne"
        ? styleUrl
        : "mapbox://styles/mapbox/streets-v12";

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style,
      bounds,
      fitBoundsOptions: { padding: 40, pitch: 0, bearing: 0 },
      interactive: true,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false,
    });

    // Zoom controls en bas à droite (comme yazz-mapbox.tsx)
    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false, showCompass: false }),
      "bottom-right"
    );

    map.current.on("load", () => {
      const m = map.current;
      if (!m) return;

      // Source GeoJSON de la polyline
      m.addSource(`route-${tripId}`, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coords,
          },
        } as any,
      });

      // Layer glow (large + flou, sous la ligne principale)
      m.addLayer({
        id: `route-glow-${tripId}`,
        type: "line",
        source: `route-${tripId}`,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#2B44EE",
          "line-width": 10,
          "line-opacity": 0.15,
          "line-blur": 4,
        },
      });

      // Layer ligne principale — fade-in animé
      m.addLayer({
        id: `route-${tripId}`,
        type: "line",
        source: `route-${tripId}`,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#2B44EE",
          "line-width": 3.5,
          "line-opacity": 0,
        },
      });

      // Animation fade-in (0 → 1 en ~1s)
      let opacity = 0;
      const startTime = performance.now();
      const duration = 1000;
      const animateLine = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        opacity = eased;
        m.setPaintProperty(`route-${tripId}`, "line-opacity", opacity);
        if (t < 1) requestAnimationFrame(animateLine);
      };
      requestAnimationFrame(animateLine);

      // Markers départ + arrivée (pastilles avec halo pulsant CSS)
      const startEl = document.createElement("div");
      startEl.className = "yazz-trip-marker yazz-trip-marker-start";
      startEl.innerHTML =
        '<div class="yazz-trip-marker-pulse"></div><div class="yazz-trip-marker-dot"></div>';
      new mapboxgl.Marker({ element: startEl, anchor: "center" })
        .setLngLat(coords[0])
        .addTo(m);

      const endEl = document.createElement("div");
      endEl.className = "yazz-trip-marker yazz-trip-marker-end";
      endEl.innerHTML =
        '<div class="yazz-trip-marker-pulse"></div><div class="yazz-trip-marker-dot"></div>';
      new mapboxgl.Marker({ element: endEl, anchor: "center" })
        .setLngLat(coords[coords.length - 1])
        .addTo(m);
    });

    // Force resize après mount (Mapbox parfois needs a kick dans un modal)
    const resizeTimer = setTimeout(() => {
      map.current?.resize();
    }, 300);

    // Cleanup
    return () => {
      clearTimeout(resizeTimer);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [polyline, tripId]);

  return <div ref={mapContainer} className="h-full w-full" />;
}
