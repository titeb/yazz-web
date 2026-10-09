"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Keyboard, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YazzAssistantOrb } from "./yazz-assistant-orb";
import { createClientSafe } from "@/lib/supabase/client";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface Message {
  role: "user" | "assistant";
  content: string;
  audioUrl?: string;
  confirmationCard?: any;
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
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        console.log("[AI Assistant] Final transcript:", finalTranscript);
        recognition.stop();
        sendMessage(finalTranscript);
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

  // Send message to backend (STREAMING via SSE)
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    console.log("[AI Assistant] Sending (stream):", text);
    setState("thinking");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

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
        const errData = await res.json().catch(() => ({}));
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
                  // Jouer le chunk audio immédiatement
                  if (data.audioUrl) {
                    const audio = new Audio(data.audioUrl);
                    audio.play().catch(() => {});
                  }
                  break;
                case "done":
                  if (data.conversationId) setConversationId(data.conversationId);
                  if (data.confirmationCard) {
                    setState("idle");
                  } else {
                    setState("idle");
                    autoRestartListening();
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
          const audio = new Audio(data2.audioUrl);
          audio.onended = () => { setState("idle"); autoRestartListening(); };
          audio.play().catch(() => { setState("idle"); autoRestartListening(); });
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

  // Toggle listening
  const toggleListening = () => {
    if (!recognitionRef.current) {
      setShowTextInput(true);
      return;
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
    if (!text) return;
    setTextInput("");
    sendMessage(text);
  };

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
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 pb-4 max-h-[35vh] flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed max-w-[70%] sm:max-w-[60%] ${
                msg.role === "user"
                  ? "bg-[#1b6d97] text-white rounded-br-sm"
                  : "bg-white/8 text-white/90 rounded-bl-sm border border-white/5"
              }`}
            >
              {msg.content}
            </div>
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
