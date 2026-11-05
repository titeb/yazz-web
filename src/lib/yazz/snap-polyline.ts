/**
 * Snap-to-Road pour POLYLINE (pas une position unique).
 *
 * Utilise Mapbox Map Matching API v5 pour "coller" une série de points GPS
 * bruts au réseau routier réel. Sans ça, la ligne coupe en ligne droite entre
 * 2 points GPS espacés (ex: 1 point toutes les 30s) → la polyline traverse
 * les pâtés de maisons au lieu de suivre la route.
 *
 * API: POST /matching/v5/mapbox/driving/{lng,lat;lng,lat;...}
 * - Max 100 coordonnées par requête
 * - Rate limit: 3000 req/month (free), 16 req/min
 * - Retourne le tracé matched + geometry GeoJSON
 *
 * CHUNKING: si > 100 points, on découpe en chunks de 100 (avec 1 point de
 * chevauchement pour éviter les discontinuités) et on concatène les résultats.
 *
 * FALLBACK: si l'API échoue (réseau, rate limit, token manquant), on retourne
 * les points bruts — l'utilisateur voit la ligne droite au lieu du tracé routier,
 * mais au moins il voit quelque chose.
 *
 * CACHE: localStorage par tripId — si le même trip est ré-ouvert, on retourne
 * le cache sans re-appeler l'API.
 */

const MAX_POINTS_PER_REQUEST = 100;
const CACHE_KEY_PREFIX = "yazz:snap:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export type PolylinePoint = { lat: number; lng: number };

type CacheEntry = {
  snapped: PolylinePoint[];
  ts: number;
};

/**
 * Haversine distance en mètres entre 2 points GPS.
 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Découpe un tableau en chunks de taille `size`, avec `overlap` points de
 * chevauchement entre chunks consécutifs (pour éviter les trous).
 */
function chunkWithOverlap<T>(arr: T[], size: number, overlap: number): T[][] {
  if (arr.length <= size) return [arr];
  const chunks: T[][] = [];
  const step = size - overlap;
  for (let i = 0; i < arr.length; i += step) {
    const chunk = arr.slice(i, i + size);
    if (chunk.length < 2) break;
    chunks.push(chunk);
    if (i + size >= arr.length) break;
  }
  return chunks;
}

/**
 * Appelle Mapbox Map Matching pour 1 chunk de ≤100 points.
 * Retourne le tableau de coordonnées snappées [lng, lat][].
 */
async function matchChunk(
  points: PolylinePoint[],
  token: string,
): Promise<[number, number][]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  // tidy=true supprime les points impossibles à matcher
  // overview=full retourne toute la géométrie
  // geometries=geojson pour parser facilement
  // radius=30 tolère 30m de distance max entre point GPS et route
  const url =
    `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}` +
    `?access_token=${token}` +
    `&geometries=geojson` +
    `&overview=full` +
    `&radius=30` +
    `&tidy=true` +
    `&steps=false`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Map Matching API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data?.matchings || !Array.isArray(data.matchings) || data.matchings.length === 0) {
    throw new Error("No matchings returned");
  }
  const geom = data.matchings[0].geometry;
  if (!geom?.coordinates || !Array.isArray(geom.coordinates)) {
    throw new Error("Invalid geometry");
  }
  return geom.coordinates as [number, number][];
}

/**
 * Snap une polyline entière au réseau routier.
 *
 * @param points - Points GPS bruts {lat, lng}
 * @param tripId - ID du trip (pour cache localStorage)
 * @returns Points snappés {lat, lng} suivant les roads réelles
 */
