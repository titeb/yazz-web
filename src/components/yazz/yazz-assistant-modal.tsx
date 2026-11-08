"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Mic, Keyboard, X, Send, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YazzAssistantOrb } from "./yazz-assistant-orb";
import { createClientSafe } from "@/lib/supabase/client";
import { useAiWebSocket } from "@/hooks/use-ai-websocket";

// Feature flag : si true, utilise WebSocket (Plan B1) ; sinon garde SSE.
// Rollback instantané : set NEXT_PUBLIC_AI_USE_WS=false → le modal retombe sur SSE.
const USE_WS = process.env.NEXT_PUBLIC_AI_USE_WS === "true";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface CardAction {
  label: string;
  action: string; // 'confirm' | 'cancel' | 'confirm_delete' | …
}

interface ConfirmationCard {
  card_id: string;
  title: string;
  summary: string;
  details?: Record<string, unknown>;
  actions?: CardAction[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  audioUrl?: string;
  confirmationCard?: ConfirmationCard;
  /** Carte déjà traitée (confirmée, annulée ou fermée) : boutons masqués. */
  cardResolved?: boolean;
}

/**
 * Accroche la carte de confirmation reçue au message de l'assistant (ou en
 * crée un si l'IA n'a pas produit de texte).
 * FIX 2026-11-07 : avant, la carte n'était jamais affichée sur le web (mode
 * SSE : ignorée ; mode WS : stockée mais jamais rendue) → impossible de
 * confirmer une action (mode parking, SOS…).
 */
function withCard(prev: Message[], card: ConfirmationCard, text?: string): Message[] {
  const updated = [...prev];
  const lastIdx = updated.length - 1;
  if (updated[lastIdx]?.role === "assistant") {
    updated[lastIdx] = { ...updated[lastIdx], confirmationCard: card, cardResolved: false };
  } else {
    updated.push({ role: "assistant", content: text || "", confirmationCard: card, cardResolved: false });
  }
  return updated;
}

// Web Speech API types (not in TS by default)
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export function YazzAssistantModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<OrbState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  // Carte en cours de confirmation (index du message) — évite le double clic
  const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Guard contre l'envoi multiple — Web Speech API peut fire onresult
  // plusieurs fois avec isFinal=true avant que recognition.stop() ne prenne effet.
  const isSendingRef = useRef(false);
  // File d'attente pour les chunks audio — on les joue en séquence
  // (pas en parallèle) pour éviter le chevauchement.
  const audioQueueRef = useRef<{ url: string; text: string }[]>([]);
  const isPlayingRef = useRef(false);
  // audioUnlockedRef — true après qu'un premier gesture utilisateur a "débloqué"
  // l'audio (contourne la politique d'autoplay de Chrome/Safari).
  const audioUnlockedRef = useRef(false);

