import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Proxy serveur pour appeler /api/devices/:deviceId/engine-cut sur le backend YAZZ.
 *
 * Pourquoi un proxy ?
 * Le backend YAZZ n'envoie pas les headers CORS sur tous les endpoints,
 * ce qui bloque les appels fetch() côté navigateur. Ce proxy :
 * 1. Récupère le JWT Supabase via le client server-side (lit les cookies)
 * 2. Forward l'appel au backend avec Authorization: Bearer <jwt>
 * 3. Renvoie la réponse au navigateur
 *
 * Backend endpoint : POST /api/devices/:deviceId/engine-cut
 * Auth : JWT Supabase
 * Body : { action: "cut" | "restore" }
 * Conditions : owner-only, protocol_type === "istartek", speed < 20 km/h
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const body = await request.json();
  const action = body?.action;

  if (!action || !["cut", "restore"].includes(action)) {
    return NextResponse.json(
      { error: "Action invalide. Doit être 'cut' ou 'restore'." },
      { status: 400 }
    );
  }

  // Récupère la session Supabase via le client server-side
  // (qui lit automatiquement les cookies signés)
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();

    if (sessionErr || !session?.access_token) {
      return NextResponse.json(
        { error: "Non authentifié. Session Supabase manquante ou expirée." },
        { status: 401 }
      );
    }

    const jwt = session.access_token;
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const url = `${backendUrl}/api/devices/${encodeURIComponent(deviceId)}/engine-cut`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ action }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("[engine-cut proxy] erreur:", err);
    return NextResponse.json(
      { error: "Backend unreachable", message: err.message },
      { status: 502 }
    );
  }
}
