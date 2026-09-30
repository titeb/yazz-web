import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Proxy : POST /api/payments/initiate
 * Body : { phone: "+243XXXXXXXXX", amount: number, provider?: "shwary" | "pawapay" }
 * Response : { paymentId, provider, providerTransactionId, status, checkoutUrl? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body?.phone || !body?.amount) {
    return NextResponse.json(
      { error: "phone et amount sont requis." },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

    if (sessionErr || !session?.access_token) {
      return NextResponse.json(
        { error: "Non authentifié. Session Supabase manquante." },
        { status: 401 }
      );
    }

    const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";
    const url = `${backendUrl}/api/payments/initiate`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
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
