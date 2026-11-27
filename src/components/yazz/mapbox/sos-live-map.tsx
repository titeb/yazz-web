"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/**
 * Carte d'une alerte SOS pour les vigiles : le véhicule volé est un marqueur
 * rouge qui pulse (différent des véhicules du propriétaire) et qui glisse
 * vers chaque nouvelle position reçue en direct.
 */
function styleUrl(): string {
  const url = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL;
  return url && url !== "mapbox://styles/devzak/cmkwzy0w5001b01qx7653fjne" ? url : "mapbox://styles/mapbox/streets-v12";
}

type LngLat = [number, number];

function meters(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * [me] (position du vigile, après son autorisation) : son point bleu et
 * l'itinéraire en voiture jusqu'au véhicule volé, recalculé quand l'un ou
 * l'autre bouge (au plus toutes les 15 s).
 */
export function SosLiveMap({
  lat,
  lng,
  found,
  me,
}: {
  lat: number;
  lng: number;
  found?: boolean;
  me?: { lat: number; lng: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const meMarker = useRef<mapboxgl.Marker | null>(null);
  const lastRoute = useRef<{ t: number; a: LngLat; b: LngLat } | null>(null);
  const fitted = useRef(false);
  const following = useRef(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!box.current || !token || map.current) return;
    mapboxgl.accessToken = token;
    try {
      map.current = new mapboxgl.Map({
        container: box.current,
        style: styleUrl(),
        center: [lng, lat],
        zoom: 14,
        attributionControl: false,
      });
    } catch (e) {
      console.error("[SOS] carte indisponible", e);
      return;
    }
    const el = document.createElement("div");
    el.className = "yazz-sos-marker";
    el.innerHTML = '<span class="yazz-sos-marker-pulse"></span><span class="yazz-sos-marker-dot"></span>';
    marker.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map.current);
    return () => {
      marker.current?.remove();
      meMarker.current?.remove();
      meMarker.current = null;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nouvelle position : le marqueur glisse, la carte suit en douceur
  useEffect(() => {
    if (!marker.current || !map.current) return;
    const from = marker.current.getLngLat();
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      const e = 1 - Math.pow(1 - k, 3);
      marker.current?.setLngLat([from.lng + (lng - from.lng) * e, from.lat + (lat - from.lat) * e]);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // En suivi, la carte montre tout le trajet : on ne recentre pas sur le véhicule
    if (!following.current) map.current.easeTo({ center: [lng, lat], duration: 800 });
    return () => cancelAnimationFrame(raf);
  }, [lat, lng]);

  useEffect(() => {
    marker.current?.getElement().classList.toggle("is-found", Boolean(found));
  }, [found]);

  // Suivi : ma position + itinéraire jusqu'au véhicule
  const meLat = me?.lat;
  const meLng = me?.lng;
  useEffect(() => {
    const m = map.current;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!m || meLat == null || meLng == null || !token) return;
    following.current = true;
    const a: LngLat = [meLng, meLat];
    const b: LngLat = [lng, lat];
    if (!meMarker.current) {
      const el = document.createElement("div");
      el.className = "yazz-me-marker";
      meMarker.current = new mapboxgl.Marker({ element: el }).setLngLat(a).addTo(m);
    } else {
      meMarker.current.setLngLat(a);
    }
    const prev = lastRoute.current;
    if (prev && Date.now() - prev.t < 15000 && meters(prev.a, a) < 60 && meters(prev.b, b) < 60) return;
    lastRoute.current = { t: Date.now(), a, b };
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${a[0]},${a[1]};${b[0]},${b[1]}?geometries=geojson&overview=full&access_token=${token}`
    )
      .then((r) => r.json())
      .then((j) => {
        const geom = j?.routes?.[0]?.geometry;
        if (!geom || !map.current) return;
        const data = { type: "Feature" as const, properties: {}, geometry: geom };
        const apply = () => {
          const mm = map.current;
          if (!mm) return;
          const src = mm.getSource("sos-route") as mapboxgl.GeoJSONSource | undefined;
          if (src) src.setData(data);
          else {
            mm.addSource("sos-route", { type: "geojson", data });
            mm.addLayer({
              id: "sos-route-line",
              type: "line",
              source: "sos-route",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#2B44EE", "line-width": 5, "line-opacity": 0.9 },
            });
          }
          if (!fitted.current) {
            fitted.current = true;
            const bounds = new mapboxgl.LngLatBounds(a, a);
            (geom.coordinates as LngLat[]).forEach((c) => bounds.extend(c));
            mm.fitBounds(bounds, { padding: 40, duration: 900 });
          }
        };
        if (map.current.isStyleLoaded()) apply();
        else map.current.once("load", apply);
      })
      .catch(() => {
        /* sans itinéraire : les deux points restent visibles */
      });
  }, [meLat, meLng, lat, lng]);

  return (
    <div className="relative h-60 w-full overflow-hidden rounded-yazz-sm bg-yazz-accent">
      <div ref={box} className="absolute inset-0" />
      <style jsx global>{`
        .yazz-sos-marker { position: relative; width: 22px; height: 22px; }
        .yazz-sos-marker-dot {
          position: absolute; inset: 3px; border-radius: 9999px; background: #e53e3e;
          border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        .yazz-sos-marker-pulse {
          position: absolute; inset: 0; border-radius: 9999px; background: #e53e3e;
          animation: yazz-pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .yazz-me-marker {
          width: 18px; height: 18px; border-radius: 9999px; background: #2b44ee;
          border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(43, 68, 238, 0.18), 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        .yazz-sos-marker.is-found .yazz-sos-marker-dot { background: #38a169; }
        .yazz-sos-marker.is-found .yazz-sos-marker-pulse { background: #38a169; animation: none; opacity: 0; }
      `}</style>
    </div>
  );
}
