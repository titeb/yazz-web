import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy serveur pour récupérer le code OTP test depuis le backend YAZZ.
 *
 * Pourquoi un proxy ?
 * Le backend yazz_backend n'envoie pas l'en-tête Access-Control-Allow-Origin
 * sur l'endpoint /api/auth/test-code, ce qui bloque les appels fetch() côté
 * navigateur (CORS error). Ce proxy contourne le problème en faisant
 * l'appel côté serveur Next.js.
 *
 * ⚠️ TEMPORAIRE — à retirer en production une fois le backend corrigé
 * (ajouter Access-Control-Allow-Origin sur /api/auth/test-code).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const key = searchParams.get("key");

  if (!phone || !key) {
    return NextResponse.json(
      { error: "Missing phone or key parameter" },
      { status: 400 }
    );
  }

  const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
  const url = `${backendUrl}/api/auth/test-code?phone=${encodeURIComponent(phone)}&key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Backend unreachable", message: err.message },
      { status: 502 }
    );
  }
}
