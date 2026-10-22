"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { YazzAssistantModal } from "./yazz-assistant-modal";

// ⚠ FIX: utilise next/dynamic avec ssr: false pour le modal LiveKit
// car livekit-client nécessite window/document/RTCPeerConnection (browser-only)
// Sans ssr: false, next build crash pendant le SSR.
const YazzAssistantLiveKitModal = dynamic(
  () => import("./yazz-assistant-livekit-modal").then(m => m.YazzAssistantLiveKitModal),
  { ssr: false }
);

const USE_LIVEKIT = process.env.NEXT_PUBLIC_AI_USE_LIVEKIT === "true";

export function YazzAssistantFab({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  console.log("[Fab] enabled =", enabled, "open =", open, "USE_LIVEKIT =", USE_LIVEKIT);

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-40 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#2b44ee] shadow-lg flex items-center justify-center hover:bg-[#1d34d4] transition-colors"
        aria-label="Assistant IA Yazz"
      >
        {/* Sound wave animée (3 barres pulsantes) */}
        <div className="flex items-end gap-0.5 sm:gap-1 h-4 sm:h-5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-0.5 sm:w-1 bg-white rounded-full"
              style={{
                height: "100%",
                animation: `soundwave 1.8s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          USE_LIVEKIT
            ? <YazzAssistantLiveKitModal onClose={() => setOpen(false)} />
            : <YazzAssistantModal onClose={() => setOpen(false)} />
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes soundwave {
          0%, 100% { transform: scaleY(0.2); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </>
  );
}
