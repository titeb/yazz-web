/**
 * Détection des trajets à partir des points GPS bruts — mêmes règles que
 * l'app Flutter (lib/back/services/historyService/trip_detector.dart).
 *
 * Un trajet est coupé :
 *   1. aux trous de données (plus de 5 min sans point, boîtier éteint) ;
 *   2. aux STATIONNEMENTS : au moins 5 min à moins de 3 km/h sans sortir
 *      d'un rayon de 50 m. Indispensable pour les boîtiers qui envoient leur
 *      position même garés (contact toujours « allumé », ex. RAV4) : sans ça,
 *      la nuit et les stationnements faisaient partie du trajet et la
 *      timeline restait sur « Départ » (jamais de « Stationnement actuel »,
 *      ni « Arrêt détecté » / « Reprise »).
 * Le trajet finit au premier point du stationnement, le suivant part du
 * dernier. Les arrêts de moins de 5 min (feu, bouchon) restent dans le trajet.
 *
 * Un trajet doit faire au moins 3 points, s'éloigner d'au moins 100 m de son
 * départ et atteindre 5 km/h : la dérive GPS d'un véhicule garé ne crée pas
 * de faux trajet.
 *
 * Distance : Haversine (6371 km), segments à vitesse implicite entre 1 et
 * 200 km/h, arrondie à 2 décimales — comme process_gps_trips() en base.
 */

export type GpsPoint = {
  lat: number;
  lng: number;
  speed: number | null;
  timestamp: string;
};

export type DetectedTrip = {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number | null;
  polyline: GpsPoint[] | null;
  summary: { point_count: number; max_speed: number; avg_speed: number } | any;
  stops?: any[];
  startAddress?: string | null;
  endAddress?: string | null;
};

const STOP_SPEED_KMH = 3;
const MAX_GAP_MS = 5 * 60 * 1000;
const MIN_PARK_MS = 5 * 60 * 1000;
const PARK_RADIUS_M = 50;
const MIN_TRIP_DISPLACEMENT_M = 100;
const MIN_TRIP_MAX_SPEED = 5;

const ms = (iso: string) => new Date(iso).getTime();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const isStill = (p: GpsPoint) => (p.speed ?? 0) < STOP_SPEED_KMH;

/** Découpe les points (triés) en morceaux « en mouvement ». */
export function movingPieces(points: GpsPoint[]): GpsPoint[][] {
  const pieces: GpsPoint[][] = [];
  let current: GpsPoint[] = [];
  let i = 0;
  while (i < points.length) {
    const p = points[i];
    if (current.length > 0 && ms(p.timestamp) - ms(current[current.length - 1].timestamp) > MAX_GAP_MS) {
      pieces.push(current);
      current = [];
    }
    if (!isStill(p)) {
      current.push(p);
      i++;
      continue;
    }
    // Suite de points à l'arrêt autour de p
    let j = i;
    while (j + 1 < points.length) {
      const next = points[j + 1];
      if (!isStill(next)) break;
      if (ms(next.timestamp) - ms(points[j].timestamp) > MAX_GAP_MS) break;
      if (haversineKm(p.lat, p.lng, next.lat, next.lng) * 1000 > PARK_RADIUS_M) break;
      j++;
    }
    if (ms(points[j].timestamp) - ms(p.timestamp) >= MIN_PARK_MS) {
      // Stationnement : le trajet s'arrête ici, le suivant partira d'ici.
      current.push(p);
      pieces.push(current);
      current = [points[j]];
    } else {
      // Arrêt court (feu, bouchon) : il reste dans le trajet.
      current.push(...points.slice(i, j + 1));
    }
    i = j + 1;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

function isRealTrip(piece: GpsPoint[]): boolean {
  if (piece.length < 3) return false;
  const first = piece[0];
  let maxDisplacement = 0;
  let maxSpeed = 0;
  let hasSpeed = false;
  for (const p of piece) {
    maxDisplacement = Math.max(maxDisplacement, haversineKm(first.lat, first.lng, p.lat, p.lng) * 1000);
    if (p.speed != null) {
      hasSpeed = true;
      maxSpeed = Math.max(maxSpeed, p.speed);
    }
  }
  if (maxDisplacement < MIN_TRIP_DISPLACEMENT_M) return false;
  return !hasSpeed || maxSpeed >= MIN_TRIP_MAX_SPEED;
}

function buildTrip(deviceId: string, points: GpsPoint[]): DetectedTrip {
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dtS = (ms(b.timestamp) - ms(a.timestamp)) / 1000;
    if (dtS <= 0) continue;
    const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
    const implied = d / (dtS / 3600);
    if (implied >= 1 && implied <= 200) distance += d;
  }
  const speeds = points.map((p) => p.speed ?? 0);
  const startedAt = points[0].timestamp;
  const endedAt = points[points.length - 1].timestamp;
  return {
    // Id stable pendant le trajet (le départ ne bouge plus) : l'adresse de
    // départ reste affichée pendant que le trajet s'allonge.
    id: `live-${ms(startedAt)}`,
    deviceId,
    startedAt,
    endedAt,
    distanceKm: Math.round(distance * 100) / 100,
    polyline: points,
    summary: {
      point_count: points.length,
      max_speed: Math.max(...speeds),
      avg_speed: Math.round((speeds.reduce((s, v) => s + v, 0) / speeds.length) * 10) / 10,
    },
    stops: [],
    startAddress: null,
    endAddress: null,
  };
}

/** Trajets d'une liste de points GPS triés par heure. */
export function detectTrips(deviceId: string, points: GpsPoint[]): DetectedTrip[] {
  if (points.length < 2) return [];
  return movingPieces(points).filter(isRealTrip).map((piece) => buildTrip(deviceId, piece));
}

/**
 * Trajets d'un jour passé (table `trips`) recalculés avec les mêmes règles :
 * un trajet du serveur qui contient un stationnement est coupé en deux.
 * Un trajet inchangé garde son id et ses adresses ; sinon les adresses
 * connues sont gardées quand le départ ou l'arrivée ne change pas.
 */
export function refineTrips(deviceId: string, trips: DetectedTrip[]): DetectedTrip[] {
  const all: GpsPoint[] = [];
  for (const t of trips) {
    for (const p of t.polyline ?? []) {
      if (p && typeof p.lat === "number" && typeof p.lng === "number" && p.timestamp) {
        all.push({ lat: p.lat, lng: p.lng, speed: p.speed ?? null, timestamp: p.timestamp });
      }
    }
  }
  all.sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
  const unique: GpsPoint[] = [];
  for (const p of all) {
    if (unique.length === 0 || ms(p.timestamp) > ms(unique[unique.length - 1].timestamp)) unique.push(p);
  }
  return detectTrips(deviceId, unique).map((t) => {
    const sameStart = trips.find((s) => ms(s.startedAt) === ms(t.startedAt));
    const sameEnd = trips.find((s) => s.endedAt && t.endedAt && ms(s.endedAt) === ms(t.endedAt));
    if (sameStart && sameStart === sameEnd) {
      return { ...t, id: sameStart.id, startAddress: sameStart.startAddress, endAddress: sameStart.endAddress };
    }
    return { ...t, startAddress: sameStart?.startAddress ?? null, endAddress: sameEnd?.endAddress ?? null };
  });
}
