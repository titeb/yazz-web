import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy : GET /api/payments/:paymentId/status
 * Headers : Authorization: Bearer <jwt>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const url = `${backendUrl}/api/payments/${paymentId}/status`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: "Backend unreachable", message: err.message }, { status: 502 });
  }
}