  // 🔔 Beep sound — joue un bip doux et fluide pour signaler "à toi de parler"
  // Utilise Web Audio API (pas de fichier externe needed).
  // 2 tons : high (880Hz) pour "début écoute", low (440Hz) pour "fin IA parle".
  // Son doux avec fade in/out progressif (pas agressif).
  const playBeep = useCallback((freq: number = 880, duration: number = 400) => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      // Envelope doux : fade in 80ms, sustain, fade out 120ms (son fluide, pas de clic)
      const now = ctx.currentTime;
      const dur = duration / 1000;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.08);  // fade in doux
      gain.gain.setValueAtTime(0.12, now + dur - 0.12);      // sustain
      gain.gain.linearRampToValueAtTime(0, now + dur);       // fade out doux
      osc.start(now);
      osc.stop(now + dur);
      // Cleanup le context après le beep
      setTimeout(() => { try { ctx.close(); } catch {} }, duration + 100);
    } catch (e) {
      // Web Audio pas dispo — ignore
    }
  }, []);

  // Initialise un SEUL élément Audio partagé pour TOUT le playback TTS.
  // Quand on set audio.src + audio.play(), le navigateur coupe automatiquement
  // toute lecture en cours → empêche intrinsèquement le chevauchement même
  // en cas de race condition dans la queue.
  useEffect(() => {
    if (typeof Audio !== "undefined" && !audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
      console.log("[AI Assistant] Shared Audio element initialized");
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log("[AI Assistant] Web Speech API not available — text mode only");
      setShowTextInput(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      console.log("[AI Assistant] Speech recognition started");
      setIsListening(true);
      setState("listening");
      // 🔔 Bip aigu (880Hz, 400ms) = "à toi de parler" — son doux et fluide
      playBeep(880, 400);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript.trim() && !isSendingRef.current) {
        console.log("[AI Assistant] Final transcript:", finalTranscript);
        isSendingRef.current = true;
        recognition.stop();
        sendMessage(finalTranscript).finally(() => {
          // Réarme le guard après envoi (succès ou échec)
          isSendingRef.current = false;
        });
      }
    };

    recognition.onend = () => {
      console.log("[AI Assistant] Speech recognition ended");
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("[AI Assistant] Speech error:", event.error);
      setIsListening(false);
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setState("idle");
      }
    };

    // Auto-start listening after 500ms (like the ding on mobile)
    const timer = setTimeout(() => {
      try {
        recognition.start();
      } catch (e) {
        console.log("[AI Assistant] Could not auto-start recognition");
        setShowTextInput(true);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      if (recognition) recognition.stop();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Débloque l'audio sur le premier geste utilisateur (click/keydown).
  // Chrome/Safari bloquent audio.play() sans geste. On crée un élément Audio
  // muet qu'on "play" immédiatement — ça débloque le contexte pour les play() suivants.
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    try {
      // WAV silencieux court (44 bytes header + 0 data) — juste pour débloquer
      const silentWav = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      const a = new Audio(silentWav);
      a.volume = 0;
      a.play().then(() => {
        audioUnlockedRef.current = true;
        console.log("[AI Assistant] Audio context unlocked");
        a.pause();
      }).catch((err) => {
        console.warn("[AI Assistant] Audio unlock failed:", err.message);
      });
    } catch (e) {
      // ignore
    }
  }, []);

  // Débloque sur le premier geste (modal open ou click).
  // Aussi : on tente un unlock immédiat à l'ouverture du modal — le click
  // sur le FAB qui a ouvert le modal compte comme geste utilisateur, donc
  // audio.play() dans les ~5s suivantes devrait passer la politique d'autoplay.
  useEffect(() => {
    // Unlock immédiat (tente de profiter du gesture qui a ouvert le modal)
    unlockAudio();
    const handler = () => unlockAudio();
    window.addEventListener("click", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [unlockAudio]);

  // Joue un chunk audio via l'Audio element partagé.
  // Quand on set audio.src = url, le navigateur STOPPE la lecture en cours
  // et charge la nouvelle URL → impossible d'avoir 2 chunks qui jouent en parallèle
  // (même si la queue avait une race condition).
  const playAudioChunk = useCallback(async (url: string, text: string, index: number) => {
    if (!url) return;
    const audio = audioRef.current;
    if (!audio) {
      console.warn("[AI Assistant] No shared Audio element — skipping chunk");
      return;
    }
    console.log(`[AI Assistant] ▶ playAudioChunk #${index} START — text="${text.substring(0, 50)}..." (${url.length} chars)`);
    return new Promise<void>((resolve) => {
      let resolved = false;
      const safeResolve = (reason: string) => {
        if (resolved) return;
        resolved = true;
        console.log(`[AI Assistant] ■ playAudioChunk #${index} END (${reason})`);
        // Cleanup handlers pour éviter les doublons
        audio.onended = null;
        audio.onerror = null;
        resolve();
      };

      audio.onended = () => safeResolve("onended");
      audio.onerror = (e) => {
        console.error(`[AI Assistant] ❌ Audio #${index} onerror:`, e);
        safeResolve("onerror");
      };

      // ⚠ Important : set src AVANT play() — sinon l'audio précédent continue
      audio.src = url;
      audio.play().then(() => {
        console.log(`[AI Assistant] ▶ Audio #${index} play() resolved (now playing)`);
      }).catch((err) => {
        console.error(`[AI Assistant] ❌ Audio #${index} play() rejected: ${err.name} — ${err.message}`);
        if (err.name === "NotAllowedError") {
          audioUnlockedRef.current = false;
        }
        safeResolve("play rejected");
      });

      // Safety timeout — si un chunk ne termine jamais (rare), on passe au suivant
      // après 30s max (les chunks Kokoro font 4-9s normalement).
      setTimeout(() => safeResolve("timeout 30s"), 30_000);
    });
  }, []);

  // Enqueue un chunk audio — sera joué en séquence par le consumer.
  // Le consumer tourne tant que isPlayingRef=true et queue non-vide.
  // ⚠ FIX ECHO LOOP (2026-10-15) : autoRestartListening() est appelé ICI
  // (quand la queue est VIDE) et NON PLUS dans onDone. Sinon le mic redémarre
  // pendant que les chunks audio jouent encore → l'IA entend sa propre voix → boucle.
  const enqueueAudio = useCallback((url: string, text: string) => {
    audioQueueRef.current.push({ url, text });
    const nextIndex = audioQueueRef.current.length - 1;
    console.log(`[AI Assistant] 📥 Enqueued audio chunk #${nextIndex} — text="${text.substring(0, 50)}..." queue_len=${audioQueueRef.current.length} isPlaying=${isPlayingRef.current}`);

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      console.log("[AI Assistant] 🚀 Starting audio queue consumer");
      (async () => {
        let chunkIndex = 0;
        while (audioQueueRef.current.length > 0) {
          const chunk = audioQueueRef.current.shift()!;
          console.log(`[AI Assistant] 🎯 Consumer shifting #${chunkIndex} — remaining=${audioQueueRef.current.length}`);
          await playAudioChunk(chunk.url, chunk.text, chunkIndex);
          chunkIndex++;
        }
        isPlayingRef.current = false;
        console.log("[AI Assistant] ✅ Audio queue empty — consumer stopped — restarting listening");
        // 🔔 Bip grave (440Hz, 350ms) = "l'IA a fini, à toi" — son doux et fluide
        playBeep(440, 350);
        // ⚠ FIX: restart listening ONLY when ALL audio has finished playing.
        // Adding 500ms delay to let the last audio sample fully decay (avoid echo).
        setTimeout(() => {
          try {
            if (recognitionRef.current && !isSendingRef.current) {
              recognitionRef.current.start();
              console.log("[AI Assistant] ✅ Listening restarted (post-audio drain)");
            }
          } catch (e) {
            // Already started or not available
          }
        }, 500);
      })();
    }
  }, [playAudioChunk]);

  // Auto-restart listening after AI finishes speaking
  const autoRestartListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setTimeout(() => {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started or not available
      }
    }, 800);
  }, []);

  // ───────── Phase B2 — WebSocket mode (feature flag) ─────────
  // Si NEXT_PUBLIC_AI_USE_WS=true, on utilise le hook useAiWebSocket
  // qui envoie les messages via WS et reçoit les chunks via callbacks.
  // Sinon, le hook reste idle (enabled=false) et sendMessage utilise SSE.
  // Réf pour accumulateur de texte assistant (évite re-render trop fréquent)
  const wsAssistantTextRef = useRef<string>("");
  // Réf pour la fonction bargeIn du hook (appelée par bargeIn() du modal)
  const wsBargeInRef = useRef<(() => void) | null>(null);
  // Réf pour la fonction send du hook
  const wsSendRef = useRef<((text: string, conversationId?: string) => boolean) | null>(null);

  const wsHook = useAiWebSocket({
    enabled: USE_WS,
    onTextChunk: (chunk: string) => {
      // Accumule et met à jour le dernier message assistant
      wsAssistantTextRef.current += chunk;
      setState("speaking");
      const currentText = wsAssistantTextRef.current;
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === "assistant") {
          updated[lastIdx] = { ...updated[lastIdx], content: currentText };
        }
        return updated;
      });
    },
    onAudioChunk: (audioUrl: string, text: string, index: number) => {
      console.log(`[AI/WS] Audio chunk #${index} received, text="${text.substring(0, 40)}"`);
      enqueueAudio(audioUrl, text);
    },
    onDone: (result) => {
      if (result.conversationId) setConversationId(result.conversationId);
      if (result.confirmationCard) {
        setState("idle");
        setMessages((prev) => withCard(prev, result.confirmationCard, result.text));
      } else {
        setState("idle");
        // ⚠ FIX ECHO LOOP: ne PAS appeler autoRestartListening() ici.
        // Le restart se fait dans enqueueAudio() quand la queue audio est VIDE.
        // Sinon le mic redémarre pendant que l'audio joue encore → echo loop.
      }
      // Reset l'accumulateur pour le prochain tour
      wsAssistantTextRef.current = "";
    },
    onError: (error: string) => {
      console.error("[AI/WS] Error:", error);
      setError(error);
      setState("error");
      wsAssistantTextRef.current = "";
    },
    onBargeInAck: () => {
      console.log("[AI/WS] Server acknowledged barge-in");
    },
    onConnectionStateChange: (state) => {
      console.log(`[AI/WS] Connection state: ${state}`);
    },
  });

  // Maintient les refs à jour pour que bargeIn() du modal puisse appeler ws.bargeIn()
  useEffect(() => {
    if (USE_WS) {
      wsBargeInRef.current = wsHook.bargeIn;
      wsSendRef.current = wsHook.send;
    } else {
      wsBargeInRef.current = null;
      wsSendRef.current = null;
    }
  }, [USE_WS, wsHook.bargeIn, wsHook.send]);

  // Send message to backend (STREAMING via SSE)
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    console.log("[AI Assistant] Sending (stream):", text);
    setState("thinking");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    // ─── Branch Phase B2 — WebSocket path (si flag activé + connecté) ───
    // Si USE_WS=true et que le WS est connecté, on envoie via WS.
    // Sinon, on retombe sur le code SSE existant (safety net).
    if (USE_WS && wsHook.isConnected && wsSendRef.current) {
      console.log("[AI Assistant] Using WebSocket path");
      // Reset l'accumulateur de texte pour ce nouveau tour
      wsAssistantTextRef.current = "";
      // Ajoute un message assistant vide qu'on va remplir progressivement
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      // Envoie le message au backend via WS
      const sent = wsSendRef.current(text, conversationId || undefined);
      if (sent) return; // Le hook va appeler onTextChunk/onAudioChunk/onDone
      // Si l'envoi échoue (WS déconnecté entretemps), on tombe sur SSE
      console.warn("[AI Assistant] WS send failed — falling back to SSE");
    }

    // ─── SSE path (code original, inchangé) ───
    try {
      const supabase = createClientSafe();
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) {
        setError("Session expirée");
        setState("error");
        return;
      }

      // Utiliser la route SSE /api/ai/chat/stream
      const formData = new FormData();
      formData.append("text", text);
      if (conversationId) formData.append("conversation_id", conversationId);

      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch { errData = { error: `Erreur ${res.status}` }; }
        console.error(`[AI Assistant] Fetch failed: HTTP ${res.status} — body="${errText.substring(0, 200)}"`);
        setError(errData.error || `Erreur ${res.status}`);
        setState("error");
        return;
      }

      // Lire le flux SSE
      const reader = res.body?.getReader();
      if (!reader) {
        setError("Stream non disponible");
        setState("error");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let assistantText = "";
      let assistantIndex = -1;

      // Ajouter un message assistant vide qu'on va remplir progressivement
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      assistantIndex = -1; // Sera mis à jour ci-dessous

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.substring(7).trim();
            continue;
          }
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.substring(6);
            try {
              const data = JSON.parse(dataStr);
              switch (currentEvent) {
                case "text":
                  assistantText += data.chunk || "";
                  setState("speaking");
                  // Mettre à jour le dernier message assistant progressivement
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (updated[lastIdx]?.role === "assistant") {
                      updated[lastIdx] = { ...updated[lastIdx], content: assistantText };
                    }
                    return updated;
                  });
                  break;
                case "audio":
                  // Enqueue le chunk audio (joué en séquence)
                  console.log(`[AI Assistant] Audio SSE event received: idx=${data.index}, text="${(data.text || "").substring(0, 40)}", audioUrl_len=${(data.audioUrl || "").length}`);
                  if (data.audioUrl) {
                    enqueueAudio(data.audioUrl, data.text || "");
                  } else {
                    console.warn("[AI Assistant] Audio event has no audioUrl");
                  }
                  break;
                case "done":
                  if (data.conversationId) setConversationId(data.conversationId);
                  if (data.confirmationCard) {
                    setState("idle");
                    setMessages((prev) => withCard(prev, data.confirmationCard, data.text));
                  } else {
                    setState("idle");
                    // ⚠ FIX ECHO LOOP: ne PAS appeler autoRestartListening() ici.
                    // Le restart se fait dans enqueueAudio() quand la queue audio est VIDE.
                  }
                  break;
                case "error":
                  setError(data.error || "Erreur");
                  setState("error");
                  break;
              }
            } catch (e) {
              // JSON invalide — ignorer
            }
          }
        }
      }

      // Si le texte est vide (streaming a échoué silencieusement), fallback batch
      if (!assistantText.trim()) {
        console.log("[AI Assistant] Stream empty, falling back to batch...");
        const formData2 = new FormData();
        formData2.append("text", text);
        if (conversationId) formData2.append("conversation_id", conversationId);
        const res2 = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData2,
        });
        const data2 = await res2.json();
        if (data2.conversationId) setConversationId(data2.conversationId);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: data2.text || "Désolé, je n'ai pas pu répondre.",
          };
          return updated;
        });
        if (data2.audioUrl) {
          // ⚠ FIX ECHO LOOP: enqueue le batch audio comme les chunks streaming
          // (le restart listening se fera quand la queue sera vide, pas ici)
          enqueueAudio(data2.audioUrl, data2.text || "Réponse");
        } else {
          setState("idle");
          autoRestartListening();
        }
      }
    } catch (err: any) {
      console.error("[AI Assistant] Error:", err);
      setError(err.message || "Erreur réseau");
      setState("error");
    }
  };

  // Barge-in : interrompt la lecture audio en cours + vide la queue
  // + relance l'écoute. Utilisé quand l'utilisateur clique le mic pendant
  // que l'IA parle — il peut couper la parole à l'IA (conversation live).
  // En mode WS, on envoie aussi un signal barge_in au serveur pour qu'il
  // arrête de générer/streamer les chunks TTS (économise du coût API + CPU).
  const bargeIn = useCallback(() => {
    console.log("[AI Assistant] 🛑 BARGE-IN — stopping audio + clearing queue");
    // 1. Stoppe la lecture audio en cours
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    // 2. Vide la queue des chunks audio en attente
    audioQueueRef.current = [];
    // 3. Le consumer en cours va se terminer (le Promise va résoudre sur le
    //    pause() car audio.onerror/onended va fire — ou le timeout 30s).
    //    On force isPlayingRef = false pour qu'un nouveau consumer démarre
    //    proprement si l'utilisateur parle à nouveau.
    isPlayingRef.current = false;
    // 4. En mode WS : envoie signal serveur pour arrêter la génération TTS
    wsBargeInRef.current?.();
    console.log("[AI Assistant] ✅ Barge-in complete — ready for new input");
  }, []);

  // Toggle listening
  const toggleListening = () => {
    if (!recognitionRef.current) {
      setShowTextInput(true);
      return;
    }
    // Si l'IA est en train de parler, le click sur le mic = BARGE-IN
    // (interrompt la lecture et relance l'écoute)
    if (state === "speaking" || isPlayingRef.current) {
      console.log("[AI Assistant] Mic clicked during speaking → barge-in");
      bargeIn();
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started
      }
    }
  };

  // Send text input
  const sendText = () => {
    const text = textInput.trim();
    if (!text || isSendingRef.current) return;
    isSendingRef.current = true;
    setTextInput("");
    sendMessage(text).finally(() => {
      isSendingRef.current = false;
    });
  };

  /**
   * Réponse à une carte : confirmer (appel serveur, qui revérifie les droits
   * puis exécute l'action), annuler, ou fermer une carte d'information.
   * Le résultat est écrit dans la conversation.
   */
  const respondToCard = useCallback(
    async (index: number, kind: "confirm" | "cancel" | "dismiss") => {
      const card = messages[index]?.confirmationCard;
      if (!card || confirmingIdx !== null) return;
      const resolve = (reply?: string) =>
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], cardResolved: true };
          if (reply) updated.push({ role: "assistant", content: reply });
          return updated;
        });

      if (kind === "dismiss") return resolve();
      if (kind === "cancel") return resolve("D'accord, j'ai annulé. Dis-moi si tu veux autre chose.");

      setConfirmingIdx(index);
      try {
        const supabase = createClientSafe();
        const { data: { session } } = await supabase!.auth.getSession();
        if (!session) {
          resolve("Session expirée. Reconnecte-toi puis redemande l'action.");
          return;
        }
        const res = await fetch("/api/ai/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ card_id: card.card_id, details: card.details }),
        });
        const data = await res.json().catch(() => ({}));
        const message: string = data?.message || data?.error || "";
        resolve(
          data?.confirmed
            ? message || "C'est fait."
            : `Je n'ai pas pu terminer l'action : ${message || `erreur ${res.status}`}`,
        );
      } catch {
        resolve("Je n'ai pas pu terminer l'action : problème de connexion. Réessaie.");
      } finally {
        setConfirmingIdx(null);
      }
    },
    [messages, confirmingIdx],
  );

  const stateLabel: Record<OrbState, string> = {
    idle: "Prêt à t'écouter",
    listening: "Je t'écoute…",
    thinking: "Je réfléchis…",
    speaking: "Je te réponds…",
    error: "Erreur",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="h-6 w-6" />
        </button>
        <span className="text-white font-medium text-base">Yazz Assistant</span>
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="text-white/70 hover:text-white"
        >
          {showTextInput ? <Mic className="h-6 w-6" /> : <Keyboard className="h-6 w-6" />}
        </button>
      </div>

      {/* Orb */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <YazzAssistantOrb state={state} size={200} />
        <p className="text-white/60 text-sm mt-4 tracking-wide">{stateLabel[state]}</p>
        {/* Conversation vocale en direct (page dédiée, bêta) */}
        <Link
          href="/assistant-live"
          onClick={onClose}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-medium text-white hover:bg-white/15 transition-colors"
        >
          <Phone className="h-4 w-4" />
          Parler en direct
          <span className="rounded-full bg-[#2b44ee] px-1.5 py-0.5 text-[10px] font-semibold">Bêta</span>
        </Link>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 max-h-[35vh] flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.content && (
              <div
                className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed max-w-[70%] sm:max-w-[60%] ${
                  msg.role === "user"
                    ? "bg-[#1b6d97] text-white rounded-br-sm"
                    : "bg-white/8 text-white/90 rounded-bl-sm border border-white/5"
                }`}
              >
                {msg.content}
              </div>
            )}
            {msg.confirmationCard && !msg.cardResolved && (
              <ConfirmationCardView
                card={msg.confirmationCard}
                busy={confirmingIdx === i}
                onConfirm={() => respondToCard(i, "confirm")}
                onCancel={() => respondToCard(i, "cancel")}
                onDismiss={() => respondToCard(i, "dismiss")}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-4 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-3 flex items-center gap-2">
          <span className="text-red-400 text-xs flex-1">{error}</span>
          <button
            onClick={() => { setError(null); setState("idle"); }}
            className="text-red-400 text-xs bg-red-500/30 px-3 py-1 rounded"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <div className="p-6 flex items-center justify-center gap-6">
        <button
          onClick={onClose}
          className="w-12 h-12 rounded-full bg-white flex items-center justify-center"
        >
          <X className="h-5 w-5 text-black" />
        </button>
        {showTextInput ? (
          <div className="flex-1 max-w-md flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="Pose ta question…"
              className="flex-1 bg-white/10 text-white rounded-full px-4 py-3 text-sm outline-none placeholder:text-white/30"
              autoFocus
            />
            <button
              onClick={sendText}
              className="w-14 h-14 rounded-full bg-[#2b44ee] flex items-center justify-center"
            >
              <Send className="h-5 w-5 text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={toggleListening}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
              isListening ? "bg-[#1b6d97]" : "bg-[#3c5663]"
            }`}
          >
            <Mic className={`h-7 w-7 ${isListening ? "text-white" : "text-white/70"}`} />
          </button>
        )}
        <button
          onClick={() => setShowTextInput(!showTextInput)}
          className="w-12 h-12 rounded-full bg-[#3c5663] flex items-center justify-center"
        >
          {showTextInput ? <Mic className="h-5 w-5 text-white/70" /> : <Keyboard className="h-5 w-5 text-white/70" />}
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Carte de confirmation d'une action (mode parking, SOS, alerte…). Les
 * boutons viennent du serveur ; une carte d'information (SOS déjà en cours,
 * permission…) n'a qu'un bouton « J'ai compris ».
 */
