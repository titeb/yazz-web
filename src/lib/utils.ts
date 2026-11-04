import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formate une distance en km de façon robuste et cohérente partout dans l'app.
 *
 * Cas gérés :
 *  - null / undefined / NaN / -Infinity / +Infinity → "0 km"
 *  - distance négative (donnée corrompue) → "0 km"
 *  - distance < 5 m (0.005 km) → "0 km" (bruit GPS, évite "0.00 km")
 *  - sinon → 2 décimales arrondies (ex: 0.37 km, 18.42 km, 124.56 km)
 *
 * 2 décimales = précision 10 m, suffisant pour l'affichage utilisateur
 * tout en restant lisible. La même fonction est utilisée partout
 * (stats card, timeline, détail trajet) pour garantir la cohérence.
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km < 0.005) return "0 km"
  return `${km.toFixed(2)} km`
}
