"use client";

/**
 * Conversation vocale en direct (bêta), plein écran, à la manière des
 * assistants vocaux grand public : une sphère qui réagit à la voix, un état
 * court et clair, trois boutons (micro, raccrocher, sous-titres).
 *
 * - Sphère lumineuse et dégradés de fond animés par la voix (volume et
 *   intonation) : voir yazz-voice-visual.tsx (rendu WebGL).
 * - Mise en page en colonne, sans chevauchement possible : emplacement de
 *   la sphère (filaments compris) → état → zone des sous-titres (hauteur
 *   fixe : un long texte défile vers la fin avec un fondu en haut, sans
 *   rien pousser). L'ensemble est centré entre le haut et les boutons et
 *   s'adapte à la hauteur (téléphone, petit téléphone, paysage, tablette,
 *   ordinateur).
 * - Sous-titres affichés par défaut (bouton pour les masquer).
 * - Fin de l'appel → l'écran se ferme et on revient où l'on était.
 *
 * Logique de connexion et de son : src/hooks/use-yazz-live.ts.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Captions, Loader2, Mic, MicOff, PhoneOff, X } from "lucide-react";
import { useYazzLive, type AgentState, type LiveStatus } from "@/hooks/use-yazz-live";
import { YazzVoiceVisual } from "./yazz-voice-visual";

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

// Côté de l'emplacement de la sphère (filaments compris) : limité par la
// largeur, par la hauteur visible de l'écran et par une taille maximale.
const ORB_SLOT = "min(78vw, calc(var(--yazz-vh, 100vh) * 0.36), 25rem)";

// Classes écrites en toutes lettres (Tailwind ne lit pas les variables).
// [@media(max-height:520px)] = écran peu haut (paysage) : version compacte.
// Zone des sous-titres : 4 lignes (3 si l'écran est peu haut, 2 en paysage)
const CAPTION_ZONE = `text-[17px] leading-[1.4] md:text-[19px] h-[5.6em] [@media(min-height:521px)_and_(max-height:700px)]:h-[4.2em] [@media(max-height:520px)]:h-[2.8em]`;

export function YazzLiveVoice({ onClose, autoStart = true }: { onClose: () => void; autoStart?: boolean }) {
  const live = useYazzLive();
  const { status, agentState, error, lines, cards, muted, secondsLeft, confirming, reconnecting } = live;
  const [captions, setCaptions] = useState(true);
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
  const orbRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const caption = captions && status === "live" && last ? last : null;

  // Sous-titre long : on montre toujours la fin, avec un fondu en haut
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight > el.clientHeight + 2;
    const mask = overflowing ? "linear-gradient(to bottom, transparent 0, #000 1.4em)" : "none";
    el.style.setProperty("mask-image", mask);
    el.style.setProperty("-webkit-mask-image", mask);
    el.scrollTo({ top: el.scrollHeight, behavior: overflowing ? "smooth" : "auto" });
  }, [caption?.text]);

  const hangUp = async () => {
    await live.stop();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex h-[var(--yazz-vh,100vh)] flex-col overflow-hidden bg-[#03040e] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Conversation en direct avec Yazz"
    >
      {/* Fond animé (sphère + dégradés), derrière tout le reste */}
      <YazzVoiceVisual mode={mode} getLevels={live.getLevels} anchorRef={orbRef} />

      {/* Haut : titre + fermer */}
      <div className={`relative z-10 flex shrink-0 items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] [@media(max-height:520px)]:pt-[max(0.5rem,env(safe-area-inset-top))]`}>
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

      {/* Centre : emplacement de la sphère → état → sous-titres (rien ne se chevauche) */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-2">
        <div ref={orbRef} aria-hidden="true" className="shrink-0" style={{ width: ORB_SLOT, height: ORB_SLOT }} />

        <div className="flex min-h-[1.75rem] shrink-0 items-center justify-center text-center" aria-live="polite">
          {status === "error" ? (
            <p className="max-w-xs font-inter text-[15px] text-white/85">{error || "Connexion impossible."}</p>
          ) : (
            <p className="flex items-center gap-2 font-inter text-[15px] font-medium text-white/75">
              {(mode === "connecting" || mode === "reconnecting") && <Loader2 className="h-4 w-4 animate-spin" />}
              {LABEL[mode]}
            </p>
          )}
        </div>

        {/* Zone de hauteur fixe : sous-titres en direct, ou bouton d'action */}
        <div className={`mt-3 w-full max-w-md shrink-0 text-center md:max-w-xl ${CAPTION_ZONE}`}>
          {status === "error" || status === "idle" ? (
            <button
              onClick={() => void live.start()}
              className="rounded-full bg-white px-6 py-2.5 font-inter text-sm font-semibold text-[#0a0f33] shadow-lg"
            >
              {status === "error" ? "Réessayer" : "Démarrer la conversation"}
            </button>
          ) : (
            <div ref={captionRef} className="h-full overflow-hidden">
              {caption && (
                <p className={`font-inter ${caption.role === "user" ? "italic text-white/55" : "text-white"}`}>
                  {caption.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bas : contrôles */}
      {active && (
        <div className={`relative z-10 flex shrink-0 items-end justify-center gap-8 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 [@media(max-height:520px)]:gap-6 [@media(max-height:520px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] [@media(max-height:520px)]:pt-0`}>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => void live.toggleMute()}
              disabled={status !== "live"}
              aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
              className={`grid h-16 w-16 place-items-center rounded-full transition-colors disabled:opacity-40 [@media(max-height:520px)]:h-12 [@media(max-height:520px)]:w-12 ${muted ? "bg-white text-[#0a0f33]" : "bg-white/12 text-white hover:bg-white/20"}`}
              style={muted ? undefined : { backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <span className={`font-inter text-[11px] text-white/50 [@media(max-height:520px)]:hidden`}>{muted ? "Micro coupé" : "Micro"}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => void hangUp()}
              aria-label="Raccrocher"
              className={`grid h-[72px] w-[72px] place-items-center rounded-full bg-[#e5383b] text-white shadow-lg shadow-red-900/40 hover:bg-[#d62f32] [@media(max-height:520px)]:h-14 [@media(max-height:520px)]:w-14`}
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className={`font-inter text-[11px] text-white/50 [@media(max-height:520px)]:hidden`}>Raccrocher</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setCaptions((c) => !c)}
              aria-label={captions ? "Masquer les sous-titres" : "Afficher les sous-titres"}
              aria-pressed={captions}
              className={`grid h-16 w-16 place-items-center rounded-full transition-colors [@media(max-height:520px)]:h-12 [@media(max-height:520px)]:w-12 ${captions ? "bg-white text-[#0a0f33]" : "text-white hover:bg-white/20"}`}
              style={captions ? undefined : { backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Captions className="h-6 w-6" />
            </button>
            <span className={`font-inter text-[11px] text-white/50 [@media(max-height:520px)]:hidden`}>Sous-titres</span>
          </div>
        </div>
      )}

      {/* Carte de confirmation (feuille du bas) */}
      {pending.map((card) => (
        <div key={card.card_id} className="absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-[#0a0f33] shadow-2xl">
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

    </div>
  );
}
