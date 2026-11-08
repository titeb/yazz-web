"use client";

/**
 * useYazzLive — conversation vocale en direct avec l'assistant (Gemini Live
 * via LiveKit). Voir yazz_backend/src/voice-live.
 *
 *   start()  → POST /api/ai/live/session (jeton + salon) → connexion LiveKit
 *              → micro activé → l'agent rejoint et salue.
 *   stop()   → quitte le salon (l'agent s'arrête et enregistre la durée).
 *
 * Reçu de l'agent :
 *   - sa voix (piste audio, jouée dans un <audio> caché) ;
 *   - son état (attribut « lk.agent.state » : listening / thinking / speaking) ;
 *   - les transcriptions en direct (flux texte « lk.transcription ») ;
 *   - les cartes de confirmation et la durée max (données, sujet « yazz »).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Participant,
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type TextStreamReader,
} from "livekit-client";
import { createClientSafe } from "@/lib/supabase/client";

export type LiveStatus = "idle" | "connecting" | "live" | "ended" | "error";
export type AgentState = "initializing" | "listening" | "thinking" | "speaking";

export interface LiveLine {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
}

export interface LiveCard {
  card_id: string;
  title: string;
  summary?: string;
  details?: Record<string, unknown>;
  actions?: { label: string; action: string }[];
  resolved?: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function authHeader(): Promise<string | null> {
  const supabase = createClientSafe();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : null;
}

export function useYazzLive() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [agentState, setAgentState] = useState<AgentState>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [muted, setMuted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const deadlineRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current = [];
    deadlineRef.current = null;
    setSecondsLeft(null);
  }, []);

  const stop = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect().catch(() => {});
    cleanup();
    setStatus((s) => (s === "error" ? s : "ended"));
  }, [cleanup]);

  // Compte à rebours (durée max de la session)
  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => {
      if (deadlineRef.current) setSecondsLeft(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  // Quitter la page = quitter le salon
  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  const upsertLine = useCallback((line: LiveLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === line.id);
      if (i === -1) return [...prev.slice(-30), line];
      const copy = [...prev];
      copy[i] = line;
      return copy;
    });
  }, []);

  const start = useCallback(async () => {
    if (roomRef.current) return;
    setError(null);
    setLines([]);
    setCards([]);
    setStatus("connecting");
    setAgentState("initializing");
    try {
      const auth = await authHeader();
      if (!auth) throw new Error("Session expirée : reconnecte-toi.");
      const res = await fetch("/api/ai/live/session", { method: "POST", headers: { Authorization: auth } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Connexion impossible (${res.status}).`);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;

      // Voix de l'agent
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.style.display = "none";
        document.body.appendChild(el);
        audioElsRef.current.push(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      });

      // État de l'agent (écoute / réflexion / parole)
      const readState = (p: Participant) => {
        const s = p.attributes?.["lk.agent.state"] as AgentState | undefined;
        if (s) setAgentState(s);
      };
      room.on(RoomEvent.ParticipantAttributesChanged, (_changed, p) => readState(p));
      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => readState(p));

      // Transcriptions en direct (utilisateur et agent)
      room.registerTextStreamHandler("lk.transcription", async (reader: TextStreamReader, info) => {
        const id = reader.info.id;
        const role: LiveLine["role"] = info.identity === room.localParticipant.identity ? "user" : "assistant";
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          upsertLine({ id, role, text, final: false });
        }
        if (text.trim()) upsertLine({ id, role, text, final: true });
      });

      // Cartes de confirmation, durée max
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, _p, _k, topic) => {
        if (topic !== "yazz") return;
        try {
          const msg = JSON.parse(decoder.decode(payload));
          if (msg.type === "card" && msg.card?.card_id) {
            setCards((prev) => [...prev.filter((c) => c.card_id !== msg.card.card_id), msg.card]);
          } else if (msg.type === "session" && Number(msg.limitSeconds) > 0) {
            deadlineRef.current = Date.now() + Number(msg.limitSeconds) * 1000;
          }
        } catch { /* message ignoré */ }
      });

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        cleanup();
        setStatus((s) => (s === "error" ? s : "ended"));
      });

      await room.connect(data.url, data.token);
      deadlineRef.current = Date.now() + Number(data.limitSeconds || 600) * 1000;
      setSecondsLeft(Number(data.limitSeconds || 600));
      // Micro (après le clic : autorisé par le navigateur, son débloqué)
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio().catch(() => {});
      setMuted(false);
      setStatus("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      setStatus("error");
      await roomRef.current?.disconnect().catch(() => {});
      roomRef.current = null;
      cleanup();
    }
  }, [cleanup, upsertLine]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  /** Réponse à une carte : confirmation via l'API existante, puis l'agent l'annonce. */
  const respondToCard = useCallback(async (card: LiveCard, kind: "confirm" | "cancel") => {
    if (confirming) return;
    const tell = (message: string) => {
      const room = roomRef.current;
      if (!room) return;
      void room.localParticipant.publishData(
        encoder.encode(JSON.stringify({ type: "card_result", message })),
        { reliable: true, topic: "yazz" },
      );
    };
    const resolve = () => setCards((prev) => prev.map((c) => (c.card_id === card.card_id ? { ...c, resolved: true } : c)));
    if (kind === "cancel") {
      resolve();
      tell(`Action annulée : ${card.title}`);
      return;
    }
    setConfirming(card.card_id);
    try {
      const auth = await authHeader();
      const res = await fetch("/api/ai/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
        body: JSON.stringify({ card_id: card.card_id, details: card.details }),
      });
      const data = await res.json().catch(() => ({}));
      const message: string = data?.message || data?.error || "";
      tell(data?.confirmed ? message || "C'est fait." : `Échec : ${message || `erreur ${res.status}`}`);
      resolve();
    } catch {
      tell("Échec : problème de connexion.");
    } finally {
      setConfirming(null);
    }
  }, [confirming]);

  return { status, agentState, error, lines, cards, muted, secondsLeft, confirming, start, stop, toggleMute, respondToCard };
}
