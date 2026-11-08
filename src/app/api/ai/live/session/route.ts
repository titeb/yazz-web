import { NextRequest, NextResponse } from "next/server";

/** Ouvre une session vocale live (relais vers le backend, même modèle que /api/ai/confirm). */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }
  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const res = await fetch(`${backendUrl}/api/ai/live/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Serveur injoignable." }, { status: 502 });
  }
}
