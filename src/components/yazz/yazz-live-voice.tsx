"use client";

/**
 * Conversation vocale en direct (bêta), plein écran, à la manière des
 * assistants vocaux grand public : une sphère qui réagit à la voix, un état
 * court et clair, trois boutons (micro, raccrocher, sous-titres).
 *
 * - La sphère suit le son réel : la voix de Yazz quand il parle, ta voix
 *   quand il écoute ; elle tourne doucement quand il cherche une info.
 * - Sous-titres masqués par défaut (bouton « CC »).
 * - Fin de l'appel → l'écran se ferme et on revient où l'on était.
 *
 * Logique de connexion et de son : src/hooks/use-yazz-live.ts.
 */
import { useEffect, useRef, useState } from "react";
import { Captions, Loader2, Mic, MicOff, PhoneOff, X } from "lucide-react";
import { useYazzLive, type AgentState, type LiveStatus } from "@/hooks/use-yazz-live";

type Mode = "connecting" | "reconnecting" | "listening" | "thinking" | "speaking" | "muted" | "error" | "idle";

function modeOf(status: LiveStatus, agent: AgentState, muted: boolean, reconnecting: boolean): Mode {
  if (status === "error") return "error";
  if (status === "idle" || status === "ended") return "idle";
  if (status === "connecting" || agent === "initializing") return "connecting";
  if (reconnecting) return "reconnecting";
  if (agent === "speaking") return "speaking";
  if (agent === "thinking") return "thinking";
  return muted ? "muted" : "listening";
}

const LABEL: Record<Mode, string> = {
  idle: "Parle avec Yazz",
  connecting: "Connexion…",
  reconnecting: "Connexion instable…",
  listening: "Je t'écoute",
  thinking: "Je cherche…",
  speaking: "",
  muted: "Micro coupé",
  error: "",
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Sphère animée par le son (60 images/s, sans re-rendu React). */
function VoiceOrb({ mode, getLevels }: { mode: Mode; getLevels: () => { agent: number; user: number } }) {
  const coreRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = (t: number) => {
      const m = modeRef.current;
      const { agent, user } = getLevels();
      let target = 0;
      if (m === "speaking") target = Math.min(1, agent * 5.5);
      else if (m === "listening") target = Math.min(1, user * 4);
      // Montée rapide, descente douce
      level += (target - level) * (target > level ? 0.45 : 0.12);
      // Respiration lente quand rien ne bouge
      const breathe = m === "connecting" || m === "reconnecting" || m === "idle" ? Math.sin(t / 650) * 0.035
        : m === "thinking" ? Math.sin(t / 420) * 0.02 : Math.sin(t / 1400) * 0.012;
      const base = m === "thinking" ? 0.9 : m === "muted" ? 0.88 : 1;
      const amp = m === "speaking" ? 0.32 : 0.18;
      const scale = base + breathe + level * amp;
      if (coreRef.current) coreRef.current.style.transform = `scale(${scale.toFixed(4)})`;
      if (glowRef.current) {
        glowRef.current.style.transform = `scale(${(1 + level * 0.55 + breathe).toFixed(4)})`;
        glowRef.current.style.opacity = String((m === "muted" ? 0.25 : 0.45 + level * 0.55).toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevels]);

  const dim = mode === "muted" || mode === "error" || mode === "reconnecting";
  return (
    <div className="relative flex h-[min(64vw,300px)] w-[min(64vw,300px)] items-center justify-center">
      {/* Halo */}
      <div
        ref={glowRef}
        className="absolute inset-[-18%] rounded-full blur-3xl will-change-transform"
        style={{ background: dim ? "radial-gradient(circle, #64748b 0%, transparent 65%)" : "radial-gradient(circle, #3d5afe 0%, #2b44ee55 40%, transparent 68%)" }}
      />
      {/* Anneau « je cherche » */}
      {mode === "thinking" && (
        <div
          className="absolute inset-[-6%] rounded-full yazz-live-spin"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, #8fa4ff 70deg, transparent 140deg)",
            WebkitMask: "radial-gradient(circle, transparent 62%, #000 63%, #000 66%, transparent 67%)",
            mask: "radial-gradient(circle, transparent 62%, #000 63%, #000 66%, transparent 67%)",
          }}
        />
      )}
      {/* Sphère */}
      <div
        ref={coreRef}
        className="relative h-full w-full rounded-full will-change-transform transition-[filter] duration-500"
        style={{
          background: dim
            ? "radial-gradient(circle at 34% 28%, #cbd5e1 0%, #64748b 45%, #1e293b 100%)"
            : "radial-gradient(circle at 34% 28%, #c9d4ff 0%, #6f86ff 22%, #2b44ee 52%, #1a2bb8 78%, #0c1563 100%)",
          boxShadow: dim ? "none" : "0 0 60px 6px #2b44ee66, inset -18px -24px 60px #050a3a99, inset 10px 12px 40px #ffffff22",
        }}
      >
        <div className="absolute left-[18%] top-[12%] h-[30%] w-[38%] rounded-full bg-white/25 blur-xl" />
      </div>
    </div>
  );
}

