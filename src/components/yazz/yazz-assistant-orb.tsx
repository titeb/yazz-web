"use client";

import { motion } from "framer-motion";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

const COLORS: Record<OrbState, { primary: string; secondary: string; accent: string }> = {
  idle: { primary: "#3c5663", secondary: "#1b6d97", accent: "#1b6d97" },
  listening: { primary: "#1b6d97", secondary: "#4b809b", accent: "#1b6d97" },
  thinking: { primary: "#c16648", secondary: "#a38445", accent: "#c16648" },
  speaking: { primary: "#4b809b", secondary: "#1b6d97", accent: "#4b809b" },
  error: { primary: "#a64b43", secondary: "#7a3835", accent: "#a64b43" },
};

export function YazzAssistantOrb({ state, size = 220 }: { state: OrbState; size?: number }) {
  const colors = COLORS[state];
  const isAnimated = state === "listening" || state === "thinking" || state === "speaking" || state === "idle";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Halo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle, ${colors.accent}40 0%, transparent 70%)`,
        }}
        animate={
          state === "listening"
            ? { scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }
            : state === "thinking"
            ? { rotate: 360 }
            : state === "speaking"
            ? { scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }
            : { scale: [1, 1.04, 1], opacity: [0.4, 0.5, 0.4] }
        }
        transition={
          state === "thinking"
            ? { duration: 3, repeat: Infinity, ease: "linear" }
            : { duration: state === "speaking" ? 0.8 : 2, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* Vagues concentriques pendant l'écoute */}
      {state === "listening" && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border-2"
              style={{ borderColor: colors.accent }}
              animate={{
                scale: [0.6, 1.2],
                opacity: [0.6, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.4,
                ease: "easeOut",
              }}
            />
          ))}
        </>
      )}

      {/* Particules orbitales pour thinking (8 points qui tournent) */}
      {state === "thinking" && (
        <motion.div
          className="absolute"
          style={{ width: size, height: size }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * 360) / 8;
            const radius = size * 0.4;
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: colors.accent,
                  opacity: 0.7,
                  left: "50%",
                  top: "50%",
                  transform: `rotate(${angle}deg) translateX(${radius}px)`,
                  marginLeft: -3,
                  marginTop: -3,
                }}
              />
            );
          })}
        </motion.div>
      )}

      {/* Cercle central */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: size * 0.55,
          height: size * 0.55,
          background: `radial-gradient(circle at 50% 30%, ${colors.secondary}, ${colors.primary})`,
          boxShadow: `0 0 30px ${colors.accent}60`,
        }}
        animate={
          state === "speaking"
            ? { scale: [1, 1.06, 0.97, 1.04, 1] }
            : state === "idle"
            ? { scale: [1, 1.03, 1] }
            : { scale: 1 }
        }
        transition={{
          duration: state === "speaking" ? 0.6 : 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Point lumineux intérieur */}
        <div
          className="absolute rounded-full bg-white/80"
          style={{
            width: "15%",
            height: "15%",
            top: "25%",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
      </motion.div>
    </div>
  );
}
