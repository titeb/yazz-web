"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { PLACE_TYPE_EMOJI, placeLabel, type UserPlace } from "@/lib/yazz/places";

/** Kinshasa (Gombe) : centre par défaut quand il n'y a encore rien à montrer. */
const KINSHASA: [number, number] = [15.3136, -4.3105];

function styleUrl(): string {
  const url = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL;
  return url && url !== "mapbox://styles/devzak/cmkwzy0w5001b01qx7653fjne"
    ? url
    : "mapbox://styles/mapbox/streets-v12";
}

function token(): string | null {
  const t = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!t) {
    console.error("❌ NEXT_PUBLIC_MAPBOX_TOKEN manquant");
    return null;
  }
  return t;
}

/** Cercle (polygone à 48 côtés) de rayon r mètres autour d'un point. */
function circle(lng: number, lat: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return pts;
}

function pinElement(emoji: string, selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "yazz-place-pin" + (selected ? " is-selected" : "");
  el.innerHTML = `<span>${emoji}</span>`;
  return el;
}

const PIN_CSS = `
.yazz-place-pin{width:38px;height:38px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);
  background:#fff;border:2px solid #2B44EE;display:grid;place-items:center;cursor:pointer;
  box-shadow:0 6px 16px rgba(26,31,54,.25);transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s}
.yazz-place-pin span{transform:rotate(45deg);font-size:17px;line-height:1}
.yazz-place-pin.is-selected{background:#2B44EE;transform:rotate(-45deg) scale(1.15)}
.yazz-place-pin:hover{transform:rotate(-45deg) scale(1.08)}
`;

function useInjectPinCss() {
  useEffect(() => {
    if (document.getElementById("yazz-place-pin-css")) return;
    const s = document.createElement("style");
    s.id = "yazz-place-pin-css";
    s.textContent = PIN_CSS;
    document.head.appendChild(s);
  }, []);
}

type PlacesMapProps = {
  places: UserPlace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Où centrer la carte quand il n'y a encore aucun lieu (ex. un véhicule). */
  fallbackCenter?: { lat: number; lng: number } | null;
};

/** Carte de tous les lieux : une épingle par lieu, avec son rayon. */
export function PlacesMap({ places, selectedId, onSelect, fallbackCenter }: PlacesMapProps) {
  useInjectPinCss();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!container.current || map.current) return;
    const t = token();
    if (!t) return;
    mapboxgl.accessToken = t;
    const center: [number, number] = fallbackCenter ? [fallbackCenter.lng, fallbackCenter.lat] : KINSHASA;
    const m = new mapboxgl.Map({
      container: container.current,
      style: styleUrl(),
      center,
      zoom: 11.5,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      m.addSource("place-radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "place-radius-fill",
        type: "fill",
        source: "place-radius",
        paint: { "fill-color": "#2B44EE", "fill-opacity": 0.1 },
      });
      m.addLayer({
        id: "place-radius-line",
        type: "line",
        source: "place-radius",
        paint: { "line-color": "#2B44EE", "line-width": 1.5, "line-opacity": 0.5 },
      });
      setReady(true);
    });
    map.current = m;
    const markerMap = markers.current;
    return () => {
      markerMap.forEach((mk) => mk.remove());
      markerMap.clear();
      m.remove();
      map.current = null;
      setReady(false);
    };
    // fallbackCenter : seulement au premier affichage
  }, []);

  // Épingles et rayons
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    {
      const src = m.getSource("place-radius") as mapboxgl.GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: places.map((p) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [circle(p.lng, p.lat, p.radiusM)] },
        })),
      } as any);
      const keep = new Set(places.map((p) => p.id));
      markers.current.forEach((mk, id) => {
        if (!keep.has(id)) {
          mk.remove();
          markers.current.delete(id);
        }
      });
      for (const p of places) {
        const selected = p.id === selectedId;
        const old = markers.current.get(p.id);
        if (old) {
          old.setLngLat([p.lng, p.lat]);
          old.getElement().classList.toggle("is-selected", selected);
          old.getElement().innerHTML = `<span>${PLACE_TYPE_EMOJI[p.type]}</span>`;
          old.getElement().title = placeLabel(p.name);
          continue;
        }
        const el = pinElement(PLACE_TYPE_EMOJI[p.type], selected);
        el.title = placeLabel(p.name);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(p.id);
        });
        markers.current.set(p.id, new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m));
      }
    }
  }, [places, selectedId, ready]);

  // Cadrage : le lieu choisi, sinon tous les lieux
  const framedFor = useRef<string>("");
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const sel = places.find((p) => p.id === selectedId);
    const key = sel ? `sel:${sel.id}:${sel.lat}:${sel.lng}` : `all:${places.map((p) => p.id).join(",")}`;
    if (framedFor.current === key) return;
    framedFor.current = key;
    if (sel) {
      m.flyTo({ center: [sel.lng, sel.lat], zoom: Math.max(m.getZoom(), 15), duration: 900 });
    } else if (places.length === 1) {
      m.jumpTo({ center: [places[0].lng, places[0].lat], zoom: 14.5 });
    } else if (places.length > 1) {
      const b = new mapboxgl.LngLatBounds();
      places.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
    }
  }, [places, selectedId]);

  return <div ref={container} className="h-full w-full" />;
}

type PlacePickerMapProps = {
  value: { lat: number; lng: number } | null;
  /** Centre de départ si aucun point n'est encore choisi. */
  center?: { lat: number; lng: number } | null;
  emoji: string;
  onChange: (p: { lat: number; lng: number }) => void;
};

/** Petite carte pour poser ou déplacer l'épingle d'un lieu (toucher / glisser). */
export function PlacePickerMap({ value, center, emoji, onChange }: PlacePickerMapProps) {
  useInjectPinCss();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!container.current || map.current) return;
    const t = token();
    if (!t) return;
    mapboxgl.accessToken = t;
    const start = value ?? center;
    const m = new mapboxgl.Map({
      container: container.current,
      style: styleUrl(),
      center: start ? [start.lng, start.lat] : KINSHASA,
      zoom: start ? 15.5 : 11.5,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("click", (e) => onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    map.current = m;
    return () => {
      marker.current?.remove();
      marker.current = null;
      m.remove();
      map.current = null;
    };
    // value / center : seulement au premier affichage (ensuite l'épingle suit)
  }, []);

  // Épingle : suit la valeur (recherche, véhicule, toucher) et se glisse
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const el = pinElement(emoji, true);
      marker.current = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: true })
        .setLngLat([value.lng, value.lat])
        .addTo(m);
      marker.current.on("dragend", () => {
        const ll = marker.current!.getLngLat();
        onChangeRef.current({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      marker.current.setLngLat([value.lng, value.lat]);
      marker.current.getElement().innerHTML = `<span>${emoji}</span>`;
    }
    const c = m.getCenter();
    const far = Math.abs(c.lat - value.lat) > 0.002 || Math.abs(c.lng - value.lng) > 0.002;
    if (far) m.flyTo({ center: [value.lng, value.lat], zoom: Math.max(m.getZoom(), 15.5), duration: 700 });
  }, [value, emoji]);

  return <div ref={container} className="h-full w-full" />;
}
