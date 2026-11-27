"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientSafe } from "@/lib/supabase/client";
import {
  ArrowLeft,
  BellRing,
  Car,
  CheckCircle2,
  Eye,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Signaler un vol (SOS) — même parcours que l'app :
//   1. on explique simplement ce qui va se passer ;
//   2. on maintient le bouton ~1,5 s (pas de code à taper, pas d'erreur) ;
//   3. alerte en cours : suivi en direct, « Fausse alerte » ou « Je l'ai récupéré ».
// Le véhicule est celui d'où l'on vient (?device=…), sinon le premier actif.
// Une alerte lancée depuis l'app ou l'assistant apparaît ici en direct.
// ─────────────────────────────────────────────────────────────────────

type Phase = "loading" | "idle" | "sending" | "active";

type Device = {
  id: string;
  name: string | null;
  url_image: string | null;
  vehicle_photo: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
};

type Alert = {
  id: string;
  status: string;
  found_at?: string | null;
  spotted_count?: number | null;
};

const DEVICE_COLUMNS =
  "id, name, url_image, vehicle_photo, vehicle_color, vehicle_plate, vehicle_brand, vehicle_model";

function vehicleLabel(d: Device | null): string {
  if (!d) return "Votre véhicule";
  const parts = [d.vehicle_brand, d.vehicle_model, d.vehicle_color].filter(Boolean);
  return parts.length ? parts.join(" · ") : d.name || "Votre véhicule";
}

export default function SOSPage() {
  const router = useRouter();
  const supabase = createClientSafe();
  const [phase, setPhase] = useState<Phase>(() => (supabase ? "loading" : "idle"));
  const [device, setDevice] = useState<Device | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const loadActiveAlert = useCallback(
    async (deviceId: string) => {
      if (!supabase) return null;
      const { data } = await supabase
        .from("sos_alerts")
        .select("id, status, found_at, spotted_count")
        .eq("device_id", deviceId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      return (data?.[0] as Alert | undefined) ?? null;
    },
    [supabase]
  );

  // Véhicule + alerte déjà en cours (lancée ici, dans l'app ou par l'assistant)
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setPhase("idle");
          return;
        }
        const wanted = new URLSearchParams(window.location.search).get("device");
        const query = wanted
          ? supabase.from("user_devices").select(DEVICE_COLUMNS).eq("id", wanted)
          : supabase.from("user_devices").select(DEVICE_COLUMNS).eq("user_id", user.id).eq("is_active", true);
        const { data: devices } = await query.limit(1);
        const d = (devices?.[0] as Device | undefined) ?? null;
        if (cancelled) return;
        setDevice(d);
        const active = d ? await loadActiveAlert(d.id) : null;
        if (cancelled) return;
        setAlert(active);
        setPhase(active ? "active" : "idle");
      } catch {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, loadActiveAlert]);

  // En direct : alerte levée, retrouvée ou repérée depuis une autre interface
  useEffect(() => {
    if (!supabase || !device) return;
    const channel = supabase
      .channel(`sos-page-${device.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts", filter: `device_id=eq.${device.id}` },
        async () => {
          const active = await loadActiveAlert(device.id);
          setAlert(active);
          setPhase((p) => (p === "sending" ? p : active ? "active" : "idle"));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, device, loadActiveAlert]);

  const triggerSOS = async () => {
    if (!supabase) return;
    if (!device) {
      setError("Aucun véhicule actif. Activez un capteur d'abord.");
      return;
    }
    setPhase("sending");
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expirée. Reconnectez-vous.");

      // Position actuelle du véhicule
      const { data: position } = await supabase
        .from("last_known_positions")
        .select("latitude, longitude")
        .eq("device_id", device.id)
        .maybeSingle();

      // Photos du véhicule (jusqu'à 5)
      const { data: vehiclePhotos } = await supabase
        .from("vehicle_photos")
        .select("url, position")
        .eq("device_id", device.id)
        .order("position", { ascending: true })
        .limit(5);

      const primaryPhoto = vehiclePhotos?.[0]?.url ?? device.vehicle_photo ?? device.url_image ?? null;

      const { data: alertData, error: insertErr } = await supabase
        .from("sos_alerts")
        .insert({
          device_id: device.id,
          declared_by: user.id,
          status: "active",
          last_lat: position?.latitude ?? null,
          last_lng: position?.longitude ?? null,
          device_name: device.name ?? null,
          vehicle_photo: primaryPhoto,
          vehicle_color: device.vehicle_color ?? null,
          vehicle_plate: device.vehicle_plate ?? null,
          vehicle_brand: device.vehicle_brand ?? null,
          vehicle_model: device.vehicle_model ?? null,
          created_at: new Date().toISOString(),
        })
        .select("id, status, found_at, spotted_count")
        .single();

      if (insertErr) throw insertErr;

      // Photos figées dans l'alerte (les vigiles les voient même si elles changent ensuite)
      if (alertData?.id && vehiclePhotos && vehiclePhotos.length > 0) {
        await supabase
          .from("sos_alert_photos")
          .insert(vehiclePhotos.map((p: { url: string }, index: number) => ({ alert_id: alertData.id, url: p.url, position: index })))
          .then(({ error: e }) => e && console.warn("[SOS] photos de l'alerte :", e.message));
      }

      // Vigiles proches prévenus par le serveur (rayon, photo, une seule fois chacun)
      if (alertData?.id) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL;
        if (session?.access_token && backendUrl) {
          fetch(`${backendUrl}/api/sos/notify-vigiles`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ alertId: alertData.id }),
          }).catch((err) => console.warn("[SOS] notify-vigiles (non bloquant) :", err));
        }
      }

      setAlert(alertData as Alert);
      setPhase("active");
    } catch (err: unknown) {
      console.error("[SOS] erreur :", err);
      const msg = err instanceof Error ? err.message : "";
      setError(
        /duplicate|unique/i.test(msg)
          ? "Une alerte est déjà en cours pour ce véhicule."
          : "Envoi impossible. Vérifiez votre connexion et réessayez."
      );
      setPhase("idle");
    }
  };

  // Propriétaire : terminer l'alerte (récupéré ou fausse alerte)
  const closeAlert = async (falseAlarm: boolean) => {
    if (!supabase || !alert) return;
    setClosing(true);
    try {
      await supabase
        .from("sos_alerts")
        .update({ status: falseAlarm ? "false_alarm" : "resolved", resolved_at: new Date().toISOString() })
        .eq("id", alert.id)
        .eq("status", "active");
      router.push("/");
    } catch {
      setError("Impossible pour le moment. Réessayez.");
      setClosing(false);
    }
  };

  const photo = device?.vehicle_photo || device?.url_image || null;
  const found = Boolean(alert?.found_at);
  const spotted = alert?.spotted_count ?? 0;

  return (
    <div className="absolute inset-0 overflow-y-auto bg-yazz-background">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-6">
        {/* Barre du haut */}
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={() => router.push("/")}
            aria-label="Retour"
            className="grid h-10 w-10 place-items-center rounded-yazz-sm bg-yazz-surface text-yazz-text-dark yazz-shadow-soft transition-colors hover:bg-yazz-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-outfit text-[18px] font-bold text-yazz-text-dark">
            {phase === "active" ? "Alerte SOS" : "Signaler un vol"}
          </h1>
        </div>

        {phase === "loading" ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-yazz-primary" />
          </div>
        ) : (
          <div key={phase === "active" ? "active" : "idle"} className="yazz-stagger flex flex-1 flex-col">
            {/* Bouclier qui émet */}
            <div className="flex flex-col items-center pt-2 text-center">
              <PulseBadge tone={found ? "success" : "danger"} animate={phase !== "active" || !found} />
              <h2 className="font-outfit mt-2 text-[22px] font-bold tracking-tight text-yazz-text-dark">
                {phase === "active"
                  ? found
                    ? "Véhicule retrouvé"
                    : "Alerte en cours"
                  : "Votre véhicule a été volé ?"}
              </h2>
              <p className="font-inter mt-1.5 max-w-sm text-[14px] leading-relaxed text-yazz-text-muted">
                {phase === "active"
                  ? found
                    ? "Un vigile YAZZ signale l'avoir retrouvé. Vous pouvez terminer l'alerte."
                    : "Les vigiles YAZZ proches sont prévenus et suivent votre véhicule en direct."
                  : "YAZZ alerte les vigiles autour de lui pour vous aider à le retrouver."}
              </p>
            </div>

            {/* Véhicule */}
            <div className="mt-6 flex items-center gap-4 rounded-yazz-md bg-yazz-surface p-4 yazz-shadow-soft">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-yazz-sm bg-yazz-accent">
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car className="h-7 w-7 text-yazz-text-muted" strokeWidth={1.75} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-outfit truncate text-[16px] font-semibold text-yazz-text-dark">{vehicleLabel(device)}</p>
                {device?.vehicle_plate && (
                  <span className="font-inter mt-1.5 inline-block rounded-yazz-sm border-[1.5px] border-yazz-border-light px-2 py-0.5 text-[12px] font-bold tracking-[0.12em] text-yazz-text-dark">
                    {device.vehicle_plate}
                  </span>
                )}
                {phase === "active" && (
                  <p className={cn("font-inter mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold", found ? "text-yazz-success" : "text-yazz-error")}>
                    <span className={cn("h-2 w-2 rounded-full", found ? "bg-yazz-success" : "bg-yazz-error yazz-blink")} />
                    {found ? "Retrouvé" : "Position suivie en direct"}
                  </p>
                )}
              </div>
            </div>

            {/* Explications / suivi */}
            <p className="font-inter mb-2 mt-6 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-yazz-text-muted">
              {phase === "active" ? "Suivi de l'alerte" : "Ce qui va se passer"}
            </p>
            <div className="divide-y divide-yazz-border-light rounded-yazz-md bg-yazz-surface yazz-shadow-soft">
              {phase === "active" ? (
                <>
                  <Step icon={BellRing} title="Vigiles prévenus" text="Ceux qui sont à moins de 10 km, une seule fois, avec la photo." />
                  <Step
                    icon={Eye}
                    title={spotted > 0 ? `Repéré par ${spotted} vigile${spotted > 1 ? "s" : ""}` : "Pas encore repéré"}
                    text="Vous recevez une notification à chaque signalement."
                  />
                  <Step icon={ShieldCheck} title="Retrouvé ?" text="Terminez l'alerte : les vigiles sont prévenus qu'ils peuvent arrêter." />
                </>
              ) : (
                <>
                  <Step icon={BellRing} title="Les vigiles proches sont prévenus" text="Dans un rayon de 10 km, avec la photo de votre véhicule." />
                  <Step icon={MapPin} title="Ils suivent votre véhicule en direct" text="Sa position s'affiche sur leur carte tant que l'alerte est active." />
                  <Step icon={ShieldCheck} title="Vous êtes prévenu dès qu'il est retrouvé" text="Vous pouvez arrêter l'alerte à tout moment." />
                </>
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-yazz-md bg-yazz-error/10 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-yazz-error" />
                <p className="font-inter text-[13px] font-medium text-yazz-error">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-yazz-background from-70% to-transparent px-4 pb-1 pt-6">
              {phase === "active" ? (
                <div className="flex gap-2.5">
                  <button
                    onClick={() => closeAlert(true)}
                    disabled={closing}
                    className="font-inter h-12 flex-1 rounded-yazz-sm border-[1.5px] border-yazz-border-light bg-yazz-surface text-[14px] font-semibold text-yazz-text-dark transition-colors hover:bg-yazz-accent disabled:opacity-50"
                  >
                    Fausse alerte
                  </button>
                  <button
                    onClick={() => closeAlert(false)}
                    disabled={closing}
                    className="font-inter flex h-12 flex-[2] items-center justify-center gap-2 rounded-yazz-sm bg-yazz-success text-[14px] font-semibold text-white transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
                  >
                    {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
                    Je l&apos;ai récupéré
                  </button>
                </div>
              ) : (
                <>
                  <HoldButton
                    label="Maintenir pour envoyer l'alerte"
                    holdingLabel="Continuez d'appuyer…"
                    busy={phase === "sending"}
                    onConfirm={triggerSOS}
                  />
                  <p className="font-inter mt-2 text-center text-[12.5px] text-yazz-text-muted">
                    Gardez le bouton appuyé 2 secondes
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ icon: Icon, title, text }: { icon: typeof BellRing; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-yazz-sm bg-yazz-error/10 text-yazz-error">
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="font-inter text-[14px] font-semibold leading-snug text-yazz-text-dark">{title}</p>
        <p className="font-inter mt-0.5 text-[13px] leading-relaxed text-yazz-text-muted">{text}</p>
      </div>
    </div>
  );
}

/** Bouclier rouge qui émet des ondes (vert une fois le véhicule retrouvé). */
function PulseBadge({ tone, animate }: { tone: "danger" | "success"; animate: boolean }) {
  const color = tone === "success" ? "bg-yazz-success" : "bg-yazz-error";
  const soft = tone === "success" ? "bg-yazz-success/15" : "bg-yazz-error/15";
  return (
    <div className="relative my-4 grid h-28 w-28 place-items-center">
      {animate && (
        <>
          <span className={cn("absolute inset-2 rounded-full animate-ping [animation-duration:2.2s]", soft)} />
          <span className={cn("absolute inset-0 rounded-full", soft, "opacity-60")} />
        </>
      )}
      <span
        className={cn(
          "relative grid h-20 w-20 place-items-center rounded-full text-white shadow-[0_10px_28px_-6px_rgba(229,62,62,0.55)]",
          color,
          tone === "success" && "shadow-[0_10px_28px_-6px_rgba(56,161,105,0.55)]"
        )}
      >
        {tone === "success" ? <CheckCircle2 className="h-9 w-9" /> : <ShieldAlert className="h-9 w-9" />}
      </span>
    </div>
  );
}

/**
 * Bouton « maintenir pour confirmer » : un clic accidentel ne déclenche rien.
 * On garde le bouton appuyé ~1,5 s (souris, doigt ou clavier), la barre se
 * remplit, l'alerte part.
 */
function HoldButton({
  label,
  holdingLabel,
  busy,
  onConfirm,
}: {
  label: string;
  holdingLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const HOLD_MS = 1500;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const raf = useRef<number | null>(null);
  const startedAt = useRef(0);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  const start = useCallback(() => {
    if (busy || raf.current) return;
    setHolding(true);
    startedAt.current = performance.now();
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
    const tick = (t: number) => {
      const p = Math.min(1, (t - startedAt.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stop();
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(30);
        onConfirm();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [busy, onConfirm, stop]);

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      disabled={busy}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={stop}
      aria-label={label}
      className={cn(
        "relative h-14 w-full touch-none select-none overflow-hidden rounded-yazz-sm bg-yazz-error text-white shadow-[0_10px_24px_-10px_rgba(229,62,62,0.8)] transition-transform duration-150",
        holding && "scale-[0.985]",
        busy && "opacity-80"
      )}
    >
      <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${progress * 100}%` }} />
      <span className="font-inter relative flex items-center justify-center gap-2.5 text-[15px] font-semibold">
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Envoi de l&apos;alerte…
          </>
        ) : (
          <>
            <ShieldAlert className="h-5 w-5" />
            {holding ? holdingLabel : label}
          </>
        )}
      </span>
    </button>
  );
}