export async function snapPolylineToRoad(
  points: PolylinePoint[],
  tripId: string,
): Promise<PolylinePoint[]> {
  if (!points || points.length < 2) return points;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.warn(
      "[snap-polyline] NEXT_PUBLIC_MAPBOX_TOKEN manquant — fallback GPS brut",
    );
    return points;
  }

  // 1. Vérifier le cache
  if (typeof window !== "undefined" && window.localStorage) {
    const cacheKey = `${CACHE_KEY_PREFIX}${tripId}`;
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached);
        if (Date.now() - entry.ts < CACHE_TTL_MS && entry.snapped?.length > 0) {
          return entry.snapped;
        }
      }
    } catch {
      // Cache corrompu — on ignore
    }
  }

  // 2. Chunker si > 100 points (overlap de 1 pour continuité)
  const chunks = chunkWithOverlap(points, MAX_POINTS_PER_REQUEST, 1);

  // 3. Matcher chaque chunk séquentiellement (pas en parallèle pour éviter
  //    de spammer l'API — rate limit 16 req/min)
  const snappedChunks: [number, number][][] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const matched = await matchChunk(chunks[i], token);
      // Si pas le premier chunk, on retire le 1er point (chevauchement)
      if (i > 0 && matched.length > 1) {
        snappedChunks.push(matched.slice(1));
      } else {
        snappedChunks.push(matched);
      }
    } catch (e) {
      // Fallback: ce chunk reste en points bruts
      console.warn(`[snap-polyline] Chunk ${i + 1}/${chunks.length} échoué:`, e);
      const fallback = chunks[i].map((p) => [p.lng, p.lat] as [number, number]);
      if (i > 0 && fallback.length > 1) {
        snappedChunks.push(fallback.slice(1));
      } else {
        snappedChunks.push(fallback);
      }
    }
  }

  // 4. Concaténer les chunks
  const snappedCoords: [number, number][] = snappedChunks.flat();
  const snapped: PolylinePoint[] = snappedCoords.map(([lng, lat]) => ({ lat, lng }));

  // Vérifier qu'on a bien un résultat exploitable
  if (snapped.length < 2) {
    console.warn("[snap-polyline] Résultat snapped trop court — fallback brut");
    return points;
  }

  // 5. Mettre en cache
  if (typeof window !== "undefined" && window.localStorage) {
    const cacheKey = `${CACHE_KEY_PREFIX}${tripId}`;
    try {
      const entry: CacheEntry = { snapped, ts: Date.now() };
      window.localStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch {
      // Quota localStorage dépassé — on ignore
    }
  }

  return snapped;
}

/**
 * Calcule le TEMPS DE CONDUITE réel d'un trip à partir de sa polyline.
 *
 * "Temps de conduite" = somme des intervalles entre points GPS où le véhicule
 * était réellement en mouvement (a bougé de > 10m entre 2 points).
 *
 * Ça exclut donc les arrêts < 25 min à l'intérieur d'un trip (feux rouges,
 * embouteillages, pauses courtes) qui sont actuellement inclus dans la
 * "Durée" totale du trip (endedAt - startedAt).
 *
 * @param polyline - Points GPS avec timestamps
 * @returns Temps de conduite en minutes
 */
export function computeDrivingTimeMin(
  polyline: Array<{ lat?: number; lng?: number; ts?: string; timestamp?: string }> | null | undefined,
): number {
  if (!polyline || polyline.length < 2) return 0;

  let drivingMs = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    if (!p1 || !p2) continue;

    const lat1 = p1.lat;
    const lng1 = p1.lng;
    const lat2 = p2.lat;
    const lng2 = p2.lng;
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) continue;

    const ts1 = p1.ts ?? p1.timestamp;
    const ts2 = p2.ts ?? p2.timestamp;
    if (!ts1 || !ts2) continue;

    const t1 = new Date(ts1).getTime();
    const t2 = new Date(ts2).getTime();
    const gapMs = t2 - t1;
    if (gapMs <= 0 || gapMs > 25 * 60 * 1000) continue; // ignore gaps > 25 min

    const dist = haversineMeters(lat1, lng1, lat2, lng2);
    // Véhicule en mouvement si > 10m parcourus (évite le bruit GPS)
    if (dist > 10) {
      drivingMs += gapMs;
    }
  }

  return drivingMs / 60000;
}
