import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy : POST /api/parking/deactivate
 * Body : { deviceId }
 * Headers : Authorization: Bearer <jwt>
 *
 * FIX 2026-10-30 : ce proxy remplace l'ancien code yazz-web qui faisait
 * directement `update({ parking_mode: false })` sur user_devices SANS appeler
 * le backend. Conséquence : parking_sessions restait is_active=true →
 * l'alert engine continuait d'envoyer des notifications "Mouvement suspect"
 * même après que l'utilisateur ait désactivé le mode parking dans l'UI.
 * C'est ce qui a causé les notifications parking zombie du 29/10.
 *
 * Maintenant on appelle le backend /api/parking/deactivate qui fait atomiquement :
 *   1. parking_sessions.is_active = false, deactivated_at = now()
 *   2. user_devices.parking_mode = false, parking_lat = null, parking_lng = null, parking_activated_at = null
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
    const url = `${backendUrl}/api/parking/deactivate`;

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
