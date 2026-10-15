/**
 * useLiveKitRoom — Hook React pour connecter à une room LiveKit AI Assistant.
 *
 * Phase C3 — squelette + connexion + gestion d'erreurs.
 * L'audio bridging complet (Deepgram ↔ DeepSeek ↔ ElevenLabs) est TODO C2.7 audio.
 *
 * Workflow :
 *   1. Appel POST /api/ai/livekit/token → récupère un JWT + nom de room
 *   2. Connecte à la room LiveKit avec le JWT
 *   3. Publie le micro de l'utilisateur (audio track)
 *   4. Souscrit aux audio tracks publiés par l'agent IA (TTS)
 *   5. Quand l'utilisateur parle → LiveKit envoie l'audio à l'agent
 *   6. L'agent (backend) renvoie l'audio TTS via sa propre track publiée
 *
 * Feature flag :
 *   NEXT_PUBLIC_AI_USE_LIVEKIT=true pour activer (défaut: false)
 *
 * Sécurité :
 *   - Le JWT est généré côté serveur (POST /api/ai/livekit/token)
 *   - L'identity est TOUJOURS le userId Supabase (le backend force)
 *   - Pas de clé LiveKit exposée côté client
 */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Room, RoomEvent, Track, ConnectionState } from "livekit-client";
import { createClientSafe } from "@/lib/supabase/client";

export type LkConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

interface UseLiveKitRoomOptions {
  enabled?: boolean;
  onAudioFromAgent?: (audioData: AudioBuffer) => void;
  onAgentSpeaking?: (speaking: boolean) => void;
  onError?: (error: string) => void;
  onConnectionStateChange?: (state: LkConnectionState) => void;
}

interface UseLiveKitRoomReturn {
  connectionState: LkConnectionState;
  room: Room | null;
  error: string | null;
  /** Demande un token au backend + connecte à la room LiveKit */
  connect: () => Promise<boolean>;
  /** Déconnecte de la room */
  disconnect: () => Promise<void>;
  /** Active/désactive le micro (mute/unmute) */
  toggleMute: () => Promise<boolean>;
  isMuted: boolean;
}

