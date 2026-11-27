"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// Carte chargée seulement dans le navigateur (Mapbox)
const SosLiveMap = dynamic(() => import("@/components/yazz/mapbox/sos-live-map").then((m) => m.SosLiveMap), { ssr: false });
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";

// ============================================================
// Page vigile SOS
// S'abonne aux sos_alerts actives (status = 'active' AND declared_by != me)
// via Realtime. Affiche les infos véhicule pour identification.
// Le vigile voit tout de suite le trajet jusqu'au véhicule ; « Je l'ai retrouvé ».
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
  // « Retrouvé » signalé par un vigile (migration 051)
  found_at?: string | null;
  found_by?: string | null;
};

let vigileChannelCounter = 0;

export default function VigilePage() {
  const router = useRouter();
  const supabase = createClientSafe();
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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

  // Un vigile a retrouvé le véhicule : le propriétaire et tous les vigiles
  // prévenus le savent tout de suite (serveur YAZZ).
  const [foundBusy, setFoundBusy] = useState<string | null>(null);
  const handleFound = async (alertId: string) => {
    if (!supabase) return;
    setFoundBusy(alertId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const backendUrl = process.env.NEXT_PUBLIC_YAZZ_BACKEND_URL;
      if (!session || !backendUrl) return;
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((ok, ko) =>
          navigator.geolocation.getCurrentPosition(ok, ko, { timeout: 5000, maximumAge: 60000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        /* position facultative */
      }
      const res = await fetch(`${backendUrl}/api/sos/${alertId}/found`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      if (res.ok) {
        setAlerts((list) => list.map((a) => (a.id === alertId ? { ...a, found_at: new Date().toISOString() } : a)));
      }
    } catch (err) {
      console.error("[Vigile] retrouvé : erreur", err);
    } finally {
      setFoundBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-yazz-background">
      <div className="mx-auto max-w-2xl px-4 py-5 md:px-6 md:py-8">
        {/* En-tête */}
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Retour"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-sm bg-yazz-surface text-yazz-text-dark yazz-shadow-soft transition-colors hover:bg-yazz-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-outfit text-[20px] font-bold tracking-[-0.02em] text-yazz-text-dark">Alertes SOS</h1>
            <p className="font-inter text-[13px] text-yazz-text-muted">
              {alerts.length > 0
                ? `${alerts.length} véhicule${alerts.length > 1 ? "s" : ""} recherché${alerts.length > 1 ? "s" : ""} près de vous`
                : "Mode vigile activé"}
            </p>
          </div>
          <span className="font-inter flex shrink-0 items-center gap-1.5 bg-yazz-surface px-2.5 py-1.5 text-[12px] font-semibold text-yazz-text-body yazz-shadow-soft">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yazz-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-yazz-success" />
            </span>
            En écoute
          </span>
        </div>

        {error && (
          <div className="mb-4 bg-yazz-warning/10 p-3">
            <p className="font-inter text-[13px] text-yazz-text-body">{error}</p>
          </div>
        )}

        {loading && (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-yazz-primary" />
          </div>
        )}

        {!loading && !error && alerts.length === 0 && (
          <div className="yazz-enter grid place-items-center bg-yazz-surface px-6 py-14 text-center yazz-shadow-soft">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-success/10">
              <ShieldCheck className="h-7 w-7 text-yazz-success" />
            </div>
            <p className="font-outfit mt-4 text-[17px] font-semibold text-yazz-text-dark">Tout est calme</p>
            <p className="font-inter mt-1 max-w-xs text-[13px] leading-relaxed text-yazz-text-muted">
              Aucun véhicule recherché près de vous. Vous serez prévenu dès qu&apos;une alerte est lancée.
            </p>
          </div>
        )}

        {!loading && alerts.length > 0 && (
          <div className="yazz-stagger space-y-4">
            {alerts.map((alert) => (
              <VigileAlertCard
                key={alert.id}
                alert={alert}
                onFound={() => handleFound(alert.id)}
                foundBusy={foundBusy === alert.id}
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
  onFound,
  foundBusy,
}: {
  alert: SosAlert;
  onFound: () => void;
  foundBusy: boolean;
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
        const min = Math.floor((Date.now() - new Date(alert.created_at).getTime()) / 60000);
        if (min < 1) return "à l'instant";
        if (min < 60) return `il y a ${min} min`;
        return `il y a ${Math.floor(min / 60)} h`;
      })()
    : "";

  const name = [alert.vehicle_brand, alert.vehicle_model, alert.vehicle_color].filter(Boolean).join(" · ") || alert.device_name || "Véhicule signalé";
  const found = Boolean(alert.found_at);
  const hasPos = alert.last_lat != null && alert.last_lng != null;

  // Suivre : autorisation de position, puis mon point + l'itinéraire jusqu'au
  // véhicule sur la carte (mis à jour quand l'un ou l'autre bouge)
  const watchRef = useRef<number | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const gpsUrl = hasPos
    ? `https://www.google.com/maps/dir/?api=1&destination=${alert.last_lat},${alert.last_lng}&travelmode=driving`
    : "";
  const follow = () => {
    if (!navigator.geolocation) {
      if (gpsUrl) window.open(gpsUrl, "_blank", "noopener");
      return;
    }
    setGeoMsg(null);
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeoMsg("Autorisez votre position pour être guidé"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };
  // Dès l'ouverture : position demandée une fois, puis trajet affiché tout seul
  useEffect(() => {
    const t = !found && hasPos ? setTimeout(follow, 300) : undefined;
    return () => {
      if (t) clearTimeout(t);
      if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
    };
  }, []);
  const distance =
    me && hasPos
      ? (() => {
          const r = Math.PI / 180;
          const dLat = (alert.last_lat! - me.lat) * r;
          const dLng = (alert.last_lng! - me.lng) * r;
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(me.lat * r) * Math.cos(alert.last_lat! * r) * Math.sin(dLng / 2) ** 2;
          const m = 2 * 6371000 * Math.asin(Math.sqrt(h));
          return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m / 10) * 10} m`;
        })()
      : null;

  // « Je l'ai retrouvé » : un 2e appui confirme (pas de fenêtre du navigateur)
  const [confirmFound, setConfirmFound] = useState(false);
  useEffect(() => {
    if (!confirmFound) return;
    const t = setTimeout(() => setConfirmFound(false), 4000);
    return () => clearTimeout(t);
  }, [confirmFound]);

  return (
    <article className="overflow-hidden bg-yazz-surface yazz-shadow-soft">
      {/* Véhicule */}
      <div className="flex gap-4 p-4">
        <button
          onClick={() => allPhotos.length && setShowAllPhotos(true)}
          className="relative grid h-[76px] w-[76px] shrink-0 place-items-center overflow-hidden bg-yazz-accent"
          aria-label="Voir les photos"
        >
          {allPhotos[0] ? (
            <img src={allPhotos[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <Car className="h-7 w-7 text-yazz-text-muted" strokeWidth={1.75} />
          )}
          {allPhotos.length > 1 && (
            <span className="absolute bottom-1 right-1 bg-yazz-text-dark/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              +{allPhotos.length - 1}
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("font-inter flex items-center gap-1.5 text-[12px] font-semibold", found ? "text-yazz-success" : "text-yazz-error")}>
              <span className={cn("h-2 w-2 rounded-full", found ? "bg-yazz-success" : "bg-yazz-error yazz-blink")} />
              {found ? "Retrouvé" : "Signalé volé"}
            </span>
            {timeAgo && (
              <span className="font-inter ml-auto flex items-center gap-1 text-[12px] text-yazz-text-muted">
                <Clock className="h-3.5 w-3.5" />
                {timeAgo}
              </span>
            )}
          </div>
          <p className="font-outfit mt-1 truncate text-[16px] font-semibold text-yazz-text-dark">{name}</p>
          {alert.vehicle_plate && (
            <span className="font-inter mt-1.5 inline-block border-[1.5px] border-yazz-border-light px-2 py-0.5 text-[12px] font-bold tracking-[0.12em] text-yazz-text-dark">
              {alert.vehicle_plate}
            </span>
          )}
        </div>
      </div>

      {/* Carte en direct */}
      {hasPos && (
        <div className="px-4">
          <SosLiveMap lat={alert.last_lat!} lng={alert.last_lng!} found={found} me={found ? null : me} />
        </div>
      )}

      {/* Où + repérages */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <MapPin className="h-4 w-4 shrink-0 text-yazz-text-muted" />
        <p className="font-inter min-w-0 flex-1 truncate text-[13px] text-yazz-text-body">
          {addressLoading ? "Localisation…" : addressDisplay}
        </p>
        {distance && (
          <span className="font-inter shrink-0 text-[13px] font-semibold text-yazz-primary">à {distance}</span>
        )}
      </div>


      {/* Actions */}
      <div className="p-4">
        {found ? (
          <div className="flex items-center gap-2.5 bg-yazz-success/10 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-yazz-success" />
            <p className="font-inter text-[13px] font-semibold text-yazz-text-dark">
              Véhicule retrouvé. Merci pour votre aide !
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <a
              href={gpsUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => !me && follow()}
              className={cn(
                "font-inter flex h-12 w-full items-center justify-center gap-2 bg-yazz-primary text-[15px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99]",
                !gpsUrl && "pointer-events-none opacity-50"
              )}
            >
              <Navigation className="h-[18px] w-[18px]" />
              Y aller
            </a>
            {geoMsg && <p className="font-inter text-center text-[13px] font-semibold text-yazz-text-muted">{geoMsg}</p>}
            <button
              onClick={() => (confirmFound ? (setConfirmFound(false), onFound()) : setConfirmFound(true))}
              disabled={foundBusy}
              className={cn(
                "font-inter flex h-11 w-full items-center justify-center gap-2 border-[1.5px] text-[14px] font-semibold transition-all active:scale-[0.99] disabled:opacity-60",
                confirmFound
                  ? "border-yazz-text-dark bg-yazz-text-dark text-white"
                  : "border-yazz-border-light bg-yazz-surface text-yazz-text-dark hover:bg-yazz-accent"
              )}
            >
              {foundBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {foundBusy ? "Envoi…" : confirmFound ? "Touchez encore pour confirmer" : "Je l'ai retrouvé"}
            </button>
          </div>
        )}
      </div>

      {/* Galerie photos */}
      {showAllPhotos && allPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-yazz-text-dark/80 p-4 yazz-animate-fade-in"
          onClick={() => setShowAllPhotos(false)}
        >
          <div className="relative w-full max-w-2xl">
            <button
              onClick={() => setShowAllPhotos(false)}
              aria-label="Fermer"
              className="absolute -top-11 right-0 grid h-9 w-9 place-items-center bg-white/10 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="grid max-h-[80vh] grid-cols-2 gap-2 overflow-y-auto">
              {allPhotos.map((url, i) => (
                <img key={i} src={url} alt={`Photo ${i + 1}`} className="h-48 w-full object-cover" />
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
