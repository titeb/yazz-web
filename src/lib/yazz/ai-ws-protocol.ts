/**
 * AI WebSocket Protocol — types TypeScript du protocol WS bidirectionnel.
 *
 * Ce fichier est la source de vérité pour le format des messages échangés
 * entre le frontend (Next.js) et le backend (Express + wsServer.js).
 *
 * Mirror côté backend : src/ai-assistant/wsServer.js (comment en haut du fichier).
 *
 * Sécurité :
 *   - Le client ne reçoit JAMAIS le JWT Supabase directement dans les messages.
 *   - Le JWT est passé en query string au handshake WS (?token=...)
 *   - Le backend valide le token via Supabase avant le handshake.
 */

// ═════════════════════════════════════════════════════════════════
// Messages CLIENT → SERVEUR
// ═════════════════════════════════════════════════════════════════

export type ClientMessage =
  | { type: "start"; text: string; conversationId?: string; clientMessageId?: string }
  | { type: "barge_in" }
  | { type: "ping" }
  | { type: "pong" };

// ═════════════════════════════════════════════════════════════════
// Messages SERVEUR → CLIENT
// ═════════════════════════════════════════════════════════════════

export type ServerMessage =
  // Handshake — envoyé dès que la connexion est établie (après auth Supabase)
  | { type: "connected"; userId: string; timestamp: string }

  // Token LLM reçu (streaming)
  | { type: "text_chunk"; text: string }

  // Chunk audio TTS (data URL base64 — format identique au SSE)
  | { type: "audio_chunk"; audioUrl: string; text: string; index: number }

  // Outil appelé par le LLM (pour info UI)
  | { type: "tool_call"; name: string; args: any }
  | { type: "tool_result"; name: string; result: any }

  // Fin d'un tour — soit réponse complète, soit confirmation card à valider
  | {
      type: "done";
      conversationId: string;
      messageId: string | null;
      text: string;
      state: "speaking" | "awaiting_confirmation" | "interrupted";
      confirmationCard?: any;
      meta?: any;
      bargeIn?: boolean;
    }

  // Ack d'un barge-in demandé par le client — le serveur a bien interrompu le TTS
  | { type: "barge_in_ack"; timestamp: number }

  // Heartbeat
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number }

  // Erreur — la connexion reste ouverte, le client peut réessayer
  | { type: "error"; error: string };

// ═════════════════════════════════════════════════════════════════
// État de la connexion WS
// ═════════════════════════════════════════════════════════════════

export type WsConnectionState =
  | "idle"        // Pas encore connecté
  | "connecting"  // Handshake en cours
  | "connected"   // Connecté + auth OK, prêt à recevoir/envoyer
  | "error"       // Erreur (peut retenter)
  | "reconnecting"; // Reconnexion automatique en cours

// ═════════════════════════════════════════════════════════════════
// Callbacks exposés par le hook useAiWebSocket
// ═════════════════════════════════════════════════════════════════

export interface AiWsCallbacks {
  onTextChunk?: (chunk: string) => void;
  onAudioChunk?: (audioUrl: string, text: string, index: number) => void;
  onDone?: (result: {
    conversationId: string;
    messageId: string | null;
    text: string;
    state: "speaking" | "awaiting_confirmation" | "interrupted";
    confirmationCard?: any;
    meta?: any;
    bargeIn?: boolean;
  }) => void;
  onError?: (error: string) => void;
  onBargeInAck?: () => void;
  onConnectionStateChange?: (state: WsConnectionState) => void;
}

// ═════════════════════════════════════════════════════════════════
// URL du WebSocket AI Assistant
// ═════════════════════════════════════════════════════════════════

/**
 * Construit l'URL WebSocket pour l'AI assistant.
 * En production : wss://api.zipbox.online/api/ai/chat/ws?token=<JWT>
 * En dev : ws://localhost:3000/api/ai/chat/ws?token=<JWT>
 *
 * Le JWT est obtenu depuis la session Supabase côté client.
 * Le backend valide le token AVANT le handshake (dans verifyClient).
 */
export function buildWsUrl(jwt: string): string {
  // NEXT_PUBLIC_YAZZ_BACKEND_URL est déjà utilisé pour les routes SSE,
  // on le réutilise pour construire l'URL WS.
  const httpUrl =
    process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL || "https://api.zipbox.online";

  // Convertit http(s):// → ws(s)://
  const wsUrl = httpUrl.replace(/^http/, "ws");
  // Append le path + token
  const url = new URL(`${wsUrl}/api/ai/chat/ws`);
  url.searchParams.set("token", jwt);
  return url.toString();
}
