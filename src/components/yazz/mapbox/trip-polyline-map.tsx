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
          "line-opacity": 0.25,
          "line-blur": 4,
        },
      });

      // Layer ligne principale — opacity fade-in (fiable, marche sur tous les mapbox-gl)
      // FIX 2026-11-05 : avant utilisait line-trim-offset [0,0]→[0,1] qui au
      // final masquait TOUTE la ligne (la ligne disparaissait à la fin de
      // l'animation). Retour au fade-in opacity classique, garanti visible.
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
          "line-width": 4,
          "line-opacity": 0, // démarre invisible, fade-in à 1
        },
      });

      // Animation fade-in (0 → 1 en 1.4s, ease-out cubic — feel pro)
      const startTime = performance.now();
      const duration = 1400;
      const animateFadeIn = (now: number) => {
        if (!map.current) return;
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        map.current.setPaintProperty(lineId, "line-opacity", eased);
        if (t < 1) requestAnimationFrame(animateFadeIn);
      };
      requestAnimationFrame(animateFadeIn);

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

          // FIX 2026-11-05 : avant on sautait l'update si snapped.length ==
          // polyline.length (heuristique cassée — si le snap réussissait avec
          // peu de points ajoutés, on skipait l'update). Maintenant on update
          // TOUJOURS si snapped a des coordonnées différentes du brut.
          // Détecte différence en comparant le 1er ET dernier point.
          const sameFirst =
            snapped.length > 0 &&
            Math.abs(snapped[0].lat - polyline[0].lat) < 1e-9 &&
            Math.abs(snapped[0].lng - polyline[0].lng) < 1e-9;
          const sameLast =
            snapped.length > 0 &&
            Math.abs(snapped[snapped.length - 1].lat - polyline[polyline.length - 1].lat) < 1e-9 &&
            Math.abs(snapped[snapped.length - 1].lng - polyline[polyline.length - 1].lng) < 1e-9;
          // Si 1er et dernier identiques ET même nombre de points → probablement
          // le fallback (pas de snap), on ne fait rien
          if (sameFirst && sameLast && snapped.length === polyline.length) {
            setSnapping(false);
            return;
          }

          const snappedCoords: [number, number][] = snapped.map((p) => [p.lng, p.lat]);

          // Mettre à jour la source GeoJSON avec les coords snappées
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
