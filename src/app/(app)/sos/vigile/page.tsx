"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  ShieldAlert,
  MapPin,
  Clock,
  Loader2,
  CheckCircle2,
  Navigation,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";

// ============================================================
// Page vigile SOS
// S'abonne aux sos_alerts actives (status = 'active' AND declared_by != me)
// via Realtime. Affiche les infos véhicule pour identification.
// Permet de signaler un repérage (spotting).
// ============================================================

type SosAlert = {
  id: string;
  device_id: string;
  declared_by: string;
  status: string;
  last_lat: number | null;
  last_lng: number | null;
  spotted_count: number;
  created_at: string | null;
  device_name: string | null;
  vehicle_photo: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
};

let vigileChannelCounter = 0;

export default function VigilePage() {
  const router = useRouter();
  const supabase = createClientSafe();
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [spottingAlertId, setSpottingAlertId] = useState<string | null>(null);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-vigile-alerts-${++vigileChannelCounter}`;
  }

  const fetchAlerts = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured()) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Non authentifié");
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);

      // Récupérer les alertes actives déclarées par d'autres users
      const { data, error: fetchErr } = await supabase
        .from("sos_alerts")
        .select("*")
        .eq("status", "active")
        .neq("declared_by", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (fetchErr) throw fetchErr;

      setAlerts((data || []) as SosAlert[]);
      setError(null);
    } catch (err: any) {
      console.error("[Vigile] erreur fetch:", err);
      if (err.message?.includes("permission") || err.code === "42501") {
        setError("Activez le mode vigile dans les paramètres pour voir les alertes SOS.");
      } else {
        setError(err.message ?? "Erreur");
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !channelNameRef.current) return;

    let channel: any = null;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Fetch initial
      fetchAlerts();

      // Realtime : nouvelle alerte SOS → l'ajouter à la liste
      channel = supabase
        .channel(channelNameRef.current)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "sos_alerts" },
          (payload: any) => {
            const newRow = payload.new as any;
            if (newRow.declared_by === currentUserId) return;
            if (newRow.status !== "active") return;

            setAlerts((prev) => {
              if (prev.find((a) => a.id === newRow.id)) return prev;
              return [newRow as SosAlert, ...prev];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sos_alerts" },
          (payload: any) => {
            const newRow = payload.new as any;
            setAlerts((prev) => {
              if (newRow.status === "active") {
                return prev.map((a) => (a.id === newRow.id ? newRow as SosAlert : a));
              }
              return prev.filter((a) => a.id !== newRow.id);
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "sos_alerts" },
          (payload: any) => {
            const oldRow = payload.old as any;
            setAlerts((prev) => prev.filter((a) => a.id !== oldRow?.id));
          }
        )
        .subscribe();
    };

    init();

    const safety = setInterval(() => fetchAlerts(), 30000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(safety);
    };
  }, [supabase, fetchAlerts, currentUserId]);

  const handleSpot = async (alertId: string) => {
    if (!supabase) return;
    setSpottingAlertId(alertId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error: spotErr } = await supabase.from("sos_spottings").insert({
        alert_id: alertId,
        spotter_user_id: user.id,
        spotted_lat: null,
        spotted_lng: null,
      });

      if (spotErr && spotErr.code !== "23505") {
        throw spotErr;
      }
      // spotted_count est incrémenté automatiquement par le trigger SQL
    } catch (err: any) {
      console.error("[Vigile] spotting erreur:", err);
    } finally {
      setTimeout(() => setSpottingAlertId(null), 2000);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-yazz-background">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-sm bg-yazz-surface text-yazz-text-muted shadow-yazz-soft transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
                Mode vigile
              </h1>
              <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
                {alerts.length > 0
                  ? `${alerts.length} alerte${alerts.length > 1 ? "s" : ""} SOS active${alerts.length > 1 ? "s" : ""}`
                  : "Aucune alerte active"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-yazz-error/10 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-yazz-error yazz-blink" />
            <span className="font-inter text-[11px] font-semibold text-yazz-error">En écoute</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <p className="font-inter text-[12px] text-yazz-text-body">{error}</p>
          </div>
        )}

        {loading && (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yazz-primary" />
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-yazz-success/10">
              <CheckCircle2 className="h-8 w-8 text-yazz-success" />
            </div>
            <p className="font-outfit mt-4 text-[16px] font-semibold text-yazz-text-dark">
              Tout est calme
            </p>
            <p className="font-inter mt-1 max-w-xs text-[12px] text-yazz-text-muted">
              Aucune alerte SOS active près de vous. Vous serez notifié dès qu'une alerte sera déclenchée.
            </p>
          </div>
        )}

        {!loading && alerts.length > 0 && (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <VigileAlertCard
                key={alert.id}
                alert={alert}
                onSpot={() => handleSpot(alert.id)}
                spotting={spottingAlertId === alert.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Carte d'alerte SOS pour vigile
// ============================================================
function VigileAlertCard({
  alert,
  onSpot,
  spotting,
}: {
  alert: SosAlert;
  onSpot: () => void;
  spotting: boolean;
}) {
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const supabase = createClientSafe();

  useEffect(() => {
    if (!supabase || !alert.id) return;
    let channel: any = null;

    const fetchPhotos = async () => {
      const { data } = await supabase
        .from("sos_alert_photos")
        .select("url, position")
        .eq("alert_id", alert.id)
        .order("position", { ascending: true });
      setPhotos((data || []).map((p: any) => p.url));
    };

    fetchPhotos();

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      channel = supabase
        .channel(`vigile-alert-photos-${alert.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sos_alert_photos", filter: `alert_id=eq.${alert.id}` },
          () => fetchPhotos()
        )
        .subscribe();
    };
    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, alert.id]);

  const allPhotos = photos.length > 0 ? photos : (alert.vehicle_photo ? [alert.vehicle_photo] : []);

  const { address, loading: addressLoading } = useReverseGeocode(alert.last_lat, alert.last_lng);

  const addressParts: string[] = [];
  if (address?.street) addressParts.push(address.street);
  if (address?.quarter) addressParts.push(address.quarter);
  if (address?.commune) addressParts.push(address.commune);
  if (address?.city && address.city !== address.commune) addressParts.push(address.city);
  if (address?.region && address.region !== address.city && address.region !== address.commune) {
    addressParts.push(address.region);
  }
  const addressDisplay = addressParts.length > 0
    ? addressParts.join(", ")
    : address?.fullAddress || "Position inconnue";

  const timeAgo = alert.created_at
    ? (() => {
        const diff = Date.now() - new Date(alert.created_at).getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return "à l'instant";
        if (min < 60) return `il y a ${min} min`;
        const h = Math.floor(min / 60);
        return `il y a ${h}h`;
      })()
    : "—";

  return (
    <article className="overflow-hidden rounded-yazz-xl border border-yazz-error/30 bg-yazz-surface yazz-shadow-soft">
      {/* Header — bandeau rouge */}
      <div className="flex items-center gap-2 bg-yazz-error/10 px-4 py-2.5">
        <ShieldAlert className="h-5 w-5 text-yazz-error yazz-blink" />
        <p className="font-outfit text-[14px] font-bold text-yazz-error">
          Alerte SOS active
        </p>
        <span className="font-inter ml-auto flex items-center gap-1 text-[11px] text-yazz-text-muted">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </span>
      </div>

      <div className="p-4">
        {/* Photos + infos véhicule */}
        <div className="flex gap-3">
          {allPhotos[0] && (
            <button
              onClick={() => setShowAllPhotos(true)}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-yazz-lg border border-yazz-border-light"
            >
              <img src={allPhotos[0]} alt="Véhicule" className="h-full w-full object-cover" />
              {allPhotos.length > 1 && (
                <span className="absolute bottom-1 right-1 rounded-full bg-yazz-text-dark/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  +{allPhotos.length - 1}
                </span>
              )}
            </button>
          )}

          <div className="min-w-0 flex-1">
            <p className="font-outfit text-[15px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              {alert.device_name || "Véhicule inconnu"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {alert.vehicle_color && (
                <span className="rounded-full bg-yazz-accent px-2 py-0.5 text-[10px] font-semibold text-yazz-text-body">
                  {alert.vehicle_color}
                </span>
              )}
              {alert.vehicle_brand && (
                <span className="rounded-full bg-yazz-accent px-2 py-0.5 text-[10px] font-semibold text-yazz-text-body">
                  {alert.vehicle_brand}
                </span>
              )}
              {alert.vehicle_model && (
                <span className="rounded-full bg-yazz-accent px-2 py-0.5 text-[10px] font-semibold text-yazz-text-body">
                  {alert.vehicle_model}
                </span>
              )}
              {alert.vehicle_plate && (
                <span className="rounded-full bg-yazz-primary/10 px-2 py-0.5 text-[10px] font-bold text-yazz-primary">
                  {alert.vehicle_plate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Position */}
        <div className="mt-3 flex items-start gap-2 rounded-yazz-md bg-yazz-background/60 p-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-yazz-primary" />
          <div className="min-w-0 flex-1">
            {addressLoading ? (
              <p className="font-inter text-[11px] text-yazz-text-muted">Localisation…</p>
            ) : (
              <p className="font-inter text-[11px] leading-snug text-yazz-text-dark">
                {addressDisplay}
              </p>
            )}
            {alert.last_lat && alert.last_lng && (
              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                {alert.last_lat.toFixed(4)}, {alert.last_lng.toFixed(4)}
              </p>
            )}
          </div>
          {alert.last_lat && alert.last_lng && (
            <a
              href={`https://www.google.com/maps?q=${alert.last_lat},${alert.last_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-yazz-sm bg-yazz-primary/10 p-1.5 text-yazz-primary transition-colors hover:bg-yazz-primary/20"
              title="Ouvrir dans Google Maps"
            >
              <Navigation className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* Spotted count */}
        {alert.spotted_count > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-yazz-success" />
            <span className="font-inter text-[11px] text-yazz-text-muted">
              Repéré par {alert.spotted_count} vigile{alert.spotted_count > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Bouton repérer */}
        <button
          onClick={onSpot}
          disabled={spotting}
          className={cn(
            "font-inter mt-3 flex w-full items-center justify-center gap-2 rounded-yazz-sm py-2.5 text-[12px] font-semibold transition-all active:scale-95",
            spotting
              ? "bg-yazz-success text-white"
              : "bg-yazz-primary text-white shadow-yazz-medium hover:bg-yazz-primary/90"
          )}
        >
          {spotting ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Repéré signalé
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4" />
              J'ai repéré ce véhicule
            </>
          )}
        </button>
      </div>

      {/* Modal galerie photos */}
      {showAllPhotos && allPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-yazz-text-dark/80 p-4"
          onClick={() => setShowAllPhotos(false)}
        >
          <div className="relative max-w-2xl">
            <button
              onClick={() => setShowAllPhotos(false)}
              className="absolute -top-10 right-0 grid h-8 w-8 place-items-center rounded-yazz-sm bg-white/10 text-white hover:bg-white/20"
            >
              ✕
            </button>
            <div className="grid max-h-[80vh] grid-cols-2 gap-2 overflow-y-auto">
              {allPhotos.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="h-48 w-full rounded-yazz-md object-cover"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
