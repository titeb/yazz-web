"use client";

/**
 * Conversation vocale en direct avec l'assistant (bêta, page de test non
 * listée dans le menu). Voir src/hooks/use-yazz-live.ts.
 */
import { useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, Phone, Loader2 } from "lucide-react";
import { YazzAssistantOrb } from "@/components/yazz/yazz-assistant-orb";
import { useYazzLive, type AgentState, type LiveStatus } from "@/hooks/use-yazz-live";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

function orbState(status: LiveStatus, agent: AgentState): OrbState {
  if (status === "error") return "error";
  if (status === "connecting") return "thinking";
  if (status !== "live") return "idle";
  if (agent === "speaking") return "speaking";
  if (agent === "thinking" || agent === "initializing") return "thinking";
  return "listening";
}

function label(status: LiveStatus, agent: AgentState, muted: boolean): string {
  if (status === "connecting") return "Connexion…";
  if (status === "ended") return "Conversation terminée";
  if (status === "error") return "Connexion impossible";
  if (status !== "live") return "Parle avec Yazz, comme au téléphone";
  if (agent === "initializing") return "Yazz arrive…";
  if (agent === "speaking") return "Yazz parle…";
  if (agent === "thinking") return "Yazz réfléchit…";
  return muted ? "Micro coupé" : "Je t'écoute…";
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function AssistantLivePage() {
  const live = useYazzLive();
  const { status, agentState, error, lines, cards, muted, secondsLeft, confirming } = live;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const active = status === "live" || status === "connecting";
  const pending = cards.filter((c) => !c.resolved);

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-4 overflow-hidden px-4 py-6">
      <div className="flex items-center gap-2">
        <h1 className="font-outfit text-lg font-bold text-yazz-text-dark">Conversation en direct</h1>
        <span className="rounded-full bg-yazz-primary/10 px-2 py-0.5 font-inter text-[11px] font-semibold text-yazz-primary">Bêta</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <YazzAssistantOrb state={orbState(status, agentState)} size={190} />
        <p className="font-inter text-sm font-medium text-yazz-text-muted" aria-live="polite">
          {label(status, agentState, muted)}
        </p>
        {status === "live" && secondsLeft !== null && (
          <p className="font-inter text-xs text-yazz-text-muted">Temps restant : {mmss(secondsLeft)}</p>
        )}
        {error && <p className="max-w-sm text-center font-inter text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center gap-4">
        {active ? (
          <>
            <button
              onClick={() => void live.toggleMute()}
              disabled={status !== "live"}
              aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
              className="grid h-14 w-14 place-items-center rounded-full border border-yazz-border-light bg-yazz-surface text-yazz-text-dark shadow-sm disabled:opacity-50"
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <button
              onClick={() => void live.stop()}
              aria-label="Terminer la conversation"
              className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          </>
        ) : (
          <button
            onClick={() => void live.start()}
            className="flex items-center gap-2 rounded-full bg-[#2b44ee] px-6 py-3.5 font-inter text-sm font-semibold text-white shadow-lg hover:bg-[#1d34d4]"
          >
            <Phone className="h-5 w-5" />
            {status === "ended" || status === "error" ? "Recommencer" : "Démarrer la conversation"}
          </button>
        )}
      </div>

      {pending.map((card) => (
        <div key={card.card_id} className="w-full max-w-md rounded-yazz-xl border border-yazz-border-light bg-yazz-surface p-4 yazz-shadow-high">
          <p className="font-outfit text-sm font-bold text-yazz-text-dark">{card.title}</p>
          {card.summary && <p className="mt-1 font-inter text-[13px] text-yazz-text-muted">{card.summary}</p>}
          <div className="mt-3 flex gap-2">
            {(card.actions?.length ? card.actions : [{ label: "Confirmer", action: "confirm" }, { label: "Annuler", action: "cancel" }]).map((a) => (
              <button
                key={a.action}
                disabled={confirming !== null}
                onClick={() => void live.respondToCard(card, a.action === "confirm" ? "confirm" : "cancel")}
                className={a.action === "confirm"
                  ? "flex flex-1 items-center justify-center gap-2 rounded-yazz-md bg-[#2b44ee] py-2 font-inter text-sm font-semibold text-white disabled:opacity-60"
                  : "flex-1 rounded-yazz-md border border-yazz-border-light py-2 font-inter text-sm font-semibold text-yazz-text-dark disabled:opacity-60"}
              >
                {confirming === card.card_id && a.action === "confirm" && <Loader2 className="h-4 w-4 animate-spin" />}
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div ref={scrollRef} className="min-h-0 w-full max-w-md flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 pb-2">
          {lines.map((l) => (
            <div
              key={l.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 font-inter text-[13px] ${l.role === "user"
                ? "self-end bg-[#2b44ee] text-white"
                : "self-start bg-yazz-surface text-yazz-text-dark border border-yazz-border-light"} ${l.final ? "" : "opacity-70"}`}
            >
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
