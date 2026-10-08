"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";
import { YazzAssistantModal } from "./yazz-assistant-modal";

export function YazzAssistantFab({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-[#2b44ee] shadow-lg flex items-center justify-center hover:bg-[#1d34d4] transition-colors"
        aria-label="Assistant IA Yazz"
      >
        {/* Sound wave animée (3 barres pulsantes) */}
        <div className="flex items-end gap-1 h-6">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 bg-white rounded-full"
              style={{
                height: "100%",
                animation: `soundwave 1.8s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </button>

      <AnimatePresence>
        {open && <YazzAssistantModal onClose={() => setOpen(false)} />}
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
