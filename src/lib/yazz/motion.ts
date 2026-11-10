/**
 * En mouvement ou à l'arrêt ? — mêmes seuils que l'application mobile
 * (yazz lib/back/utils/constants/device_motion_status.dart, SpeedThresholds) :
 *
 * - ≤ 3 km/h      : à l'arrêt. Un boîtier GPS garé, surtout moteur allumé,
 *                   envoie souvent 1 ou 2 km/h (dérive normale du GPS) : ce
 *                   n'est pas un mouvement.
 * - 3 – 10 km/h   : ralentissement (embouteillage, manœuvre).
 * - > 10 km/h     : en mouvement.
 *
 * Avant, le web considérait « en mouvement » dès 0,1 km/h : une simple
 * dérive faisait passer le véhicule « En mouvement », puis la position
 * suivante le remettait « À l'arrêt depuis 56 min » (durée comptée depuis
 * le dernier passage au-dessus de 5 km/h).
 */
export const STOPPED_MAX_KMH = 3;
export const CRAWLING_MAX_KMH = 10;

/** Le véhicule roule réellement (> 3 km/h). */
export function isMoving(speed: number | null | undefined): boolean {
  return (Number(speed) || 0) > STOPPED_MAX_KMH;
}

/** Roule lentement (3 – 10 km/h) : « Ralentissement ». */
export function isCrawling(speed: number | null | undefined): boolean {
  const s = Number(speed) || 0;
  return s > STOPPED_MAX_KMH && s <= CRAWLING_MAX_KMH;
}
