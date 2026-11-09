import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode/search?q=...&lat=...&lng=...
 *
 * Recherche d'une adresse ou d'un lieu public en RDC (page « Mes lieux »).
 * Même ordre que l'assistant IA (yazz_backend _geocodePlace) :
 * 1. OpenStreetMap Nominatim (meilleur à Kinshasa, rues cartographiées par
 *    les contributeurs locaux) — proxy serveur car Nominatim n'accepte pas
 *    les appels directs du navigateur (CORS) ;
 * 2. Mapbox en complément si OpenStreetMap ne trouve rien.
 * lat / lng (facultatifs) : position d'un véhicule, pour favoriser les
 * résultats proches.
 */

type Result = { label: string; lat: number; lng: number };

function clean(label: string): string {
  return label
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !/^\d+$/.test(x) && !/r[ée]publique|congo|^rdc$|^r\.d\.c/i.test(x))
    .slice(0, 4)
    .join(", ");
}

async function nominatim(q: string, near: { lat: number; lng: number } | null): Promise<Result[]> {
  const params = new URLSearchParams({
    q,
    format: "json",
    limit: "5",
    countrycodes: "cd",
    "accept-language": "fr",
  });
  if (near) {
    // Zone d'environ 60 km autour du véhicule, sans exclure le reste du pays
    const d = 0.3;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Yazz-GPS-Tracker/1.0" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((r: any) => ({ label: clean(r.display_name || ""), lat: Number(r.lat), lng: Number(r.lon) }))
      .filter((r: Result) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function mapbox(q: string, near: { lat: number; lng: number } | null): Promise<Result[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${token}&language=fr&limit=5&country=cd` +
    (near ? `&proximity=${near.lng},${near.lat}` : "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data?.features) ? data.features : [])
      .map((f: any) => ({
        label: clean(f.place_name || ""),
        lat: Number(f.center?.[1]),
        lng: Number(f.center?.[0]),
      }))
      .filter((r: Result) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const near = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;

  let results = await nominatim(q, near);
  if (results.length === 0) results = await mapbox(q, near);

  // Doublons (même libellé) retirés
  const seen = new Set<string>();
  results = results.filter((r) => (seen.has(r.label) ? false : (seen.add(r.label), true)));
  return NextResponse.json({ results });
}
