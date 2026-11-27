"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientSafe } from "@/lib/supabase/client";
import { ArrowLeft, Car, CheckCircle2, Eye, Info, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// SOS — même parcours que l'app, presque sans texte :
//   1. un gros bouton ;
//   2. un code à 4 chiffres à recopier (évite les erreurs), l'alerte part seule ;
//   3. alerte en cours : repérages en direct, « Fausse alerte » ou « Je l'ai récupéré ».
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
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState("");

  const askCode = () => {
    setError(null);
    setCode(String(Math.floor(1000 + Math.random() * 9000)));
    setConfirming(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(15);
  };

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
      <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-6">
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
            {phase === "active" ? "Alerte SOS" : "SOS"}
          </h1>
        </div>

        {phase === "loading" ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-yazz-primary" />
          </div>
        ) : (
          <div key={phase === "active" ? "active" : "idle"} className="yazz-stagger flex flex-1 flex-col">
            {/* Véhicule */}
            <div className="flex items-center gap-4 rounded-yazz-md bg-yazz-surface p-3.5 yazz-shadow-soft">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-yazz-sm bg-yazz-accent">
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car className="h-6 w-6 text-yazz-text-muted" strokeWidth={1.75} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-outfit truncate text-[16px] font-semibold text-yazz-text-dark">{vehicleLabel(device)}</p>
                {device?.vehicle_plate && (
                  <span className="font-inter mt-1 inline-block border-[1.5px] border-yazz-border-light px-2 py-0.5 text-[12px] font-bold tracking-[0.12em] text-yazz-text-dark">
                    {device.vehicle_plate}
                  </span>
                )}
              </div>
            </div>

            {/* Centre */}
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              {phase === "active" ? (
                <>
                  <PulseBadge tone={found ? "success" : "danger"} animate={!found} />
                  <p className="font-outfit text-[22px] font-bold text-yazz-text-dark">
                    {found ? "Véhicule retrouvé" : "Alerte en cours"}
                  </p>
                  <p className="font-inter mt-2 flex items-center gap-1.5 text-[14px] text-yazz-text-muted">
                    <Eye className="h-4 w-4" />
                    {spotted > 0 ? `Repéré par ${spotted} vigile${spotted > 1 ? "s" : ""}` : "Vigiles prévenus"}
                  </p>
                </>
              ) : phase === "sending" ? (
                <>
                  <PulseBadge tone="danger" animate />
                  <p className="font-outfit text-[18px] font-semibold text-yazz-text-dark">Envoi de l&apos;alerte…</p>
                </>
              ) : confirming ? (
                <CodeConfirm
                  code={code}
                  onOk={() => {
                    setConfirming(false);
                    triggerSOS();
                  }}
                  onCancel={() => setConfirming(false)}
                />
              ) : (
                <button onClick={askCode} className="group flex flex-col items-center" aria-label="Déclencher le SOS">
                  <span className="transition-transform duration-150 group-active:scale-95">
                    <PulseBadge tone="danger" animate big />
                  </span>
                  <span className="font-inter text-[14px] font-medium text-yazz-text-muted">Touchez en cas de vol</span>
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 flex items-center justify-center gap-2 text-yazz-error">
                <Info className="h-4 w-4 shrink-0" />
                <p className="font-inter text-[13px] font-semibold">{error}</p>
              </div>
            )}

            {phase === "active" && (
              <div className="flex gap-2.5">
                <button
                  onClick={() => closeAlert(true)}
                  disabled={closing}
                  className="font-inter h-12 flex-1 border-[1.5px] border-yazz-border-light bg-yazz-surface text-[14px] font-semibold text-yazz-text-dark transition-colors hover:bg-yazz-accent disabled:opacity-50"
                >
                  Fausse alerte
                </button>
                <button
                  onClick={() => closeAlert(false)}
                  disabled={closing}
                  className="font-inter flex h-12 flex-[2] items-center justify-center gap-2 bg-yazz-primary text-[14px] font-semibold text-white transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
                >
                  {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
                  Je l&apos;ai récupéré
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Bouclier rouge qui émet des ondes (vert une fois le véhicule retrouvé). */
function PulseBadge({ tone, animate, big = false }: { tone: "danger" | "success"; animate: boolean; big?: boolean }) {
  const color = tone === "success" ? "bg-yazz-success" : "bg-yazz-error";
  const soft = tone === "success" ? "bg-yazz-success/15" : "bg-yazz-error/15";
  return (
    <div className={cn("relative mb-4 grid place-items-center", big ? "h-48 w-48" : "h-28 w-28")}>
      {animate && (
        <>
          <span className={cn("absolute inset-3 rounded-full animate-ping [animation-duration:2.2s]", soft)} />
          <span className={cn("absolute inset-0 rounded-full opacity-60", soft)} />
        </>
      )}
      <span
        className={cn(
          "relative grid place-items-center rounded-full text-white",
          big ? "h-32 w-32" : "h-20 w-20",
          color,
          tone === "success"
            ? "shadow-[0_10px_28px_-6px_rgba(56,161,105,0.55)]"
            : "shadow-[0_12px_32px_-8px_rgba(229,62,62,0.6)]"
        )}
      >
        {tone === "success" ? (
          <CheckCircle2 className={big ? "h-12 w-12" : "h-9 w-9"} />
        ) : (
          <ShieldAlert className={big ? "h-12 w-12" : "h-9 w-9"} />
        )}
      </span>
    </div>
  );
}

/** Confirmation par code : on recopie 4 chiffres, l'alerte part toute seule. */
function CodeConfirm({ code, onOk, onCancel }: { code: string; onOk: () => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <div className="yazz-enter-pop flex flex-col items-center">
      <p className="font-inter text-[14px] text-yazz-text-muted">Tapez le code</p>
      <p className="font-outfit mt-1 text-[40px] font-extrabold tracking-[0.3em] text-yazz-error tabular-nums">{code}</p>
      <input
        autoFocus
        inputMode="numeric"
        maxLength={4}
        value={value}
        aria-label="Code de confirmation"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setWrong(false);
          if (v.length === 4) {
            if (v === code) {
              onOk();
              return;
            }
            setWrong(true);
            setValue("");
            if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
            return;
          }
          setValue(v);
        }}
        placeholder="····"
        className={cn(
          "font-outfit mt-5 h-16 w-56 border-2 bg-yazz-surface text-center text-[30px] font-bold tracking-[0.5em] text-yazz-text-dark placeholder:text-yazz-text-muted/40 focus:outline-none",
          wrong ? "border-yazz-error" : "border-yazz-border-light focus:border-yazz-error"
        )}
      />
      <p className={cn("font-inter mt-2 h-5 text-[13px] font-semibold text-yazz-error", !wrong && "invisible")}>Code incorrect</p>
      <button onClick={onCancel} className="font-inter mt-2 text-[14px] font-semibold text-yazz-text-muted hover:text-yazz-text-dark">
        Annuler
      </button>
    </div>
  );
}
