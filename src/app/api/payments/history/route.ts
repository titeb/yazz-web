import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy : GET /api/payments/history
 * Headers : Authorization: Bearer <jwt> (envoyé par le client)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "20";
    const url = `${backendUrl}/api/payments/history?limit=${limit}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: "Backend unreachable", message: err.message }, { status: 502 });
  }
}
