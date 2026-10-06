import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy : POST /api/payments/initiate
 * Body : { phone: "+243XXXXXXXXX", amount: number, provider?: "shwary" | "pawapay" }
 * Headers : Authorization: Bearer <jwt> (envoyé par le client)
 * Response : { paymentId, provider, providerTransactionId, status, checkoutUrl? }
 *
 * Le JWT est lu directement depuis le header Authorization au lieu
 * d'utiliser les cookies Supabase (qui ne fonctionnent pas correctement
 * sur Vercel avec Deployment Protection activé).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body?.phone || !body?.amount) {
    return NextResponse.json(
      { error: "phone et amount sont requis." },
      { status: 400 }
    );
  }

  // Lire le JWT depuis le header Authorization (envoyé par le client)
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Non authentifié. Token manquant." },
      { status: 401 }
    );
  }

  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const url = `${backendUrl}/api/payments/initiate`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        phone: body.phone,
        amount: Number(body.amount),
        provider: body.provider,
      }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("[payments/initiate proxy] erreur:", err);
    return NextResponse.json(
      { error: "Backend unreachable", message: err.message },
      { status: 502 }
    );
  }
}
