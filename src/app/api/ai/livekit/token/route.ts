import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ai/livekit/token — Proxy vers le backend Yazz pour génération de token LiveKit.
 *
 * Le backend (api.zipbox.online) expose POST /api/ai/livekit/token qui génère un JWT
 * LiveKit pour l'utilisateur courant (à partir de son JWT Supabase).
 *
 * Cette route Next.js relaie la requête du navigateur vers le backend, en transmettant
 * le JWT Supabase. Le navigateur n'a pas besoin de connaître l'URL du backend —
 * l'appel est same-origin (https://yazz-web.vercel.app/api/ai/livekit/token).
 *
 * Sécurité :
 *   - Le JWT Supabase est transmis au backend (qui le valide via Supabase)
 *   - Le backend génère un JWT LiveKit avec l'identity = userId Supabase
 *   - Le JWT LiveKit est retourné au navigateur (court TTL : 1h max)
 *   - Le navigateur ne stocke pas le JWT Supabase directement — il utilise le sien
 *
 * Returns: { ok, token, url, room, identity, expires_at, ttl_seconds }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30s suffisent pour générer un JWT

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { ok: false, error: "Non authentifié. Envoie ton JWT Supabase en Authorization: Bearer <token>." },
      { status: 401 }
    );
  }

  const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";

  try {
    // Lit le body de la requête (peut contenir room + ttl_seconds)
    const body = await request.json().catch(() => ({}));

    // Appel au backend — server-to-server, pas de CORS
    const res = await fetch(`${backendUrl}/api/ai/livekit/token`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[ai/livekit/token] Backend HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return NextResponse.json(
        { ok: false, error: `Backend HTTP ${res.status}`, detail: errText.slice(0, 500) },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error(`[ai/livekit/token] Proxy error: ${err.message}`);
    return NextResponse.json(
      { ok: false, error: "Erreur interne du proxy", detail: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/livekit/token — healthcheck rapide.
 * Utilisé par le frontend pour vérifier que le proxy existe.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/ai/livekit/token",
    description: "Proxy vers backend LiveKit token generation",
  });
}
