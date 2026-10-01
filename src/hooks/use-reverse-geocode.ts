"use client";

import { useState, useEffect } from "react";

type GeoAddress = {
  fullAddress: string;
  street?: string;
  commune?: string;
  quarter?: string;
  city?: string;
};

/**
 * Reverse geocoding via Mapbox Geocoding API.
 * Convertit lat/lng en adresse lisible (rue, commune, quartier).
 *
 * Utilise le token public Mapbox (NEXT_PUBLIC_MAPBOX_TOKEN).
 */
export function useReverseGeocode(lat: number | null, lng: number | null) {
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setError("Pas de token Mapbox");
      return;
    }

    setLoading(true);
    setError(null);

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&language=fr&limit=1&types=address,poi,neighborhood,place,locality`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const feature = data?.features?.[0];
        if (!feature) {
          setAddress({
            fullAddress: "Adresse inconnue",
          });
          return;
        }

        const context = feature.context || [];
        const fullAddress = feature.place_name || "Adresse inconnue";

        // Extraire les composantes depuis context
        let commune: string | undefined;
        let quarter: string | undefined;
        let city: string | undefined;

        context.forEach((c: any) => {
          if (c.id.startsWith("locality")) commune = c.text;
          else if (c.id.startsWith("neighborhood")) quarter = c.text;
          else if (c.id.startsWith("place")) city = c.text;
        });

        const street = feature.text;

        setAddress({
          fullAddress,
          street,
          commune,
          quarter,
          city,
        });
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
