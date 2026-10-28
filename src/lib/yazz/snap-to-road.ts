/**
 * Snap-to-Road service using Mapbox Map Matching API.
 *
 * POURQUOI : Les positions GPS sont physiquement précises (surtout avec 17 sats
 * + HDOP 0.6), mais la géométrie des routes dans Mapbox/OSM peut être décalée
 * de 10-30m à Kinshasa (données OSM incomplètes). Sans snap-to-road, le
 * marqueur apparaît "à côté de la route" alors que le GPS est bon.
 *
 * Les apps grand public (Uber, Google Maps, Waze) utilisent cette technique
 * pour "coller" le marqueur à la route la plus proche.
 *
 * CACHE : par device, avec threshold de 5m — si la nouvelle position est à
 * moins de 5m de la dernière position snappée, on retourne le cache (pas
 * d'appel API). Cache valide 5 minutes.
 *
 * FALLBACK : si l'API échoue (réseau, rate limit, token manquant), on retourne
 * null et le marqueur reste à la position GPS brute.
 *
 * API : Mapbox Map Matching v5 — `POST /matching/v5/mapbox/driving/{coords}`
 * Requiert au moins 2 coordonnées. On duplique la position pour satisfaire
 * l'API. Le paramètre `radius` (défaut 30m) spécifie la distance max pour
 * chercher une route.
 */

const SNAP_THRESHOLD_M = 5; // Ne pas re-snapper si à moins de 5m du dernier snap
const SNAP_RADIUS_M = 30;   // Distance max pour chercher une route
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type LngLat = [number, number]; // [longitude, latitude]

type SnapCacheEntry = {
  snapped: LngLat;
  raw: LngLat;
  ts: number;
};

// Cache par deviceId (en mémoire — reset au reload de la page)
const snapCache = new Map<string, SnapCacheEntry>();

/**
 * Calcule la distance haversine en mètres entre 2 points GPS.
 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Snap une position GPS à la route la plus proche via Mapbox Map Matching API.
 *
 * @param deviceId - IMEI du device (pour le cache)
 * @param rawPos - Position GPS brute [lng, lat]
 * @returns Position snappée [lng, lat] ou null si API a échoué
 */
export async function snapToRoad(
  deviceId: string,
  rawPos: LngLat,
): Promise<LngLat | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    if (typeof console !== "undefined") {
      console.warn("[snapToRoad] NEXT_PUBLIC_MAPBOX_TOKEN manquant — fallback GPS brut");
    }
    return null;
  }

  // Vérifier le cache — si la nouvelle position est à moins de 5m de la
  // dernière position snappée, retourner le cache (pas d'API call).
  const cached = snapCache.get(deviceId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    const dist = haversineMeters(rawPos[1], rawPos[0], cached.raw[1], cached.raw[0]);
    if (dist < SNAP_THRESHOLD_M) {
      return cached.snapped;
    }
  }

  try {
    // Mapbox Map Matching API requiert AU MOINS 2 coordonnées.
    // On duplique la position pour satisfaire l'API (elle va snap la 2e
    // coord à la route la plus proche, qui est la même route que la 1ère).
    const coords = `${rawPos[0]},${rawPos[1]};${rawPos[0]},${rawPos[1]}`;
    const url =
      `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}` +
      `?access_token=${token}` +
      `&radius=${SNAP_RADIUS_M}` +
      `&geometries=geojson` +
      `&overview=false`;

    const res = await fetch(url);
    if (!res.ok) {
      if (typeof console !== "undefined") {
        console.warn(`[snapToRoad] API failed (${res.status}) for ${deviceId}`);
      }
      return null;
    }
    const data = await res.json();
    if (!data?.matchings || !Array.isArray(data.matchings) || data.matchings.length === 0) {
      if (typeof console !== "undefined") {
        console.warn(`[snapToRoad] No matchings for ${deviceId} (probably no road within ${SNAP_RADIUS_M}m)`);
      }
      return null;
    }

    // La géométrie matched — prendre la DERNIÈRE coordonnée comme position
    // snappée (correspond à notre position actuelle après le match).
    const geom = data.matchings[0].geometry;
    const coordsArr = geom?.coordinates;
    if (!Array.isArray(coordsArr) || coordsArr.length === 0) return null;
    const snapped: LngLat = [coordsArr[coordsArr.length - 1][0], coordsArr[coordsArr.length - 1][1]];

    // Mettre en cache
    snapCache.set(deviceId, {
      snapped,
      raw: rawPos,
      ts: Date.now(),
    });

    return snapped;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.error(`[snapToRoad] Error for ${deviceId}:`, err);
    }
    return null;
  }
}

/**
 * Snap les positions pour tous les véhicules en parallèle.
 * Chaque snap est indépendant (avec cache). Retourne une Map deviceId → [lng, lat] snappé.
 * Les véhicules qui n'ont pas de snap (API failed) ne sont PAS dans la Map.
 */
export async function snapAllVehicles(
  vehicles: Array<{ id: string; lng: number; lat: number }>,
): Promise<Map<string, LngLat>> {
  const result = new Map<string, LngLat>();
  await Promise.all(
    vehicles.map(async (v) => {
      const snapped = await snapToRoad(v.id, [v.lng, v.lat]);
      if (snapped) result.set(v.id, snapped);
    })
  );
  return result;
}

/**
 * Clear le cache pour un device (utile quand le device revient online après
 * une longue période offline — la position snappée peut être obsolète).
 */
export function clearSnapCache(deviceId: string): void {
  snapCache.delete(deviceId);
}
