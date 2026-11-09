/**
 * Lieux personnels de l'utilisateur (Maison, École, Garage…) — mêmes règles
 * que l'assistant IA (yazz_backend src/ai-assistant/tools/places.js) :
 * - table user_locations : nom en minuscules, unique par utilisateur ;
 * - type home / work / school / church / garage / custom ;
 * - deux noms qui se comparent pareil (« Maison », « la maison ») sont le
 *   même lieu.
 * Un lieu ajouté ici est connu de l'assistant tout de suite, et inversement.
 */

export type PlaceType = "home" | "work" | "school" | "church" | "garage" | "custom";

export type UserPlace = {
  id: string;
  name: string; // en minuscules (comme l'assistant)
  type: PlaceType;
  lat: number;
  lng: number;
  address: string | null;
  radiusM: number;
  createdVia: string;
  createdAt: string;
};

export const PLACE_TYPES: PlaceType[] = ["home", "work", "school", "church", "garage", "custom"];

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  home: "Domicile",
  work: "Travail",
  school: "École",
  church: "Église",
  garage: "Garage",
  custom: "Lieu",
};

export const PLACE_TYPE_EMOJI: Record<PlaceType, string> = {
  home: "🏠",
  work: "💼",
  school: "🎒",
  church: "⛪",
  garage: "🔧",
  custom: "📍",
};

/** Noms proposés en un clic. */
export const PLACE_SUGGESTIONS: { name: string; type: PlaceType }[] = [
  { name: "Maison", type: "home" },
  { name: "Bureau", type: "work" },
  { name: "École", type: "school" },
  { name: "Église", type: "church" },
  { name: "Garage", type: "garage" },
];

const TYPE_WORDS: Record<Exclude<PlaceType, "custom">, string[]> = {
  home: ["maison", "domicile", "chez moi", "chez nous", "residence", "logement", "la ou j habite"],
  work: ["bureau", "travail", "boulot", "lieu de travail", "job", "taf"],
  school: ["ecole", "ecole des enfants"],
  church: ["eglise", "paroisse"],
  garage: ["garage", "mecanicien", "chez le mecanicien", "chez mon mecanicien"],
};

const LEADING =
  /^(?:a la|a l|a|au|aux|de la|de l|du|des|de|la|le|l|les|ma|mon|mes|notre|nos|ta|ton|tes|sa|son|ses|vers|jusqu a|jusqu au)\s+/;

/** Forme de comparaison : minuscules, sans accents, ponctuation ni article. */
export function normalizePlace(s: string): string {
  let t = String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  t = t.replace(/[,\s]+(?:a\s+|à\s+)?(?:kinshasa|rdc|r\.d\.c\.?|congo)\s*$/, "");
  t = t.replace(/['’`]/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  let prev;
  do {
    prev = t;
    t = t.replace(LEADING, "");
  } while (t !== prev && t);
  return t;
}

/** « maison » → home, sinon custom. */
export function typeOfName(name: string): PlaceType {
  const n = normalizePlace(name);
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.includes(n)) return type as PlaceType;
  }
  return "custom";
}

/** Nom à enregistrer : sans article en tête ni « , Kinshasa », 50 caractères. */
export function cleanPlaceName(name: string): string {
  let t = String(name || "")
    .trim()
    .replace(/^["«»“”\s]+|["«»“”\s]+$/g, "");
  t = t.replace(/[,\s]+(?:à\s+|a\s+)?(?:kinshasa|rdc|congo)\s*$/i, "");
  const lead = /^(?:(?:à la|a la|au|la|le|les|ma|mon|mes|notre|nos)\s+|(?:à l|a l|l)['’]\s*)/i;
  let prev;
  do {
    prev = t;
    t = t.replace(lead, "").trim();
  } while (t !== prev && t);
  return t.slice(0, 50);
}

/** « maison » → « Maison ». */
export function placeLabel(name: string): string {
  const s = String(name || "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Adresse courte : 4 premiers éléments utiles, sans pays ni code postal. */
export function shortAddress(s: string | null | undefined): string | null {
  if (!s) return null;
  const parts = String(s)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !/^\d+$/.test(x) && !/r[ée]publique|congo|^rdc$|^r\.d\.c/i.test(x));
  return parts.slice(0, 4).join(", ").slice(0, 160) || null;
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Un lieu de même nom (comparaison souple) existe déjà ? */
export function findSameName(places: UserPlace[], name: string, exceptId?: string): UserPlace | null {
  const n = normalizePlace(name);
  return places.find((p) => p.id !== exceptId && normalizePlace(p.name) === n) ?? null;
}

export function rowToPlace(r: any): UserPlace | null {
  const lat = Number(r?.lat);
  const lng = Number(r?.lng);
  if (!r?.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: r.id,
    name: String(r.name || ""),
    type: PLACE_TYPES.includes(r.type) ? r.type : "custom",
    lat,
    lng,
    address: r.address ?? null,
    radiusM: Number(r.radius_m) || 150,
    createdVia: r.created_via || "manual",
    createdAt: r.created_at || "",
  };
}

export type GeocodeResult = { label: string; lat: number; lng: number };

/** Recherche d'adresse (même ordre que l'assistant : OpenStreetMap puis Mapbox). */
export async function searchAddress(
  q: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lng", String(near.lng));
  }
  const res = await fetch(`/api/geocode/search?${params}`, { signal });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.results) ? data.results : [];
}

/** Adresse d'un point (proxy OpenStreetMap existant). */
export async function addressAt(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const full = data?.fullAddress;
    return full && full !== "Adresse inconnue" ? shortAddress(full) : null;
  } catch {
    return null;
  }
}
