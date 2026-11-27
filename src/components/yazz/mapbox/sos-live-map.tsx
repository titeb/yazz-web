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

export function SosLiveMap({ lat, lng, found }: { lat: number; lng: number; found?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

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
    map.current.easeTo({ center: [lng, lat], duration: 800 });
    return () => cancelAnimationFrame(raf);
  }, [lat, lng]);

  useEffect(() => {
    marker.current?.getElement().classList.toggle("is-found", Boolean(found));
  }, [found]);

  return (
    <div className="relative mt-3 h-48 w-full overflow-hidden rounded-yazz-sm bg-yazz-accent">
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
        .yazz-sos-marker.is-found .yazz-sos-marker-dot { background: #38a169; }
        .yazz-sos-marker.is-found .yazz-sos-marker-pulse { background: #38a169; animation: none; opacity: 0; }
      `}</style>
    </div>
  );
}