function ConfirmationCardView({
  card,
  busy,
  onConfirm,
  onCancel,
  onDismiss,
}: {
  card: ConfirmationCard;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const actions = card.actions ?? [];
  const confirm = actions.find((a) => a.action === "confirm" || a.action === "confirm_delete");
  const cancel = actions.find((a) => a.action === "cancel");
  return (
    <div
      role="dialog"
      aria-label={card.title}
      className="max-w-[85%] sm:max-w-[60%] rounded-xl border border-[#a38445] bg-[#a38445]/15 p-4"
    >
      <p className="text-[15px] font-semibold text-white">{card.title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-white/70">{card.summary}</p>
      <div className="mt-4 flex items-center justify-end gap-2">
        {confirm ? (
          <>
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-[13px] text-white/60 hover:text-white disabled:opacity-40"
            >
              {cancel?.label || "Annuler"}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="rounded-lg bg-[#1b6d97] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1b6d97]/90 disabled:opacity-60"
            >
              {busy ? "…" : confirm.label}
            </button>
          </>
        ) : (
          <button
            onClick={onDismiss}
            className="rounded-lg bg-[#1b6d97] px-4 py-2 text-[13px] font-medium text-white"
          >
            {cancel?.label || "J'ai compris"}
          </button>
        )}
      </div>
    </div>
  );
}
