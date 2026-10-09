import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ai/chat/stream — Proxy SSE vers le backend Yazz.
 *
 * Le backend (api.zipbox.online) expose POST /api/ai/chat/stream qui retourne
 * un flux Server-Sent Events avec :
 *   event: text    data: {"chunk":"..."}        — texte mot par mot
 *   event: audio   data: {"audioUrl":"data:...","index":0,"text":"..."}
 *   event: done    data: {"conversationId":"...","messageId":"...","state":"..."}
 *   event: error   data: {"error":"..."}
 *
 * Cette route Next.js relaie le FormData du navigateur vers le backend puis
 * pipe la réponse SSE en streaming vers le navigateur.
 *
 * IMPORTANT :
 *   - runtime = "nodejs" (pas edge) — nécessaire pour Forward FormData + stream
 *   - dynamic = "force-dynamic" — pas de cache statique
 *   - On ne peut PAS utiliser NextResponse.json() ici car on doit retourner
 *     un flux continu. On retourne un Response avec ReadableStream.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby: 60s max pour les fonctions streaming

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Non authentifié." },
      { status: 401 }
    );
  }
  const accessToken = authHeader.replace("Bearer ", "");

  try {
    const backendUrl =
      process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";

    // Récupérer le FormData du navigateur
    const formData = await request.formData();

    // Forward vers le backend — on garde Accept: text/event-stream
    // pour que le backend sache qu'on attend du SSE.
    const backendRes = await fetch(`${backendUrl}/api/ai/chat/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
      },
      body: formData,
    });

    // Si le backend retourne une erreur (non-200), on la forward comme JSON
    // pour que le navigateur puisse afficher le message d'erreur.
    if (!backendRes.ok) {
      const errText = await backendRes.text().catch(() => "");
      let errData: any = {};
      try {
        errData = JSON.parse(errText);
      } catch {
        // Pas du JSON — message par défaut
        errData = { error: `Erreur ${backendRes.status}` };
      }
      return NextResponse.json(
        { error: errData.error || `Erreur ${backendRes.status}` },
        { status: backendRes.status }
      );
    }

    // Le backend retourne un flux SSE — on le pipe vers le navigateur.
    // On ne peut PAS utiliser NextResponse.json() car on doit retourner un
    // flux continu. On construit un Response avec un ReadableStream qui
    // consomme le stream du backend.
    if (!backendRes.body) {
      return NextResponse.json(
        { error: "Backend a retourné un flux vide" },
        { status: 502 }
      );
    }

    const reader = backendRes.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (err) {
          // Le navigateur s'est déconnecté ou le backend a coupé — on ferme
          // proprement le flux.
          console.error("[ai/chat/stream proxy] stream error:", err);
        } finally {
          try {
            controller.close();
          } catch {
            // déjà fermé
          }
          try {
            reader.releaseLock();
          } catch {
            // déjà released
          }
        }
      },
      async cancel(reason) {
        // Le navigateur a annulé la requête (ex: barge-in / interruption)
        console.log("[ai/chat/stream proxy] client cancelled:", reason);
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      },
    });

    // Headers SSE identiques à ceux du backend — on les forward tous.
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
    responseHeaders.set("Cache-Control", "no-cache, no-transform");
    responseHeaders.set("Connection", "keep-alive");
    responseHeaders.set("X-Accel-Buffering", "no"); // Désactive le buffering nginx/Vercel

    return new Response(stream, { status: 200, headers: responseHeaders });
  } catch (err: any) {
    console.error("[ai/chat/stream proxy] error:", err);
    return NextResponse.json(
      { error: "Backend unreachable", message: err.message },
      { status: 502 }
    );
  }
}
