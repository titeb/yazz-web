"use client";

/**
 * useYazzLive — conversation vocale en direct avec l'assistant (Gemini Live
 * via LiveKit). Voir yazz_backend/src/voice-live.
 *
 *   start()  → en parallèle : jeton (POST /api/ai/live/session) et micro
 *              → connexion LiveKit → micro publié → l'agent salue.
 *   stop()   → quitte le salon (l'agent s'arrête et enregistre la durée).
 *
 * Son de l'agent : joué par Web Audio avec un gain (+7 dB) et un limiteur.
 * Sur Android, le navigateur joue la voix comme un appel (volume d'appel,
 * souvent bas) : sans ce gain, on l'entend à peine.
 *
 * Niveaux sonores (agent, utilisateur) : lus à la demande par getLevels()
 * pour animer l'orbe, sans re-rendu React.
 *
 * Reçu de l'agent :
 *   - sa voix (piste audio) ;
 *   - son état (attribut « lk.agent.state » : listening / thinking / speaking) ;
 *   - les transcriptions en direct (flux texte « lk.transcription ») ;
 *   - les cartes de confirmation et la durée max (données, sujet « yazz »).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalAudioTrack,
  type LocalAudioTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  RemoteAudioTrack,
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

/** Gain appliqué à la voix de l'agent avant le limiteur (≈ +7 dB). */
const VOICE_GAIN = 2.3;

async function authHeader(): Promise<string | null> {
  const supabase = createClientSafe();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : null;
}

function readLevel(analyser: AnalyserNode | null, buf: Float32Array<ArrayBuffer> | null): number {
  if (!analyser || !buf) return 0;
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
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
  const micRef = useRef<LocalAudioTrack | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const agentAnalyserRef = useRef<AnalyserNode | null>(null);
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const deadlineRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  // Numéro de tentative : un raccroché (ou la fermeture de l'écran) pendant
  // la connexion annule la tentative en cours, sans laisser de micro ouvert.
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);

  const cleanup = useCallback(() => {
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current = [];
    micRef.current?.stop();
    micRef.current = null;
    agentAnalyserRef.current = null;
    userAnalyserRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    deadlineRef.current = null;
    setSecondsLeft(null);
  }, []);

  const stop = useCallback(async () => {
    attemptRef.current += 1;
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

  // Quitter l'écran = quitter le salon
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      // (pas d'annulation par numéro ici : en mode strict de React, l'écran
      // est démonté puis remonté aussitôt ; aliveRef suffit)
      aliveRef.current = false;
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  const upsertLine = useCallback((line: LiveLine) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === line.id);
      if (i === -1) return [...prev.slice(-30), line];
      const copy = [...prev];
      copy[i] = line;
      return copy;
    });
  }, []);

  /** Niveaux sonores actuels (0 → 1 environ) de l'agent et de l'utilisateur. */
  const getLevels = useCallback(() => ({
    agent: readLevel(agentAnalyserRef.current, bufRef.current),
    user: readLevel(userAnalyserRef.current, bufRef.current),
  }), []);

  const start = useCallback(async () => {
    if (roomRef.current || startingRef.current) return;
    startingRef.current = true;
    const attempt = ++attemptRef.current;
    const cancelled = () => attempt !== attemptRef.current || !aliveRef.current;
    setError(null);
    setLines([]);
    setCards([]);
    setMuted(false);
    setStatus("connecting");
    setAgentState("initializing");

    // Créé pendant le clic : le navigateur autorise alors le son
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    void ctx.resume().catch(() => {});
    bufRef.current = new Float32Array(new ArrayBuffer(1024 * 4));

    try {
      // Jeton et micro en parallèle (gagne le temps de l'autorisation du micro)
      const sessionPromise = (async () => {
        const auth = await authHeader();
        if (!auth) throw new Error("Session expirée : reconnecte-toi.");
        const res = await fetch("/api/ai/live/session", { method: "POST", headers: { Authorization: auth } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || `Connexion impossible (${res.status}).`);
        return data as { url: string; token: string; limitSeconds?: number };
      })();
      const micPromise = createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
        .catch(() => { throw new Error("Micro indisponible : autorise le micro pour parler avec Yazz."); });
      const [data, mic] = await Promise.all([sessionPromise, micPromise]);
      micRef.current = mic;
      if (cancelled()) { cleanup(); return; }

      // Niveau du micro (animation de l'orbe)
      const userAnalyser = ctx.createAnalyser();
      userAnalyser.fftSize = 1024;
      ctx.createMediaStreamSource(new MediaStream([mic.mediaStreamTrack])).connect(userAnalyser);
      userAnalyserRef.current = userAnalyser;

      const room = new Room({ webAudioMix: { audioContext: ctx } });
      roomRef.current = room;

      // Voix de l'agent : gain + limiteur + mesure du niveau
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio || !(track instanceof RemoteAudioTrack)) return;
        const gain = ctx.createGain();
        gain.gain.value = VOICE_GAIN;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        track.setWebAudioPlugins([gain, limiter, analyser]);
        agentAnalyserRef.current = analyser;
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
      if (cancelled()) {
        roomRef.current = null;
        await room.disconnect().catch(() => {});
        cleanup();
        return;
      }
      // Déjà dans le salon (l'agent y attend l'utilisateur) : lire son état
      room.remoteParticipants.forEach((p) => readState(p));
      await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone });
      await room.startAudio().catch(() => {});
      deadlineRef.current = Date.now() + Number(data.limitSeconds || 600) * 1000;
      setSecondsLeft(Number(data.limitSeconds || 600));
      setStatus("live");
    } catch (e) {
      if (cancelled()) { cleanup(); return; }
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      setStatus("error");
      await roomRef.current?.disconnect().catch(() => {});
      roomRef.current = null;
      cleanup();
    } finally {
      startingRef.current = false;
    }
  }, [cleanup, upsertLine]);

  const toggleMute = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) return;
    const next = !muted;
    if (next) await mic.mute();
    else await mic.unmute();
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

  return {
    status, agentState, error, lines, cards, muted, secondsLeft, confirming,
    start, stop, toggleMute, respondToCard, getLevels,
  };
}
