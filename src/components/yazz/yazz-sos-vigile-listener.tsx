"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";

// ============================================================
// Listener global SOS vigile.
//
// Monté dans le layout de l'app, ce composant :
// 1. Vérifie si l'utilisateur a sos_vigil_enabled = true
// 2. Si oui, s'abonne aux INSERT sur sos_alerts via Realtime
// 3. Quand une nouvelle alerte d'un autre user arrive, affiche un
//    bandeau toast en haut de l'écran pendant 10 secondes
// 4. Le clic sur le toast navigue vers /sos/vigile
//
// Si l'utilisateur n'est pas vigile, le composant ne fait rien
// (pas de subscription, pas de toast).
// ============================================================

let sosListenerCounter = 0;

type SosToast = {
  id: string;
  deviceName: string | null;
  vehicleColor: string | null;
  vehicleBrand: string | null;
  vehiclePlate: string | null;
  vehiclePhoto: string | null;
};

export function YazzSosVigileListener() {
  const router = useRouter();
  const supabase = createClientSafe();
  const [isVigile, setIsVigile] = useState(false);
  const [toasts, setToasts] = useState<SosToast[]>([]);
  const [mounted, setMounted] = useState(false);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-sos-listener-${++sosListenerCounter}`;
  }

  useEffect(() => setMounted(true), []);

  // Check if user is a vigile + subscribe to SOS alerts
  useEffect(() => {
    if (!supabase || !isSupabaseConfigured()) return;

    let channel: any = null;
    let currentUserId: string | null = null;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId = user.id;

      // Check if user is a vigile
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("sos_vigil_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      const vigileEnabled = prefs?.sos_vigil_enabled ?? false;
      setIsVigile(vigileEnabled);

      if (!vigileEnabled) return;

      // Subscribe to new SOS alerts
      channel = supabase
        .channel(channelNameRef.current)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "sos_alerts" },
          (payload: any) => {
            const newRow = payload.new as any;
            // Ignore own SOS
            if (newRow.declared_by === currentUserId) return;
            if (newRow.status !== "active") return;

            const toast: SosToast = {
              id: newRow.id,
              deviceName: newRow.device_name ?? null,
              vehicleColor: newRow.vehicle_color ?? null,
              vehicleBrand: newRow.vehicle_brand ?? null,
              vehiclePlate: newRow.vehicle_plate ?? null,
              vehiclePhoto: newRow.vehicle_photo ?? null,
            };

            setToasts((prev) => [...prev, toast]);

            // Auto-dismiss after 10 seconds
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }, 10000);
          }
        )
        .subscribe();

      // Also listen for preference changes (user enables/disables vigile mode)
      const prefsChannel = supabase
        .channel(`yazz-prefs-listener-${++sosListenerCounter}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_preferences", filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            const newRow = payload.new as any;
            setIsVigile(newRow?.sos_vigil_enabled ?? false);
          }
        )
        .subscribe();

      return () => {
        if (prefsChannel) supabase.removeChannel(prefsChannel);
      };
    };

    const cleanup = init();
    return () => {
      if (channel) supabase.removeChannel(channel);
      cleanup?.then((fn) => fn && fn());
    };
  }, [supabase]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToastClick = (alertId: string) => {
    dismissToast(alertId);
    router.push("/sos/vigile");
  };

  if (!mounted || !isVigile || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => handleToastClick(toast.id)}
          className="yazz-animate-fade-in-up flex w-full max-w-md items-center gap-3 overflow-hidden rounded-yazz-lg bg-yazz-surface yazz-shadow-high ring-2 ring-yazz-error/50"
        >
          {/* Photo ou icône */}
          <div className="h-16 w-16 shrink-0 overflow-hidden">
            {toast.vehiclePhoto ? (
              <img
                src={toast.vehiclePhoto}
                alt="Véhicule"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-yazz-error/10">
                <ShieldAlert className="h-6 w-6 text-yazz-error yazz-blink" />
              </div>
            )}
          </div>

          {/* Texte */}
          <div className="min-w-0 flex-1 py-2 pr-2 text-left">
            <p className="font-outfit text-[13px] font-bold text-yazz-error">
              🚨 Alerte SOS à proximité
            </p>
            <p className="font-inter truncate text-[11px] text-yazz-text-dark">
              {toast.deviceName || "Véhicule inconnu"}
            </p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {toast.vehicleColor && (
                <span className="font-inter text-[10px] text-yazz-text-muted">
                  {toast.vehicleColor}
                </span>
              )}
              {toast.vehicleBrand && (
                <span className="font-inter text-[10px] text-yazz-text-muted">
                  · {toast.vehicleBrand}
                </span>
              )}
              {toast.vehiclePlate && (
                <span className="font-inter text-[10px] font-bold text-yazz-primary">
                  · {toast.vehiclePlate}
                </span>
              )}
            </div>
          </div>

          {/* Close */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(toast.id);
            }}
            className="mr-2 grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-yazz-sm text-yazz-text-caption hover:bg-yazz-accent hover:text-yazz-text-dark"
          >
            <X className="h-3.5 w-3.5" />
          </div>
        </button>
      ))}
    </div>,
    document.body
  );
}
