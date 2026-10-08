import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");
  const body = await request.json();

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const res = await fetch(`${backendUrl}/api/ai/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
