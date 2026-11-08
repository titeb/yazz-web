import { NextRequest, NextResponse } from "next/server";

/** Mode live disponible ? minutes restantes aujourd'hui (relais vers le backend). */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }
  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const res = await fetch(`${backendUrl}/api/ai/live/status`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Serveur injoignable." }, { status: 502 });
  }
}
