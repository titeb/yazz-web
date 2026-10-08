import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const formData = await request.formData();
    const res = await fetch(`${backendUrl}/api/ai/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("[ai/chat proxy] error:", err);
    return NextResponse.json({ error: "Backend unreachable", message: err.message }, { status: 502 });
  }
}
