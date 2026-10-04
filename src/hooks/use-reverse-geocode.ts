"use client";

import { useState, useEffect } from "react";

type GeoAddress = {
  fullAddress: string;
  street?: string;
  commune?: string;
  quarter?: string;
  city?: string;
  region?: string; // province (ex: "Kongo Central", "Kinshasa")
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
        const placeType = feature.place_type?.[0] as string | undefined;
        const featureText = feature.text as string | undefined;

        // Le feature lui-même représente le résultat le plus spécifique.
        // On l'attribue selon son place_type pour ne pas confondre
        // une commune (locality) avec une rue (address).
        let commune: string | undefined;
        let quarter: string | undefined;
        let city: string | undefined;
        let region: string | undefined;
        let street: string | undefined;

        if (placeType === "address" || placeType === "poi") {
          street = featureText;
        } else if (placeType === "neighborhood") {
          quarter = featureText;
        } else if (placeType === "locality") {
          commune = featureText;
        } else if (placeType === "place") {
          // Cas important pour la RDC : quand on est dans une ville comme
          // Matadi (Kongo Central), le feature est de type "place" et
          // represente la ville. Le context ne contient PAS de "place"
          // (puisque le feature lui-même l'est). Sans cette ligne, la ville
          // n'était jamais affichée hors de Kinshasa.
          city = featureText;
        } else {
          street = featureText;
        }

        // Remplit la hiérarchie parente depuis context
        context.forEach((c: any) => {
          const prefix = c.id.split(".")[0];
          if (prefix === "locality" && !commune) commune = c.text;
          else if (prefix === "neighborhood" && !quarter) quarter = c.text;
          else if (prefix === "place" && !city) city = c.text;
          else if (prefix === "region") region = c.text;
        });

        setAddress({
          fullAddress,
          street,
          commune,
          quarter,
          city,
          region,
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
