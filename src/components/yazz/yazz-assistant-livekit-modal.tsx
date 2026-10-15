"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YazzAssistantOrb } from "./yazz-assistant-orb";
import { useLiveKitRoom } from "@/hooks/use-livekit-room";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface YazzAssistantLiveKitModalProps {
  onClose: () => void;
}

/**
 * Phase C3 — Modal LiveKit variant.
 *
 * Variante du YazzAssistantModal qui utilise LiveKit (WebRTC audio bidirectionnel)
 * au lieu de SSE/WS. À activer avec NEXT_PUBLIC_AI_USE_LIVEKIT=true.
 *
 * Pour l'instant : squelette + connexion + UI.
 * L'audio bridging complet (Deepgram ↔ DeepSeek ↔ ElevenLabs via LiveKit agent)
 * est TODO C2.7 audio (nécessite livekit-rtc + DeepSeek/ElevenLabs payés).
 *
 * Tant que l'agent n'a pas le bridge audio, ce modal peut se connecter à
 * LiveKit mais ne reçoit pas encore d'audio de l'IA (l'agent ne publie pas).
 */
export function YazzAssistantLiveKitModal({ onClose }: YazzAssistantLiveKitModalProps) {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Bonjour ! Je suis votre assistant Yazz. Mode LiveKit (Phase C3 — squelette).",
    },
  ]);

  // Hook LiveKit — connecte automatiquement au montage
  const { connectionState, isMuted, connect, disconnect, toggleMute } = useLiveKitRoom({
    enabled: true,
    onError: (err) => {
      setError(err);
      setOrbState("error");
    },
    onConnectionStateChange: (state) => {
      switch (state) {
        case "connecting":
          setOrbState("thinking");
          break;
        case "connected":
          setOrbState("listening");
          setError(null);
          break;
        case "disconnected":
          setOrbState("idle");
          break;
        case "reconnecting":
          setOrbState("thinking");
          break;
        case "error":
          setOrbState("error");
          break;
      }
    },
    onAgentSpeaking: (speaking) => {
      setOrbState(speaking ? "speaking" : "listening");
    },
  });

  // Auto-connect au montage du modal
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = async () => {
    await disconnect();
    onClose();
  };

  const handleToggleMute = async () => {
    await toggleMute();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/70 hover:text-white"
        >
          <X className="w-6 h-6" />
        </Button>

        <div className="flex flex-col items-center gap-8 w-full max-w-md px-6">
          {/* Connection indicator */}
          <div className="text-white/50 text-sm font-mono">
            {connectionState === "connected" ? "🟢 Connected" : connectionState}
          </div>

          {/* Orb */}
          <YazzAssistantOrb state={orbState as any} />

          {/* Status text */}
          {error && (
            <div className="text-red-400 text-sm text-center max-w-sm">
              {error}
            </div>
          )}
          {!error && connectionState !== "connected" && (
            <div className="text-white/50 text-sm text-center">
              {connectionState === "connecting" ? "Connecting to LiveKit..." :
               connectionState === "reconnecting" ? "Reconnecting..." :
               "Disconnected"}
            </div>
          )}

          {/* Messages (just display, no input — audio only mode for now) */}
          <div className="w-full max-h-40 overflow-y-auto text-white/70 text-sm space-y-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={msg.role === "user" ? "text-right" : "text-left"}
              >
                <span className={msg.role === "user" ? "text-blue-400" : "text-white/90"}>
                  {msg.content}
                </span>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={handleToggleMute}
              disabled={connectionState !== "connected"}
              className="rounded-full w-16 h-16 p-0 bg-white/5 border-white/20 hover:bg-white/10"
            >
              {isMuted ? (
                <MicOff className="w-6 h-6 text-red-400" />
              ) : (
                <Mic className="w-6 h-6 text-white" />
              )}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={handleClose}
              className="rounded-full w-16 h-16 p-0 bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
            >
              <Phone className="w-6 h-6 text-red-400" />
            </Button>
          </div>

          {/* Note : pour l'instant, pas de chat textuel — mode audio seulement */}
          <div className="text-white/30 text-xs text-center max-w-sm">
            Mode LiveKit — squelette Phase C3 (audio bridge TODO C2.7)
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
