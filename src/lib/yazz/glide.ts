/**
 * Glissement du marqueur d'un véhicule vers sa nouvelle position — mêmes
 * règles que l'application mobile (yazz lib/ui/common/map/marker_glide.dart).
 *
 * Le marqueur glisse en douceur (et sa flèche tourne doucement), puis
 * s'arrête EXACTEMENT sur la vraie position : la précision ne change pas.
 * - Durée : 80 % de l'écart entre les deux points GPS, entre 0,5 et 3 s.
 * - Pas de glissement pour un écart < 0,5 m ou > 1,5 km (placement direct).
 */

export const GLIDE_MIN_M = 0.5;
export const GLIDE_MAX_M = 1500;
export const GLIDE_MIN_MS = 500;
export const GLIDE_MAX_MS = 3000;
export const GLIDE_DEFAULT_MS = 1200;

export type LngLat = [number, number];

export function distanceM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function shouldGlide(meters: number): boolean {
  return meters > GLIDE_MIN_M && meters < GLIDE_MAX_M;
}

/** Durée du glissement selon l'écart entre les deux points GPS (heures ISO). */
export function glideDurationMs(previousFix: string | null | undefined, newFix: string | null | undefined): number {
  const a = previousFix ? new Date(previousFix).getTime() : NaN;
  const b = newFix ? new Date(newFix).getTime() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return GLIDE_DEFAULT_MS;
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, Math.round((b - a) * 0.8)));
}

export function lerpLngLat(from: LngLat, to: LngLat, t: number): LngLat {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

/** Rotation par le plus court chemin (350° → 10° tourne de 20°). */
export function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (((from + delta * t) % 360) + 360) % 360;
}

/** Départ et arrivée en douceur. */
export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
