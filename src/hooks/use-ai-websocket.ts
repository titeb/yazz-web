/**
 * useAiWebSocket — Hook React pour consommer le WebSocket AI Assistant.
 *
 * Cet hook est l'équivalent du `fetch("/api/ai/chat/stream")` + ReadableStream
 * qui consomme le SSE, mais en version bidirectionnelle via WebSocket.
 *
 * Avantages vs SSE :
 *   - Barge-in bidirectionnel natif (le serveur sait quand l'utilisateur parle)
 *   - 1 seule connexion persistante par session (pas de reconnexion à chaque tour)
 *   - Reconnexion automatique en cas de coupure réseau
 *
 * Fallback :
 *   - Si la connexion échoue après 3 tentatives, l'appelant peut basculer sur SSE
 *   - Le hook expose l'état de connexion pour que le modal sache quand fallback
 *
 * Feature flag :
 *   - Si NEXT_PUBLIC_AI_USE_WS != "true", le hook ne se connecte pas
 *   - Le modal doit utiliser le hook uniquement si le flag est activé
 *   - Sinon, le modal garde le code SSE existant
 */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClientSafe } from "@/lib/supabase/client";
import {
  type AiWsCallbacks,
  type WsConnectionState,
  type ServerMessage,
  type ClientMessage,
  buildWsUrl,
} from "@/lib/yazz/ai-ws-protocol";

// Constants
const RECONNECT_MAX_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 60_000; // 60s sans pong → close
const HEARTBEAT_INTERVAL_MS = 30_000;

interface UseAiWebSocketOptions extends AiWsCallbacks {
  /** Si true, active le hook. Si false, le hook reste idle (en attente). */
  enabled?: boolean;
}

interface UseAiWebSocketReturn {
  connectionState: WsConnectionState;
  isConnected: boolean;
  /** Envoie un texte à l'IA. Retourne false si pas connecté. */
  send: (text: string, conversationId?: string) => boolean;
  /** Demande un barge-in (interrompt l'IA). */
  bargeIn: () => void;
  /** Reconnecte manuellement (reset les tentatives). */
  reconnect: () => void;
}

