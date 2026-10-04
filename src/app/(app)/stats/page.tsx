"use client";

import { useEffect, useRef, useState } from "react";
import { useUserStats } from "@/hooks/use-user-stats";
import { useUserAlerts } from "@/hooks/use-user-alerts";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  Car,
  Navigation,
  Bell,
  Wallet,
  Database,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// Hooks — animations pures CSS + React (pas de Framer Motion)
// ============================================================

/** Détecte le prefers-reduced-motion de l'utilisateur. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Anime un nombre de 0 → target avec easing ease-out-expo.
 * - Respecte prefers-reduced-motion via `disabled` (passé par l'appelant).
 * - Au changement de target (realtime), anime depuis la valeur courante
 *   (pas de flash vers 0).
 * - Aucun setState synchrone ni accès ref pendant le render (lint-safe).
 */
function useCountUp(
  target: number,
  opts: { duration?: number; start?: boolean; disabled?: boolean } = {}
): number {
  const { duration = 1100, start = true, disabled = false } = opts;
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const t0 = useRef<number | null>(null);
  // Ref miroir de `value` : permet de lire la valeur courante dans l'effect
  // sans l'ajouter aux deps (évite les re-renders en cascade).
  const valueRef = useRef(0);

  const shouldAnimate = start && !disabled;

  // Tient valueRef à jour (mutation de ref dans un effect — autorisé).
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!shouldAnimate) return; // pas d'animation → valeur dérivée dans le return

    const from = valueRef.current;
    const to = target;
    t0.current = null;
    const easeOutExpo = (t: number) =>
      t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);

    const tick = (now: number) => {
      if (t0.current === null) t0.current = now;
      const p = Math.min((now - t0.current) / duration, 1);
      const next = Math.round(from + (to - from) * easeOutExpo(p));
      setValue(next); // setState asynchrone (callback RAF) — OK
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, shouldAnimate]);

  // Quand on n'anime pas, on renvoie directement la cible (dérivé, pas de setState).
  return shouldAnimate ? value : target;
}

/** Déclenche une fois quand l'élément entre dans le viewport. */
function useInView<T extends HTMLElement = HTMLDivElement>(
  opts?: IntersectionObserverInit
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Pas de support IO → on défere via RAF (pas de setState synchrone)
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true); // callback asynchrone — OK
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px", ...opts }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, inView };
}

// ============================================================
// Constantes & helpers
// ============================================================

type AccentKey = "primary" | "success" | "warning" | "info" | "error";