export function useLiveKitRoom(options: UseLiveKitRoomOptions = {}): UseLiveKitRoomReturn {
  const { enabled = true, ...callbacks } = options;
  const [connectionState, setConnectionState] = useState<LkConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const micTrackRef = useRef<Track | null>(null);

  // Callbacks ref pour maj sans recréer le hook
  const callbacksRef = useRef(callbacks);
  useEffect(() => { callbacksRef.current = callbacks; });

  const setState = useCallback((s: LkConnectionState) => {
    setConnectionState(s);
    callbacksRef.current.onConnectionStateChange?.(s);
  }, []);

  const setErrorState = useCallback((err: string | null) => {
    setError(err);
    if (err) callbacksRef.current.onError?.(err);
  }, []);

  /**
   * Demande un token LiveKit au backend + connecte à la room.
   */
  const connect = useCallback(async (): Promise<boolean> => {
    // ⚠ DIAGNOSTIC: logging pour debug disconnect
    console.log("[useLiveKitRoom] connect() called — enabled=", enabled);
    if (!enabled) {
      setErrorState("LiveKit disabled (NEXT_PUBLIC_AI_USE_LIVEKIT != true)");
      return false;
    }
    if (roomRef.current?.state === ConnectionState.Connected) {
      console.log("[useLiveKitRoom] Already connected");
      return true;
    }

    setState("connecting");
    setErrorState(null);

    try {
      // 1. Récupère le JWT Supabase
      const supabase = createClientSafe();
      if (!supabase) {
        setErrorState("Supabase client not available");
        setState("error");
        return false;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorState("Session Supabase expirée");
        setState("error");
        return false;
      }

      // 2. Demande un token LiveKit au backend via le proxy Next.js (same-origin)
      //    (évite les problèmes CORS — le navigateur appelle /api/ai/livekit/token
      //    sur son propre domaine, qui relaie vers api.zipbox.online server-side)
      const res = await fetch("/api/ai/livekit/token", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl_seconds: 3600 }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Token fetch HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const { token, url, room: roomName } = data;
      if (!token || !url) {
        throw new Error("Backend didn't return token or url");
      }
      console.log(`[useLiveKitRoom] Token received — room=${roomName}, url=${url.replace(/token=[^&]+/, "token=***")}`);

      // 3. Connecte à la room LiveKit
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Audio capture — 16kHz mono (format attendu par Deepgram streaming)
        audioCaptureDefaults: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      // Événements de connexion
      room.on(RoomEvent.Connected, () => {
        console.log(`[useLiveKitRoom] ✅ RoomEvent.Connected — room=${room.name}`);
        setState("connected");
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log("[useLiveKitRoom] RoomEvent.Disconnected — reason=", reason);
        console.trace("[useLiveKitRoom] disconnect stack trace");
        setState("disconnected");
      });

      room.on(RoomEvent.Reconnecting, () => {
        console.log("[useLiveKitRoom] RoomEvent.Reconnecting");
        console.trace("[useLiveKitRoom] reconnect stack trace");
        setState("reconnecting");
      });

      room.on(RoomEvent.Reconnected, () => {
        console.log("[useLiveKitRoom] RoomEvent.Reconnected");
        setState("connected");
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        console.log(`[useLiveKitRoom] RoomEvent.ConnectionQualityChanged — quality=${quality}, participant=${participant?.identity || 'local'}`);
      });

      // Souscrit aux tracks audio publiés par l'agent
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log(`[useLiveKitRoom] RoomEvent.TrackSubscribed — from=${participant.identity}, kind=${track.kind}, name=${publication.trackName}`);
        if (track.kind === Track.Kind.Audio) {
          // L'agent a publié un audio track → on le joue
          const audioEl = track.attach() as HTMLAudioElement;
          document.body.appendChild(audioEl); // TODO C2.7: gérer playback mieux
          console.log("[useLiveKitRoom] Agent audio attached to <audio>");
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log(`[useLiveKitRoom] RoomEvent.TrackUnsubscribed — from=${participant?.identity || '?'}`);
        track.detach().forEach(el => el.remove());
      });

      // Détection de la voix de l'utilisateur (barge-in natif LiveKit)
      room.on(RoomEvent.LocalParticipantSpeakingChanged, (speaking) => {
        console.log(`[useLiveKitRoom] RoomEvent.LocalParticipantSpeakingChanged — speaking=${speaking}`);
        // L'agent backend reçoit cet event via LiveKit et arrête son TTS en cours
      });

      // Détection de l'agent qui parle
      room.on(RoomEvent.ParticipantSpeakingChanged, (participantSpeaking) => {
        console.log(`[useLiveKitRoom] RoomEvent.ParticipantSpeakingChanged — speaking=${!!participantSpeaking}`);
        callbacksRef.current.onAgentSpeaking?.(!!participantSpeaking);
      });

      // Connect
      console.log(`[useLiveKitRoom] room.connect(url=${url.replace(/token=[^&]+/, "token=***")}, token=***)`);
      await room.connect(url, token);

      // 4. Publie le micro de l'utilisateur
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        console.log("[useLiveKitRoom] 🎤 Microphone enabled + published");
      } catch (micErr) {
        console.warn("[useLiveKitRoom] Microphone enable failed:", micErr);
        // Continue quand même — l'user pourra activer son mic plus tard
      }

      return true;
    } catch (err: any) {
      console.error("[useLiveKitRoom] Connect failed:", err);
      setErrorState(`LiveKit connection failed: ${err.message}`);
      setState("error");
      return false;
    }
  }, [enabled, setState, setErrorState]);

  /**
   * Déconnecte de la room proprement.
   */
  const disconnect = useCallback(async () => {
    console.log("[useLiveKitRoom] disconnect() called");
    console.trace("[useLiveKitRoom] disconnect() stack trace");
    if (!roomRef.current) return;
      console.log("[useLiveKitRoom] Disconnected");
    } catch (err) {
      console.warn("[useLiveKitRoom] Disconnect error:", err);
    }
    roomRef.current = null;
    setState("disconnected");
  }, [setState]);

  /**
   * Active/désactive le micro.
   */
  const toggleMute = useCallback(async (): Promise<boolean> => {
    if (!roomRef.current) return false;
    try {
      const newMuted = !isMuted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
      console.log(`[useLiveKitRoom] Micro ${newMuted ? "muted" : "unmuted"}`);
      return newMuted;
    } catch (err: any) {
      console.error("[useLiveKitRoom] Toggle mute failed:", err);
      return isMuted;
    }
  }, [isMuted]);

  // Cleanup au unmount
  useEffect(() => {
    return () => {
      console.log("[useLiveKitRoom] useEffect cleanup (unmount) — roomRef.current=", !!roomRef.current);
      console.trace("[useLiveKitRoom] useEffect cleanup stack trace");
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch {}
        roomRef.current = null;
      }
    };
  }, []);

  return {
    connectionState,
    room: roomRef.current,
    error,
    connect,
    disconnect,
    toggleMute,
    isMuted,
  };
}
