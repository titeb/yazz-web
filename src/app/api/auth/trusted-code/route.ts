import { NextRequest, NextResponse } from "next/server";

/**
 * Connexion de test sans SMS (relais vers le serveur YAZZ).
 * Le serveur ne remet un code qu'avec la bonne clé (il n'en garde que
 * l'empreinte) : sans elle, rien n'est remis et le SMS part normalement.
 *   POST { phone, deviceToken } → { ok, code } | 404 | 403 | 429
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const phone = String(body?.phone || "").replace(/\D/g, "");
  const deviceToken = String(body?.deviceToken || "");
  if (!/^\d{8,15}$/.test(phone) || !/^[0-9a-f]{64}$/.test(deviceToken)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const res = await fetch(`${backendUrl}/api/auth/trusted-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, deviceToken }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 502 });
  }
}