const ACCENT_VAR: Record<AccentKey, string> = {
  primary: "var(--color-yazz-primary)",
  success: "var(--color-yazz-success)",
  warning: "var(--color-yazz-warning)",
  info: "var(--color-yazz-info)",
  error: "var(--color-yazz-error)",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

// Cast helper pour les custom properties CSS en inline style
const cssVars = (vars: Record<string, string | number>) =>
  ({ ...vars } as React.CSSProperties);

// ============================================================
// Sub-components
// ============================================================

/** Jauge circulaire SVG animée (transition sur stroke-dashoffset). */
function CircularGauge({
  ratio,
  color,
  size = 64,
  stroke = 6,
  start,
  children,
}: {
  ratio: number;
  color: string;
  size?: number;
  stroke?: number;
  start: boolean;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  const offset = start ? c * (1 - clamped) : c;

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-yazz-border-light)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition:
              "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}

/** Mini barre horizontale animée (transform: scaleX) pour les cartes stats. */
function MiniBar({
  ratio,
  color,
  start,
  delay = 0,
}: {
  ratio: number;
  color: string;
  start: boolean;
  delay?: number;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-yazz-border-light/60">
      <div
        className="h-full rounded-full"
        style={{
          background: color,
          transform: start ? `scaleX(${clamped})` : "scaleX(0)",
          transformOrigin: "left center",
          transition: `transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        }}
      />
    </div>
  );
}

/** Carte statistique animée avec entrance stagger + hover lift. */
function AnimatedStatCard({
  index,
  label,
  icon: Icon,
  accent,
  displayValue,
  delta,
  deltaTone,
  viz,
  start,
}: {
  index: number;
  label: string;
  icon: LucideIcon;
  accent: AccentKey;
  displayValue: string;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  viz?: React.ReactNode;
  start: boolean;
}) {
  return (
    <div
      className={`yazz-stagger-item group relative overflow-hidden rounded-yazz-lg border border-yazz-border-light bg-yazz-surface p-5 yazz-shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:yazz-shadow-elevated hover:border-yazz-border-medium ${
        start ? "" : "opacity-0"
      }`}
      style={cssVars({ "--i": index })}
    >
      {/* Barre d'accent à gauche */}
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: ACCENT_VAR[accent] }}
      />

      <div className="flex items-start justify-between gap-2">
        <div
          className="grid h-11 w-11 place-items-center rounded-yazz-lg"
          style={{
            background: `color-mix(in srgb, ${ACCENT_VAR[accent]} 12%, transparent)`,
          }}
        >
          <Icon
            className="h-[22px] w-[22px]"
            style={{ color: ACCENT_VAR[accent] }}
          />
        </div>

        {delta && (
          <span
            className={`font-inter flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
              deltaTone === "up"
                ? "bg-yazz-success/10 text-yazz-success"
                : deltaTone === "down"
                ? "bg-yazz-error/10 text-yazz-error"
                : "bg-yazz-accent text-yazz-text-muted"
            }`}
          >
            {delta}
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="font-inter text-[11px] font-medium uppercase tracking-[0.08em] text-yazz-text-caption">
          {label}
        </p>
        <p className="font-outfit mt-1 text-[26px] font-bold leading-tight tracking-[-0.02em] text-yazz-text-dark tabular-nums">
          {displayValue}
        </p>
      </div>

      {viz && <div className="mt-3">{viz}</div>}

      {/* Glow au hover */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20"
        style={{ background: ACCENT_VAR[accent] }}
      />
    </div>
  );
}

/** Skeleton shimmer pour l'état de chargement. */
function SkeletonCard({ index }: { index: number }) {
  return (
    <div
      className="yazz-stagger-item rounded-yazz-lg border border-yazz-border-light bg-yazz-surface p-5"
      style={cssVars({ "--i": index })}
    >
      <div className="flex items-start justify-between">
        <div className="yazz-shimmer h-11 w-11 rounded-yazz-lg" />
        <div className="yazz-shimmer h-5 w-16 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="yazz-shimmer h-3 w-20 rounded-full" />
        <div className="yazz-shimmer h-6 w-24 rounded-full" />
      </div>
      <div className="yazz-shimmer mt-4 h-1.5 w-full rounded-full" />
    </div>
  );
}

/** Barre verticale animée pour le mini graphique de répartition. */
function StatusBar({
  label,
  count,
  total,
  color,
  start,
  delay,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  start: boolean;
  delay: number;
}) {
  const ratio = total > 0 ? count / total : 0;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-[60px] w-11 items-end justify-center rounded-yazz-sm bg-yazz-border-light/30 p-1">
        <div
          className="w-full rounded-t-sm"
          style={{
            height: `${Math.max(4, ratio * 100)}%`,
            background: color,
            transform: start ? "scaleY(1)" : "scaleY(0)",
            transformOrigin: "bottom center",
            transition: `transform 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, opacity 0.3s ease`,
            opacity: start ? 1 : 0,
          }}
        />
      </div>
      <span className="font-outfit text-[14px] font-bold tabular-nums text-yazz-text-dark">
        {count}
      </span>
      <span className="font-inter text-[10px] text-yazz-text-caption">
        {label}
      </span>
    </div>
  );
}

// ============================================================
// Page principale
// ============================================================

export default function StatsPage() {
  const isReady = isSupabaseConfigured();
  const { stats: realStats } = useUserStats();
  const { alerts, unreadCount } = useUserAlerts(10);
  const loading = realStats.loading;

  const reduced = usePrefersReducedMotion();
  const { ref: activityRef, inView: activityInView } =
    useInView<HTMLDivElement>();
  const { ref: alertsRef, inView: alertsInView } =
    useInView<HTMLUListElement>();

  // Valeurs numériques cibles pour le count-up (réel ou mock démo)
  const nums = !isReady
    ? { totalVehicles: 8, movingVehicles: 4, activeAlerts: 3, creditBalance: 12480 }
    : {
        totalVehicles: realStats.totalVehicles,
        movingVehicles: realStats.movingVehicles,
        activeAlerts: realStats.activeAlerts,
        creditBalance: realStats.creditBalance,
      };

  // Les animations démarrent dès que les données sont prêtes (ou en démo).
  const showReal = isReady ? !loading : true;
  const startCount = showReal;

  // Count-ups (hooks en haut — pas dans le JSX)
  const totalUp = useCountUp(nums.totalVehicles, {
    start: startCount,
    disabled: reduced,
  });
  const movingUp = useCountUp(nums.movingVehicles, {
    start: startCount,
    disabled: reduced,
  });
  const alertsUp = useCountUp(nums.activeAlerts, {
    start: startCount,
    disabled: reduced,
  });
  const creditUp = useCountUp(nums.creditBalance, {
    start: startCount,
    disabled: reduced,
    duration: 1300,
  });
  const movingPctUp = useCountUp(
    nums.totalVehicles > 0
      ? Math.round((nums.movingVehicles / nums.totalVehicles) * 100)
      : 0,
    { start: activityInView, disabled: reduced, duration: 1000 }
  );

  // Données dérivées
  const total = nums.totalVehicles;
  const moving = nums.movingVehicles;
  const inactive = Math.max(0, total - moving);
  const movingRatio = total > 0 ? moving / total : 0;
  const movingPct = Math.round(movingRatio * 100);

  // Crédit — ratio pour la jauge (jours / 30, max 1)
  const creditActive = isReady ? realStats.creditIsActive : true;
  const daysUntil = isReady ? realStats.daysUntilExpiry : 5;
  const creditCurrency = (isReady ? realStats.creditCurrency : "CDF") || "CDF";
  const creditRatio = !creditActive
    ? 0
    : daysUntil === null
    ? 1
    : Math.min(1, daysUntil / 30);
  const creditGaugeColor = !creditActive
    ? "var(--color-yazz-text-caption)"
    : daysUntil !== null && daysUntil <= 3
    ? "var(--color-yazz-error)"
    : daysUntil !== null && daysUntil <= 7
    ? "var(--color-yazz-warning)"
    : "var(--color-yazz-info)";
  const creditGaugeLabel = !creditActive
    ? "—"
    : daysUntil === null
    ? "∞"
    : `${daysUntil}j`;

  const creditAccent: AccentKey =
    !creditActive || (daysUntil !== null && daysUntil <= 7) ? "warning" : "info";
  const alertsAccent: AccentKey = alertsUp > 0 ? "warning" : "success";

  return (
    <div className="h-full overflow-y-auto">
      <style jsx global>{`
        /* === Entrée stagger (cartes, alertes, blocs) === */
        @keyframes yazz-stagger-in {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .yazz-stagger-item {
          opacity: 0;
          animation: yazz-stagger-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: calc(var(--i, 0) * 90ms);
          will-change: transform, opacity;
        }

        /* === Dot "live" pulsant === */
        @keyframes yazz-live-pulse {
          0% {
            box-shadow: 0 0 0 0
              color-mix(in srgb, currentColor 55%, transparent);
          }
          70% {
            box-shadow: 0 0 0 6px transparent;
          }
          100% {
            box-shadow: 0 0 0 0 transparent;
          }
        }
        .yazz-live-pulse {
          animation: yazz-live-pulse 1.8s ease-out infinite;
        }

        /* === Header fade-in === */
        @keyframes yazz-fade-block-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .yazz-fade-block {
          opacity: 0;
          animation: yazz-fade-block-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: calc(var(--i, 0) * 90ms);
        }

        /* === Respect des préférences d'accessibilité === */
        @media (prefers-reduced-motion: reduce) {
          .yazz-stagger-item,
          .yazz-fade-block,
          .yazz-live-pulse {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {/* ─── Header animé ─────────────────────────── */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="yazz-fade-block" style={cssVars({ "--i": 0 })}>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark md:text-[28px]">
              Statistiques
            </h1>
            <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
              Vue d'ensemble de votre flotte YAZZ en temps réel.
            </p>
          </div>
          {isReady && (
            <div
              className="yazz-fade-block flex items-center gap-2 rounded-full border border-yazz-success/20 bg-yazz-success/10 px-3 py-1.5"
              style={cssVars({ "--i": 1 })}
            >
              <span
                className="yazz-live-pulse h-2 w-2 rounded-full"
                style={{
                  background: "var(--color-yazz-success)",
                  color: "var(--color-yazz-success)",
                }}
              />
              <span className="font-inter text-[11px] font-bold text-yazz-success">
                En direct
              </span>
            </div>
          )}
        </div>

        {/* ─── Bannière mode démo ────────────────────── */}
        {!isReady && (
          <div
            className="yazz-fade-block mb-5 rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4"
            style={cssVars({ "--i": 2 })}
          >
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 shrink-0 text-yazz-warning" />
              <div>
                <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
                  Mode démo — Supabase non configuré
                </p>
                <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                  Les chiffres ci-dessous sont fictifs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Cartes statistiques (stagger + count-up) ─ */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isReady && loading
            ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} index={i} />)
            : [
                {
                  id: "total",
                  label: "Total capteurs",
                  icon: Car,
                  accent: "primary" as const,
                  displayValue: String(totalUp),
                  delta:
                    total > 0 ? `${total} actif${total > 1 ? "s" : ""}` : "—",
                  deltaTone: "flat" as const,
                  viz: (
                    <MiniBar
                      ratio={1}
                      color="var(--color-yazz-primary)"
                      start={startCount}
                      delay={200}
                    />
                  ),
                },
                {
                  id: "moving",
                  label: "En mouvement",
                  icon: Navigation,
                  accent: "success" as const,
                  displayValue: String(movingUp),
                  delta: total > 0 ? `${movingPct}% actif` : "—",
                  deltaTone: "up" as const,
                  viz: (
                    <MiniBar
                      ratio={movingRatio}
                      color="var(--color-yazz-success)"
                      start={startCount}
                      delay={250}
                    />
                  ),
                },
                {
                  id: "alerts",
                  label: "Alertes actives",
                  icon: Bell,
                  accent: alertsAccent,
                  displayValue: String(alertsUp),
                  delta: alertsUp > 0 ? "non lues" : "ok",
                  deltaTone: alertsUp > 0 ? ("down" as const) : ("up" as const),
                  viz:
                    alertsUp > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="yazz-live-pulse h-2 w-2 rounded-full"
                          style={{
                            background: "var(--color-yazz-warning)",
                            color: "var(--color-yazz-warning)",
                          }}
                        />
                        <span className="font-inter text-[11px] font-medium text-yazz-text-muted">
                          À traiter
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: "var(--color-yazz-success)" }}
                        />
                        <span className="font-inter text-[11px] font-medium text-yazz-text-muted">
                          Rien à signaler
                        </span>
                      </div>
                    ),
                },
                {
                  id: "credit",
                  label: "Solde crédit",
                  icon: Wallet,
                  accent: creditAccent,
                  displayValue: creditActive
                    ? `${creditUp.toLocaleString("fr-FR")} ${creditCurrency}`
                    : "Inactif",
                  delta: !creditActive
                    ? "désactivé"
                    : daysUntil !== null
                    ? `${daysUntil}j restants`
                    : "illimité",
                  deltaTone:
                    daysUntil !== null && daysUntil <= 3
                      ? ("down" as const)
                      : ("flat" as const),
                  viz: (
                    <div className="flex items-center justify-between gap-3">
                      <CircularGauge
                        ratio={creditRatio}
                        color={creditGaugeColor}
                        start={startCount}
                        size={56}
                        stroke={5}
                      >
                        <span className="font-outfit text-[11px] font-bold text-yazz-text-dark">
                          {creditGaugeLabel}
                        </span>
                      </CircularGauge>
                      <div className="min-w-0 flex-1">
                        <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">
                          {creditActive ? "Expiration" : "Statut"}
                        </p>
                        <p className="font-outfit text-[12px] font-semibold text-yazz-text-dark">
                          {creditActive
                            ? daysUntil !== null
                              ? `${daysUntil} jours`
                              : "Sans expiration"
                            : "Crédit inactif"}
                        </p>
                      </div>
                    </div>
                  ),
                },
              ].map((c, i) => (
                <AnimatedStatCard
                  key={c.id}
                  index={i}
                  label={c.label}
                  icon={c.icon}
                  accent={c.accent}
                  displayValue={c.displayValue}
                  delta={c.delta}
                  deltaTone={c.deltaTone}
                  viz={c.viz}
                  start={startCount}
                />
              ))}
        </div>

        {/* ─── Section Activité ──────────────────────── */}
        <div
          ref={activityRef}
          className="yazz-fade-block mt-6 rounded-yazz-lg border border-yazz-border-light bg-yazz-surface p-5 yazz-shadow-soft"
          style={cssVars({ "--i": 5 })}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Activité de la flotte
            </h2>
            {isReady && (
              <span className="font-inter flex items-center gap-1.5 text-[11px] font-medium text-yazz-text-muted">
                <span
                  className="yazz-live-pulse h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--color-yazz-success)",
                    color: "var(--color-yazz-success)",
                  }}
                />
                Temps réel
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Ratio en mouvement — barre + % animé */}
            <div>
              <div className="mb-2 flex items-end justify-between">
                <span className="font-inter text-[12px] font-medium text-yazz-text-muted">
                  Taux d'activité
                </span>
                <span className="font-outfit text-[20px] font-bold tabular-nums text-yazz-text-dark">
                  {movingPctUp}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-yazz-border-light/50">
                <div
                  className="h-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--color-yazz-success), var(--color-yazz-primary))",
                    transform: activityInView
                      ? `scaleX(${movingRatio})`
                      : "scaleX(0)",
                    transformOrigin: "left center",
                    transition:
                      "transform 1.1s cubic-bezier(0.16, 1, 0.3, 1) 0.1s",
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-yazz-text-caption">
                <span className="font-inter">
                  {moving} en mouvement
                </span>
                <span className="font-inter">
                  {inactive} inactif{inactive > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Mini graphique en barres — répartition des statuts */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-inter text-[12px] font-medium text-yazz-text-muted">
                  Répartition des statuts
                </span>
                <span className="font-inter text-[11px] text-yazz-text-caption">
                  {total} capteur{total > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-end justify-center gap-6">
                <StatusBar
                  label="Mouvement"
                  count={moving}
                  total={total}
                  color="var(--color-yazz-success)"
                  start={activityInView}
                  delay={0}
                />
                <StatusBar
                  label="Inactifs"
                  count={inactive}
                  total={total}
                  color="var(--color-yazz-text-caption)"
                  start={activityInView}
                  delay={140}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Alertes récentes (stagger on view) ────── */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Alertes récentes
            </h2>
            {isReady && unreadCount > 0 && (
              <span className="font-inter rounded-full bg-yazz-error/15 px-2.5 py-1 text-[10px] font-bold text-yazz-error">
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isReady && alerts.length === 0 && (
            <div className="grid place-items-center py-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-yazz-success/10">
                <AlertTriangle className="h-5 w-5 text-yazz-success" />
              </div>
              <p className="font-outfit mt-2 text-[14px] font-semibold text-yazz-text-dark">
                Aucune alerte
              </p>
              <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
                Tout est sous contrôle.
              </p>
            </div>
          )}

          {isReady && alerts.length > 0 && (
            <ul ref={alertsRef} className="space-y-2">
              {alerts.map((a, i) => (
                <li
                  key={a.id}
                  className={`rounded-yazz-md border-l-2 bg-yazz-surface p-3 yazz-shadow-soft transition-all ${
                    a.severity === "critical"
                      ? "border-l-yazz-error"
                      : a.severity === "warning"
                      ? "border-l-yazz-warning"
                      : "border-l-yazz-info"
                  } ${
                    !a.isRead ? "ring-1 ring-yazz-primary/20" : "opacity-70"
                  } ${alertsInView ? "yazz-stagger-item" : "opacity-0"}`}
                  style={cssVars({ "--i": i })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                        {a.title}
                      </p>
                      <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                        {a.vehicleName} · {a.plate || "—"}
                      </p>
                      <p className="font-inter mt-1 text-[11px] leading-relaxed text-yazz-text-body">
                        {a.message}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-inter text-[10px] text-yazz-text-caption">
                        {timeAgo(a.createdAt)}
                      </span>
                      {!a.isRead && (
                        <span className="rounded-full bg-yazz-primary/15 px-2 py-0.5 text-[9px] font-bold text-yazz-primary">
                          Non lu
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
