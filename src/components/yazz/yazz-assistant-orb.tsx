"use client";

import { motion } from "framer-motion";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

const COLORS: Record<OrbState, { primary: string; secondary: string; accent: string; glow: string }> = {
  idle: { primary: "#3c5663", secondary: "#1b6d97", accent: "#1b6d97", glow: "#1b6d97" },
  listening: { primary: "#0ea5e9", secondary: "#0284c7", accent: "#38bdf8", glow: "#0ea5e9" },
  thinking: { primary: "#f59e0b", secondary: "#d97706", accent: "#fbbf24", glow: "#f59e0b" },
  speaking: { primary: "#8b5cf6", secondary: "#7c3aed", accent: "#a78bfa", glow: "#8b5cf6" },
  error: { primary: "#ef4444", secondary: "#dc2626", accent: "#f87171", glow: "#ef4444" },
};

export function YazzAssistantOrb({ state, size = 240 }: { state: OrbState; size?: number }) {
  const colors = COLORS[state];

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* ═══ Halo lumineux (toujours visible, plus intense en listening) ═══ */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 1.1,
          height: size * 1.1,
          background: `radial-gradient(circle, ${colors.glow}30 0%, ${colors.glow}10 40%, transparent 70%)`,
        }}
        animate={
          state === "listening"
            ? { scale: [1, 1.25, 1], opacity: [0.4, 0.9, 0.4] }
            : state === "thinking"
            ? { rotate: 360, opacity: 0.5 }
            : state === "speaking"
            ? { scale: [1, 1.15, 1], opacity: [0.3, 0.7, 0.3] }
            : { scale: [1, 1.06, 1], opacity: [0.3, 0.45, 0.3] }
        }
        transition={
          state === "thinking"
            ? { duration: 4, repeat: Infinity, ease: "linear" }
            : state === "listening"
            ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
            : { duration: state === "speaking" ? 0.6 : 3.5, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* ═══ Vagues concentriques pendant l'écoute (5 vagues, plus larges) ═══ */}
      {state === "listening" && (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                border: `2px solid ${colors.accent}`,
                width: size * 0.5,
                height: size * 0.5,
              }}
              animate={{
                scale: [0.5, 1.5],
                opacity: [0.7, 0],
                borderWidth: [3, 0.5],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: i * 0.4,
                ease: "easeOut",
              }}
            />
          ))}
        </>
      )}

      {/* ═══ Particules flottantes pendant l'écoute (8 points qui orbitent doucement) ═══ */}
      {state === "listening" && (
        <motion.div
          className="absolute"
          style={{ width: size, height: size }}
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * 360) / 8;
            const radius = size * 0.42;
            return (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: `radial-gradient(circle, #fff, ${colors.accent})`,
                  boxShadow: `0 0 8px ${colors.accent}`,
                  left: "50%",
                  top: "50%",
                  marginLeft: -4,
                  marginTop: -4,
                  transform: `rotate(${angle}deg) translateX(${radius}px)`,
                }}
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            );
          })}
        </motion.div>
      )}

      {/* ═══ Particules orbitales pour thinking (8 points qui tournent plus vite) ═══ */}
      {state === "thinking" && (
        <motion.div
          className="absolute"
          style={{ width: size, height: size }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * 360) / 8;
            const radius = size * 0.4;
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: `radial-gradient(circle, #fff, ${colors.accent})`,
                  boxShadow: `0 0 6px ${colors.accent}`,
                  opacity: 0.8,
                  left: "50%",
                  top: "50%",
                  transform: `rotate(${angle}deg) translateX(${radius}px)`,
                  marginLeft: -3.5,
                  marginTop: -3.5,
                }}
              />
            );
          })}
        </motion.div>
      )}

      {/* ═══ Equalizer bars pendant speaking ═══ */}
      {state === "speaking" && (
        <div className="absolute flex items-center justify-center gap-1" style={{ height: size * 0.3 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: 4,
                background: `linear-gradient(to top, ${colors.secondary}, ${colors.accent})`,
                boxShadow: `0 0 6px ${colors.accent}80`,
              }}
              animate={{
                height: [
                  `${size * 0.08}px`,
                  `${size * 0.15 + Math.random() * size * 0.1}px`,
                  `${size * 0.08}px`,
                ],
              }}
              transition={{
                duration: 0.3 + Math.random() * 0.2,
                repeat: Infinity,
                delay: i * 0.06,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}

      {/* ═══ Cercle central (la sphère) ═══ */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: size * 0.5,
          height: size * 0.5,
          background: `radial-gradient(circle at 35% 30%, ${colors.accent}, ${colors.secondary} 50%, ${colors.primary})`,
          boxShadow: `0 0 ${state === "listening" ? 40 : 25}px ${colors.glow}${state === "listening" ? "80" : "50"}, inset 0 0 20px ${colors.glow}40`,
        }}
        animate={
          state === "speaking"
            ? { scale: [1, 1.08, 0.95, 1.06, 1] }
            : state === "listening"
            ? { scale: [1, 1.06, 1] }
            : state === "idle"
            ? { scale: [1, 1.03, 1] }
            : { scale: 1 }
        }
        transition={{
          duration: state === "speaking" ? 0.5 : state === "listening" ? 1.8 : 3.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* reflet lumineux intérieur (effet 3D) */}
        <div
          className="absolute rounded-full"
          style={{
            width: "30%",
            height: "30%",
            top: "15%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(255,255,255,0.6), transparent 70%)",
            filter: "blur(3px)",
          }}
        />
      </motion.div>
    </div>
  );
}