export function YazzLiveVoice({ onClose, autoStart = true }: { onClose: () => void; autoStart?: boolean }) {
  const live = useYazzLive();
  const { status, agentState, error, lines, cards, muted, secondsLeft, confirming, reconnecting } = live;
  const [captions, setCaptions] = useState(false);
  const startedRef = useRef(false);
  const wasLiveRef = useRef(false);

  // Démarrage immédiat (ouvert par un clic : son et micro autorisés)
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void live.start();
    }
  }, [autoStart, live]);

  // Fin de l'appel (raccroché, temps écoulé, agent parti) → on ferme
  useEffect(() => {
    if (status === "live") wasLiveRef.current = true;
    if (status === "ended" && wasLiveRef.current) onClose();
  }, [status, onClose]);

  // Bloque le défilement de la page derrière
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const mode = modeOf(status, agentState, muted, reconnecting);
  const pending = cards.filter((c) => !c.resolved);
  const last = [...lines].reverse().find((l) => l.text.trim());
  const active = status === "live" || status === "connecting";

  const hangUp = async () => {
    await live.stop();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex h-[var(--yazz-vh,100vh)] flex-col overflow-hidden text-white"
      style={{ background: "radial-gradient(120% 80% at 50% 30%, #16206b 0%, #0a0f33 45%, #04050f 100%)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Conversation en direct avec Yazz"
    >
      {/* Haut : titre + fermer */}
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <span className="font-outfit text-base font-semibold tracking-wide">Yazz</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-inter text-[10px] font-semibold uppercase tracking-wider text-white/70">Bêta</span>
        </div>
        <div className="flex items-center gap-3">
          {status === "live" && secondsLeft !== null && secondsLeft <= 60 && (
            <span className="font-inter text-xs tabular-nums text-amber-300">Encore {mmss(secondsLeft)}</span>
          )}
          <button
            onClick={() => void hangUp()}
            aria-label="Fermer"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Centre : sphère + état */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <VoiceOrb mode={mode} getLevels={live.getLevels} />
        <div className="flex min-h-[3.5rem] flex-col items-center gap-3 text-center">
          {status === "error" ? (
            <>
              <p className="max-w-xs font-inter text-[15px] text-white/85">{error || "Connexion impossible."}</p>
              <button
                onClick={() => void live.start()}
                className="rounded-full bg-white px-5 py-2 font-inter text-sm font-semibold text-[#0a0f33]"
              >
                Réessayer
              </button>
            </>
          ) : status === "idle" ? (
            <button
              onClick={() => void live.start()}
              className="rounded-full bg-white px-6 py-3 font-inter text-sm font-semibold text-[#0a0f33] shadow-lg"
            >
              Démarrer la conversation
            </button>
          ) : (
            <p className="flex items-center gap-2 font-inter text-[15px] font-medium text-white/75" aria-live="polite">
              {(mode === "connecting" || mode === "reconnecting") && <Loader2 className="h-4 w-4 animate-spin" />}
              {LABEL[mode]}
            </p>
          )}
        </div>
      </div>

      {/* Sous-titres (facultatifs) */}
      {captions && last && status === "live" && (
        <div className="mx-auto mb-4 w-full max-w-md px-6 text-center">
          <p className={`font-inter text-[17px] leading-snug ${last.role === "user" ? "text-white/55 italic" : "text-white"}`}>
            {last.text.length > 160 ? `…${last.text.slice(-160)}` : last.text}
          </p>
        </div>
      )}

      {/* Bas : contrôles */}
      {active && (
        <div className="flex items-end justify-center gap-8 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => void live.toggleMute()}
              disabled={status !== "live"}
              aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
              className={`grid h-16 w-16 place-items-center rounded-full transition-colors disabled:opacity-40 ${muted ? "bg-white text-[#0a0f33]" : "bg-white/12 text-white hover:bg-white/20"}`}
              style={muted ? undefined : { backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <span className="font-inter text-[11px] text-white/50">{muted ? "Micro coupé" : "Micro"}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => void hangUp()}
              aria-label="Raccrocher"
              className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#e5383b] text-white shadow-lg shadow-red-900/40 hover:bg-[#d62f32]"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="font-inter text-[11px] text-white/50">Raccrocher</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setCaptions((c) => !c)}
              aria-label={captions ? "Masquer les sous-titres" : "Afficher les sous-titres"}
              aria-pressed={captions}
              className={`grid h-16 w-16 place-items-center rounded-full transition-colors ${captions ? "bg-white text-[#0a0f33]" : "text-white hover:bg-white/20"}`}
              style={captions ? undefined : { backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Captions className="h-6 w-6" />
            </button>
            <span className="font-inter text-[11px] text-white/50">Sous-titres</span>
          </div>
        </div>
      )}

      {/* Carte de confirmation (feuille du bas) */}
      {pending.map((card) => (
        <div key={card.card_id} className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-[#0a0f33] shadow-2xl">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/10" />
          <p className="font-outfit text-base font-bold">{card.title}</p>
          {card.summary && <p className="mt-1 font-inter text-[13px] text-black/60">{card.summary}</p>}
          <div className="mt-5 flex gap-3">
            {(card.actions?.length ? card.actions : [{ label: "Annuler", action: "cancel" }, { label: "Confirmer", action: "confirm" }]).map((a) => (
              <button
                key={a.action}
                disabled={confirming !== null}
                onClick={() => void live.respondToCard(card, a.action === "confirm" ? "confirm" : "cancel")}
                className={a.action === "confirm"
                  ? "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#2b44ee] py-3 font-inter text-sm font-semibold text-white disabled:opacity-60"
                  : "flex-1 rounded-2xl bg-black/5 py-3 font-inter text-sm font-semibold text-[#0a0f33] disabled:opacity-60"}
              >
                {confirming === card.card_id && a.action === "confirm" && <Loader2 className="h-4 w-4 animate-spin" />}
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <style jsx>{`
        :global(.yazz-live-spin) { animation: yazz-live-spin 1.6s linear infinite; }
        @keyframes yazz-live-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
