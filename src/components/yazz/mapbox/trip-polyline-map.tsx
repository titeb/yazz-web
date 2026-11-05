"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { snapPolylineToRoad, type PolylinePoint } from "@/lib/yazz/snap-polyline";

type TripPolylineMapProps = {
  polyline: PolylinePoint[];
  tripId: string;
};

/**
 * Carte Mapbox dédiée à l'aperçu d'un trajet dans le modal de détail.
 *
 * 2-phase rendering :
 *   1. Au montage : affiche la polyline BRUTE immédiatement (ligne droite
 *      entre points GPS), avec animation "draw" via line-trim-offset.
 *   2. En parallèle : appelle Mapbox Map Matching API pour "snapper" les
 *      points GPS au réseau routier réel. Quand le résultat arrive, on
 *      remplace la source GeoJSON → la ligne se "colle" aux routes.
 *
 * Cache localStorage par tripId → les ré-ouvertures sont instantanées.
 *
 * Markers départ (vert) + arrivée (rouge) avec halo pulsant CSS.
 */
export function TripPolylineMap({ polyline, tripId }: TripPolylineMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [snapping, setSnapping] = useState(false);

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
      new mapboxgl.LngLatBounds(coords[0], coords[0]),
    );

    // Style Mapbox — fallback sur streets-v12 si custom style inaccessible
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

    map.current.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false, showCompass: false }),
      "bottom-right",
    );

    map.current.on("load", () => {
      const m = map.current;
      if (!m) return;

      const sourceId = `route-${tripId}`;
      const glowId = `route-glow-${tripId}`;
      const lineId = `route-${tripId}`;

      // Source GeoJSON avec les points BRUTS pour affichage immédiat
      m.addSource(sourceId, {
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

      // Layer glow sous la ligne (effet lueur)
      m.addLayer({
        id: glowId,
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#2B44EE",
          "line-width": 10,
          "line-opacity": 0.18,
          "line-blur": 4,
        },
      });

      // Layer ligne principale
      // Animation "draw" via line-trim-offset : [0, 0] → [0, 1]
      // line-trim-offset supporté par mapbox-gl v2.11+ (on a 3.32 ✅)
      m.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#2B44EE",
          "line-width": 3.5,
          "line-opacity": 1,
          "line-trim-offset": [0, 0], // au début : rien visible
        },
      });

      // Animation "draw" : la ligne se dessine progressivement (1.4s)
      const startTime = performance.now();
      const duration = 1400;
      const animateDraw = (now: number) => {
        if (!map.current) return;
        const t = Math.min(1, (now - startTime) / duration);
        // ease-in-out cubic pour feel pro
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        map.current.setPaintProperty(lineId, "line-trim-offset", [0, eased]);
        if (t < 1) requestAnimationFrame(animateDraw);
      };
      requestAnimationFrame(animateDraw);

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

      // === SNAP-TO-ROAD ===
      // En asynchrone : appelle Mapbox Map Matching pour snapper la polyline
      // au réseau routier. Au retour, remplace la source GeoJSON.
      // Si le cache localStorage existe déjà pour ce trip, c'est instantané.
      const sourceRef = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (!sourceRef) return;

      setSnapping(true);
      snapPolylineToRoad(polyline, tripId)
        .then((snapped) => {
          if (!map.current) return;
          // Si snapped == polyline (fallback), rien à faire
          if (snapped.length === polyline.length) {
            // Heuristique: si même longueur, c'est probablement le fallback
            // (les résultats Map Matching ont généralement beaucoup plus de
            // points car ils ajoutent les vertices routiers)
            // On compare quand même les 2 premiers points
            const same =
              snapped[0].lat === polyline[0].lat &&
              snapped[0].lng === polyline[0].lng;
            if (same) {
              setSnapping(false);
              return;
            }
          }

          const snappedCoords: [number, number][] = snapped.map((p) => [p.lng, p.lat]);

          // Mettre à jour la source GeoJSON
          sourceRef.setData({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: snappedCoords,
            },
          } as any);

          // Re-fit bounds sur le nouveau tracé (au cas où la route snappée
          // déborde légèrement des bounds initiaux)
          const newBounds = snappedCoords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(snappedCoords[0], snappedCoords[0]),
          );
          map.current.fitBounds(newBounds, {
            padding: 40,
            pitch: 0,
            bearing: 0,
            duration: 600,
          });

          setSnapping(false);
        })
        .catch((err) => {
          console.warn("[trip-polyline-map] snap échoué:", err);
          setSnapping(false);
        });
    });

    // Force resize après mount (Mapbox dans un modal needs a kick)
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

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {/* Badge " snapping en cours" — discret en haut à gauche */}
      {snapping && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-yazz-sm bg-white/90 px-2 py-1 shadow-sm backdrop-blur-sm">
          <div className="h-2 w-2 animate-spin rounded-full border-2 border-yazz-primary border-t-transparent" />
          <span className="font-inter text-[10px] font-medium text-yazz-text-body">
            Collage aux routes…
          </span>
        </div>
      )}
    </div>
  );
}
