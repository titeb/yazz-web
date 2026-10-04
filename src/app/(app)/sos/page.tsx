"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientSafe } from "@/lib/supabase/client";
import {
  Siren,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  X,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SOSState = "idle" | "countdown" | "confirm" | "sending" | "active" | "cancelled";

// Génère un code aléatoire à 4 chiffres pour la confirmation
function generateConfirmCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export default function SOSPage() {
  const router = useRouter();
  const supabase = createClientSafe();
  const [state, setState] = useState<SOSState>("idle");
  const [countdown, setCountdown] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [userInput, setUserInput] = useState("");

  // Countdown timer — après le compte à rebours, on passe à l'étape de confirmation
  // (code à recopier) au lieu de déclencher le SOS directement
  useEffect(() => {
    if (state !== "countdown") return;
    if (countdown <= 0) {
      // Générer un code de confirmation aléatoire et passer à l'étape confirm
      setConfirmCode(generateConfirmCode());
      setUserInput("");
      setError(null);
      setState("confirm");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [state, countdown]);

  const startCountdown = () => {
    setError(null);
    setCountdown(3);
    setState("countdown");
  };

  const cancelCountdown = () => {
    setState("idle");
    setCountdown(3);
  };

  // Valide le code de confirmation saisi par l'utilisateur
  const handleConfirmSubmit = () => {
    if (userInput === confirmCode) {
      // Bon code → déclencher le SOS
      triggerSOS();
    } else {
      setError("Code incorrect. Vérifiez et réessayez.");
    }
  };

  // Régénère un nouveau code (en cas d'erreur de saisie répétée)
  const regenerateCode = () => {
    setConfirmCode(generateConfirmCode());
    setUserInput("");
    setError(null);
  };

  const triggerSOS = async () => {
    setState("sending");
    setError(null);

    if (!supabase) {
      setError("Supabase non configuré");
      setState("idle");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Non authentifié");
        setState("idle");
        return;
      }

      // Get user's first active device + ALL vehicle info (for SOS recognition)
      const { data: devices } = await supabase
        .from("user_devices")
        .select("id, name, url_image, vehicle_photo, vehicle_color, vehicle_plate, vehicle_brand, vehicle_model")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (!devices || devices.length === 0) {
        setError("Aucun capteur actif. Activez un capteur d'abord.");
        setState("idle");
        return;
      }

      const device = devices[0];

      // Get current position from last_known_positions (pour last_lat/last_lng dans l'alerte)
      const { data: position } = await supabase
        .from("last_known_positions")
        .select("latitude, longitude")
        .eq("device_id", device.id)
        .maybeSingle();

      // Fetch vehicle photos from vehicle_photos table (jusqu'à 5, ordre par position)
      const { data: vehiclePhotos } = await supabase
        .from("vehicle_photos")
        .select("url, position")
        .eq("device_id", device.id)
        .order("position", { ascending: true })
        .limit(5);

      // Photo principale = première photo de la galerie, ou fallback vehicle_photo / url_image
      const primaryPhoto = vehiclePhotos?.[0]?.url ?? device.vehicle_photo ?? device.url_image ?? null;

      // Create SOS alert avec TOUTES les infos véhicule pour reconnaissance
      // par les autres utilisateurs (vigiles YAZZ) qui verront l'alerte.
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
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      // Copier les photos du véhicule dans sos_alert_photos (snapshot)
      // pour que les vigiles voient les photos même si l'owner les supprime après
      if (alertData?.id && vehiclePhotos && vehiclePhotos.length > 0) {
        const photoInserts = vehiclePhotos.map((p: any, index: number) => ({
          alert_id: alertData.id,
          url: p.url,
          position: index,
        }));
        const { error: photoInsertErr } = await supabase
          .from("sos_alert_photos")
          .insert(photoInserts);
        if (photoInsertErr) {
          console.warn("[SOS] Erreur insertion photos alerte:", photoInsertErr.message);
          // Non bloquant : l'alerte SOS est créée, les photos sont optionnelles
        }
      }

      // Notifier les vigiles proches via le backend (FCM push)
      // Hybride : si le backend échoue, l'alerte est quand même visible via Realtime
      if (alertData?.id) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL;
            if (backendUrl) {
              fetch(`${backendUrl}/api/sos/notify-vigiles`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ alertId: alertData.id }),
              }).catch((err) => {
                console.warn("[SOS] Backend notify-vigiles failed (non bloquant):", err);
              });
              // Fire-and-forget : ne pas attendre la réponse
            }
          }
        } catch (notifyErr) {
          console.warn("[SOS] Erreur notification vigiles (non bloquant):", notifyErr);
        }
      }

      setState("active");
    } catch (err: any) {
      console.error("[SOS] erreur:", err);
      setError(err.message || "Erreur lors de l'envoi du SOS");
      setState("idle");
    }
  };

  const cancelSOS = async () => {
    if (!supabase) {
      router.back();
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Mark active SOS as false_alarm
      await supabase
        .from("sos_alerts")
        .update({ status: "false_alarm", resolved_at: new Date().toISOString() })
        .eq("declared_by", user.id)
        .eq("status", "active");

      router.back();
    } catch (err) {
      router.back();
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-yazz-text-dark overflow-hidden">
      {/* Background gradient pulse */}
      <div className={cn(
        "absolute inset-0 transition-opacity duration-500",
        state === "countdown" || state === "active" ? "opacity-100" : "opacity-40"
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-yazz-error/30 via-yazz-text-dark to-yazz-text-dark" />
        {state === "countdown" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-[300px] w-[300px] rounded-full bg-yazz-error/20 animate-ping" />
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <button
          onClick={() => router.back()}
          className="grid h-10 w-10 place-items-center rounded-yazz-sm bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-outfit text-[16px] font-bold text-white">Alerte SOS</h1>
        <div className="h-10 w-10" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {state === "idle" && (
          <>
            <div className="mb-8 grid h-32 w-32 place-items-center rounded-full bg-yazz-error/20">
              <ShieldAlert className="h-14 w-14 text-yazz-error" />
            </div>
            <h2 className="font-outfit text-center text-[22px] font-bold text-white">
              Alertez les vigiles YAZZ
            </h2>
            <p className="font-inter mt-2 max-w-xs text-center text-[13px] leading-relaxed text-white/60">
              En cas d'urgence (vol, agression, accident), déclenchez une alerte SOS. Les vigiles YAZZ à proximité seront notifiés immédiatement.
            </p>

            {error && (
              <div className="mt-6 w-full max-w-xs rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
                <p className="font-inter text-[12px] text-yazz-error">{error}</p>
              </div>
            )}

            <button
              onClick={startCountdown}
              className="mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-yazz-error text-white shadow-[0_0_40px_rgba(229,62,62,0.5)] transition-all hover:scale-105 active:scale-95"
            >
              <Siren className="h-8 w-8" />
            </button>
            <p className="font-inter mt-4 text-[12px] text-white/50">
              Maintenez pour déclencher
            </p>
          </>
        )}

        {state === "countdown" && (
          <>
            <div className="relative grid h-48 w-48 place-items-center">
              <div className="absolute inset-0 rounded-full bg-yazz-error/30 animate-ping" />
              <div className="absolute inset-4 rounded-full bg-yazz-error/40" />
              <span className="relative font-outfit text-[64px] font-bold text-white">
                {countdown}
              </span>
            </div>
            <p className="font-outfit mt-6 text-[18px] font-bold text-white">
              Préparation... {countdown}s
            </p>
            <button
              onClick={cancelCountdown}
              className="mt-6 rounded-yazz-sm bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              Annuler
            </button>
          </>
        )}

        {state === "confirm" && (
          <>
            <div className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-yazz-warning/20">
              <ShieldAlert className="h-10 w-10 text-yazz-warning" />
            </div>
            <h2 className="font-outfit text-center text-[20px] font-bold text-white">
              Confirmez le déclenchement
            </h2>
            <p className="font-inter mt-2 max-w-xs text-center text-[12px] leading-relaxed text-white/60">
              Pour éviter un déclenchement accidentel, recopiez le code ci-dessous pour confirmer l'alerte SOS.
            </p>

            {error && (
              <div className="mt-4 w-full max-w-xs rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
                <p className="font-inter text-[12px] text-yazz-error">{error}</p>
              </div>
            )}

            {/* Code à recopier */}
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="rounded-yazz-lg bg-white/10 px-6 py-3 backdrop-blur-sm">
                <p className="font-inter text-[10px] uppercase tracking-wide text-white/40">Code de confirmation</p>
                <p className="font-outfit text-[32px] font-bold tracking-[0.3em] text-white">
                  {confirmCode}
                </p>
              </div>

              {/* Input utilisateur */}
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={4}
                value={userInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setUserInput(val);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && userInput.length === 4) {
                    handleConfirmSubmit();
                  }
                }}
                placeholder="----"
                className="font-outfit h-14 w-40 rounded-yazz-md border-2 border-white/20 bg-white/5 text-center text-[28px] font-bold tracking-[0.3em] text-white placeholder-white/20 backdrop-blur-sm focus:border-yazz-primary focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={regenerateCode}
                  className="font-inter flex items-center gap-1.5 rounded-yazz-sm bg-white/10 px-3 py-2 text-[11px] font-semibold text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Nouveau code
                </button>
              </div>
            </div>

            {/* Boutons */}
            <div className="mt-6 flex w-full max-w-xs gap-2">
              <button
                onClick={() => {
                  setState("idle");
                  setCountdown(3);
                  setUserInput("");
                  setError(null);
                }}
                className="font-inter flex-1 rounded-yazz-sm bg-white/10 px-4 py-3 text-[13px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={userInput.length !== 4}
                className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error px-4 py-3 text-[13px] font-bold text-white shadow-[0_0_30px_rgba(229,62,62,0.4)] transition-all hover:bg-yazz-error/90 disabled:opacity-40 active:scale-95"
              >
                <Siren className="h-4 w-4" />
                Déclencher
              </button>
            </div>
          </>
        )}

        {state === "sending" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-white" />
            <p className="font-outfit mt-4 text-[16px] font-bold text-white">
              Envoi de l'alerte...
            </p>
          </>
        )}

        {state === "active" && (
          <>
            <div className="mb-6 grid h-32 w-32 place-items-center rounded-full bg-yazz-success/20">
              <CheckCircle2 className="h-14 w-14 text-yazz-success" />
            </div>
            <h2 className="font-outfit text-center text-[22px] font-bold text-white">
              Alerte SOS active
            </h2>
            <p className="font-inter mt-2 max-w-xs text-center text-[13px] leading-relaxed text-white/60">
              Votre alerte a été envoyée. Les vigiles YAZZ à proximité ont été notifiés. Restez en sécurité.
            </p>

            {/* Pulsing indicator */}
            <div className="mt-8 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-yazz-error yazz-blink" />
              <span className="font-inter text-[12px] text-white/70">En cours de diffusion</span>
            </div>

            <button
              onClick={cancelSOS}
              className="mt-8 flex items-center gap-2 rounded-yazz-sm bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4" />
              Annuler l'alerte
            </button>
          </>
        )}
      </div>

      {/* Footer info */}
      <div className="relative z-10 p-4">
        <div className="flex items-start gap-2 rounded-yazz-md bg-white/5 p-3 backdrop-blur-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-white/40 mt-0.5" />
          <p className="font-inter text-[10px] leading-relaxed text-white/40">
            L'alerte SOS utilise votre position GPS actuelle et notifie les vigiles YAZZ à proximité. N'utilisez cette fonction qu'en cas de réel danger.
          </p>
        </div>
      </div>
    </div>
  );
}
