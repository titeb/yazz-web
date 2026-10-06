import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy : POST /api/devices/:deviceId/engine-cut
 * Body : { action: "cut" | "restore" }
 * Headers : Authorization: Bearer <jwt>
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const body = await request.json().catch(() => ({}));

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const url = `${backendUrl}/api/devices/${deviceId}/engine-cut`;

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
    return NextResponse.json({ error: "Backend unreachable", message: err.message }, { status: 502 });
  }
}
