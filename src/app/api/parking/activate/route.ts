import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy : POST /api/parking/activate
 * Body : { deviceId, sensitivity?, parkingLat?, parkingLng? }
 * Headers : Authorization: Bearer <jwt>
 *
 * FIX 2026-10-30 : ce proxy remplace l'ancien code yazz-web qui faisait
 * directement `update({ parking_mode: true })` sur user_devices SANS appeler
 * le backend. Conséquence : parking_sessions n'était jamais créée → le
 * toggle "active" le mode parking côté UI mais l'alert engine ne déclenchait
 * aucune alerte (car il lit parking_sessions.is_active).
 *
 * Maintenant on appelle le backend /api/parking/activate qui fait atomiquement :
 *   1. user_devices.parking_mode = true
 *   2. INSERT parking_sessions (is_active=true)
 * Si l'étape 2 échoue → rollback de l'étape 1 (transactionnel).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const url = `${backendUrl}/api/parking/activate`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Backend unreachable", message: err.message },
      { status: 502 }
    );
  }
}
