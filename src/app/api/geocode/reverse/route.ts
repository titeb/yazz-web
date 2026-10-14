import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode/reverse?lat=...&lng=...
 *
 * Proxy vers OpenStreetMap Nominatim (reverse geocoding).
 * Nominatim ne supporte pas CORS → on doit proxy côté serveur.
 * Même logique que le backend AI assistant (_reverseGeocode dans context.js).
 *
 * Avantages vs Mapbox :
 * - Gratuit, pas de token
 * - Meilleur pour Kinshasa (contributeurs OSM locaux ont mapé les rues)
 * - Pas de quota
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat et lng requis" }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr&zoom=18`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Yazz-GPS-Tracker/1.0",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Nominatim HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const addr = data?.address;

    if (!addr) {
      return NextResponse.json({
        fullAddress: data?.display_name || "Adresse inconnue",
        street: null,
        commune: null,
        quarter: null,
        city: null,
        region: null,
      });
    }

    // Parser comme le backend AI assistant (context.js _reverseGeocode)
    // road/pedestrian/path → street
    const street =
      addr.road || addr.pedestrian || addr.path || null;
    // neighbourhood/hamlet/suburb → quarter
    const quarter =
      addr.neighbourhood || addr.hamlet || addr.suburb || null;
    // municipality/city_district/town → commune (à Kinshasa = commune ex: Lemba, Gombe)
    const commune =
      addr.municipality || addr.city_district || addr.town || null;
    // state/city → city (à Kinshasa = "Kinshasa")
    const city = addr.state || addr.city || null;
    // county/state → region (province)
    const region = addr.county || addr.region || null;

    // Construire fullAddress (nettoyé : pas de pays)
    const parts: string[] = [];
    if (street) parts.push(street);
    if (quarter && quarter !== street) parts.push(quarter);
    if (commune && !parts.includes(commune)) parts.push(commune);
    if (city && city !== commune && !parts.includes(city)) parts.push(city);

    const fullAddress =
      parts.length > 0 ? parts.join(", ") : data?.display_name || "Adresse inconnue";

    return NextResponse.json({
      fullAddress,
      street,
      commune,
      quarter,
      city,
      region,
    });
  } catch (err: any) {
    console.error("[geocode/reverse] error:", err);
    return NextResponse.json(
      { error: err.message || "Erreur géocodage" },
      { status: 502 }
    );
  }
}