export function useAiWebSocket(options: UseAiWebSocketOptions = {}): UseAiWebSocketReturn {
  const { enabled = true, ...callbacks } = options;

  const [connectionState, setConnectionState] = useState<WsConnectionState>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jwtRef = useRef<string | null>(null);
  // Refs pour éviter les reconnexions quand on ferme volontairement
  const enabledRef = useRef(enabled);
  const intentionalCloseRef = useRef(false);  // ← FIX: empêche la boucle de reconnexion

  // Callbacks dans une ref pour pouvoir les maj sans re-créer le hook
  const callbacksRef = useRef<AiWsCallbacks>(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const setState = useCallback((s: WsConnectionState) => {
    setConnectionState(s);
    callbacksRef.current.onConnectionStateChange?.(s);
  }, []);

  // ───────── Internal send (n'importe quel ClientMessage) ─────────

  const sendRaw = useCallback((msg: ClientMessage): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    try {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      console.error("[useAiWebSocket] Send failed:", err);
      return false;
    }
  }, []);

  // ───────── Connection logic ─────────

  const connect = useCallback(async () => {
    if (!enabledRef.current) return;

    // Récupère le JWT Supabase
    try {
      const supabase = createClientSafe();
      if (!supabase) {
        console.warn("[useAiWebSocket] Supabase client not available");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn("[useAiWebSocket] No active Supabase session");
        return;
      }
      jwtRef.current = session.access_token;
    } catch (err) {
      console.error("[useAiWebSocket] Failed to get JWT:", err);
      return;
    }

    // Ferme l'ancienne connexion si elle existe
    if (wsRef.current) {
      intentionalCloseRef.current = true;  // ← FIX: empêche le onclose de reconnecter
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    setState("connecting");
    const wsUrl = buildWsUrl(jwtRef.current!);

    console.log(`[useAiWebSocket] Connecting to ${wsUrl.replace(/token=[^&]+/, "token=***")}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[useAiWebSocket] ✅ Connected");
      reconnectAttemptsRef.current = 0; // reset backoff
      lastPongRef.current = Date.now();
      setState("connected");

      // Heartbeat — vérifie qu'on reçoit des pongs régulièrement
      heartbeatTimerRef.current = setInterval(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastPongRef.current > HEARTBEAT_TIMEOUT_MS) {
          console.warn("[useAiWebSocket] No pong received in 60s — terminating");
          intentionalCloseRef.current = true;
          try { wsRef.current.close(); } catch {}
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch (err) {
        console.error("[useAiWebSocket] Failed to parse message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[useAiWebSocket] Socket error:", err);
      setState("error");
    };

    ws.onclose = (ev) => {
      console.log(`[useAiWebSocket] Closed (code=${ev.code}, reason=${ev.reason || "n/a"})`);
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      wsRef.current = null;

      // ⚠ FIX 1: si la fermeture est intentionnelle (on a appelé close() nous-mêmes)
      if (intentionalCloseRef.current) {
        intentionalCloseRef.current = false;
        console.log("[useAiWebSocket] Intentional close — not reconnecting");
        return;
      }

      // ⚠ FIX 2: code 4002 = "Replaced by new connection" — le backend a fermé
      // cette connexion car une nouvelle est arrivée. NE PAS reconnecter → empêche la boucle.
      if (ev.code === 4002) {
        console.log("[useAiWebSocket] Connection replaced (4002) — not reconnecting");
        setState("disconnected");
        return;
      }

      // Reconnexion auto si le flag est encore activé
      if (enabledRef.current && reconnectAttemptsRef.current < RECONNECT_MAX_ATTEMPTS) {
        setState("reconnecting");
        const attempt = ++reconnectAttemptsRef.current;
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
          RECONNECT_MAX_DELAY_MS
        );
        console.log(`[useAiWebSocket] Reconnecting in ${delay}ms (attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS})`);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else if (enabledRef.current) {
        setState("error");
        callbacksRef.current.onError?.("Connexion perdue — bascule sur SSE");
      }
    };
  }, [setState]);

  // ───────── Message dispatcher ─────────

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "connected":
        // Handshake OK — le serveur confirme l'userId
        console.log("[useAiWebSocket] Server confirmed connection");
        break;

      case "text_chunk":
        callbacksRef.current.onTextChunk?.(msg.text);
        break;

      case "audio_chunk":
        callbacksRef.current.onAudioChunk?.(msg.audioUrl, msg.text, msg.index);
        break;

      case "done":
        callbacksRef.current.onDone?.({
          conversationId: msg.conversationId,
          messageId: msg.messageId,
          text: msg.text,
          state: msg.state,
          confirmationCard: msg.confirmationCard,
          meta: msg.meta,
          bargeIn: msg.bargeIn,
        });
        break;

      case "barge_in_ack":
        callbacksRef.current.onBargeInAck?.();
        break;

      case "ping":
        // Réponds pong pour garder la connexion vivante
        sendRaw({ type: "pong" });
        break;

      case "pong":
        lastPongRef.current = Date.now();
        break;

      case "error":
        callbacksRef.current.onError?.(msg.error);
        break;

      default:
        console.warn("[useAiWebSocket] Unknown message type:", (msg as any).type);
    }
  }, [sendRaw]);

  // ───────── Public methods ─────────

  const send = useCallback((text: string, conversationId?: string): boolean => {
    return sendRaw({ type: "start", text, conversationId });
  }, [sendRaw]);

  const bargeIn = useCallback(() => {
    sendRaw({ type: "barge_in" });
  }, [sendRaw]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connect();
  }, [connect]);

  // ───────── Lifecycle ─────────

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (wsRef.current) {
        intentionalCloseRef.current = true;
        try { wsRef.current.close(1000, "Component unmount"); } catch {}
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    send,
    bargeIn,
    reconnect,
  };
}
