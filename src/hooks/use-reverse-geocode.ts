"use client";

import { useState, useEffect } from "react";

type GeoAddress = {
  fullAddress: string;
  street?: string | null;
  commune?: string | null;
  quarter?: string | null;
  city?: string | null;
  region?: string | null;
};

// Cache in-memory simple (évite de re-geocoder la même position)
const cache = new Map<string, GeoAddress>();

/**
 * Reverse geocoding via OpenStreetMap Nominatim (proxy /api/geocode/reverse).
 *
 * Nominatim est meilleur que Mapbox pour Kinshasa car les contributeurs OSM
 * locaux ont mapé les rues avec leurs vrais noms (av. Kasa-Vubu, bd du 30
 * juin, etc.). Gratuit, pas de token, pas de quota.
 *
 * Même logique que le backend AI assistant (_reverseGeocode dans context.js).
 */
export function useReverseGeocode(lat: number | null, lng: number | null) {
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) return;

    // Cache : 4 décimales = précision ~11m (suffisant pour éviter re-fetch)
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      setAddress(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((data: GeoAddress) => {
        if (data.error) {
          setAddress({ fullAddress: "Localisation indisponible" });
          return;
        }
        cache.set(cacheKey, data);
        setAddress(data);
      })
      .catch((err) => {
        console.error("[useReverseGeocode] erreur:", err);
        setError(err.message);
        setAddress({ fullAddress: "Localisation indisponible" });
      })
      .finally(() => setLoading(false));
  }, [lat, lng]);

  return { address, loading, error };
}
