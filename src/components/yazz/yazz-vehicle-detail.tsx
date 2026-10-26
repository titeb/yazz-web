"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  X,
  Battery,
  Gauge,
  MapPin,
  Power,
  Share2,
  MoreVertical,
  Zap,
  Loader2,
  ShieldAlert,
  Car,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/yazz/mock-data";
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";
import { YazzEngineCutModal } from "./yazz-engine-cut-modal";
import { OptionsModal } from "./yazz-options-modal";
import { createClientSafe } from "@/lib/supabase/client";
import { useYazzToast, YazzToastContainer } from "./yazz-toast";

type YazzVehicleDetailProps = {
  vehicle: Vehicle;
  onClose?: () => void;
};

function getBatteryColor(percent: number | null): string {
  if (percent === null) return "text-yazz-text-caption";
  if (percent > 60) return "text-yazz-success";
  if (percent > 20) return "text-yazz-warning";
  return "text-yazz-error";
}

function getStatusBadge(status: string): { color: string; bg: string; label: string } {
  switch (status) {
    case "moving":
      return { color: "text-yazz-success", bg: "bg-yazz-success/15 border-yazz-success/40", label: "En mouvement" };
    case "idle":
      return { color: "text-yazz-warning", bg: "bg-yazz-warning/15 border-yazz-warning/40", label: "À l'arrêt" };
    case "offline":
      return { color: "text-yazz-error", bg: "bg-yazz-error/15 border-yazz-error/40", label: "Hors ligne" };
    case "alert":
      return { color: "text-yazz-error", bg: "bg-yazz-error/15 border-yazz-error/40", label: "Alerte" };
    default:
      return { color: "text-yazz-text-caption", bg: "bg-yazz-text-caption/15 border-yazz-text-caption/40", label: "Inconnu" };
  }
}

export function YazzVehicleDetail({ vehicle, onClose }: YazzVehicleDetailProps) {
  const router = useRouter();
  const [showEngineCut, setShowEngineCut] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [parkingActive, setParkingActive] = useState(false);
  const [stoppedSince, setStoppedSince] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const { toasts: toastList, showToast, dismissToast } = useYazzToast();
  const engineCutState = vehicle.engineCutState ?? false;
  const isCut = engineCutState === true;
  const accOn = vehicle.accOn ?? true;
  // FIX Feature 4 : contactInputState = vrai fil ACC physique (iStartek in-sta bit 1).
  // Si null (non-iStartek ou fil non branché), fallback sur accOn (bit 9 ou bit 3).
  const contactInputState = vehicle.contactInputState ?? null;
  const contactOn = contactInputState !== null ? contactInputState : accOn;
  const contactIsCertain = contactInputState !== null;
  // FIX Feature 2 : alimOn = alimentation externe (bit 3) avec fallback accOn.
  const externalPowerStatus = vehicle.externalPowerStatus ?? null;
  const alimOn = externalPowerStatus !== null ? externalPowerStatus : accOn;
  const isOffline = vehicle.status === "offline";
  const isIdle = vehicle.status === "idle";
  const vehiclePhoto = vehicle.urlImage || null;

  const supabase = createClientSafe();

  // Charger l'état parking_mode au montage
  useEffect(() => {
    if (!supabase || !vehicle.id) return;
    supabase.from("user_devices").select("parking_mode").eq("id", vehicle.id).maybeSingle()
      .then(({ data }) => setParkingActive(data?.parking_mode ?? false));
  }, [supabase, vehicle.id]);

  // FIX 2026-10-21 : Fetch stoppedSince (dernier mouvement réel speed > 5)
  // quand le véhicule est "À l'arrêt". Affiche "il y a Xh Ymin" sous le badge.
  // Utilise l'index partiel idx_gps_points_device_timestamp_moving (0.14ms).
  useEffect(() => {
    if (!supabase || !vehicle.id || !isIdle) {
      setStoppedSince(null);
      return;
    }
    let cancelled = false;
    const fetchStoppedSince = async () => {
      try {
        const { data, error } = await supabase
          .from("gps_points")
          .select("timestamp")
          .eq("device_id", vehicle.id)
          .gt("speed", 5)
          .order("timestamp", { ascending: false })
          .limit(1);
        if (!cancelled && !error && data && data.length > 0) {
          setStoppedSince(data[0].timestamp);
        } else {
          setStoppedSince(null);
        }
      } catch {
        if (!cancelled) setStoppedSince(null);
      }
    };
    fetchStoppedSince();
    // Re-fetch toutes les 5 minutes (cache naturel côté Supabase)
    const interval = setInterval(fetchStoppedSince, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [supabase, vehicle.id, isIdle]);

  // Tick toutes les 60s pour mettre à jour le "il y a X" affiché
  useEffect(() => {
    if (!isIdle || !stoppedSince) return;
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [isIdle, stoppedSince]);

  // Formatteur "il y a X" — identique au Flutter StopDurationFormatter
  const stopDurationLabel = (() => {
    if (!stoppedSince) return null;
    const diffMs = now - new Date(stoppedSince).getTime();
    if (diffMs < 0) return "à l'instant";
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);
    const hrs = Math.floor(min / 60);
    const days = Math.floor(hrs / 24);
    if (sec < 60) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    if (hrs < 24) {
      const remMin = min - hrs * 60;
      return remMin === 0 ? `il y a ${hrs}h` : `il y a ${hrs}h ${remMin}min`;
    }
    if (days < 7) return days === 1 ? "il y a 1 jour" : `il y a ${days} jours`;
    const weeks = Math.floor(days / 7);
    if (days < 14) return "il y a 1 sem";
    if (days < 30) return `il y a ${weeks} sem`;
    const months = Math.floor(days / 30);
    return months < 2 ? "il y a 1 mois" : `il y a ${months} mois`;
  })();

  const showToastMsg = (type: "success" | "error", title: string, message?: string) => {
    showToast(type, title, message);
  };

  // Toggle parking mode — Flutter _toggleParkingMode
  const handleToggleParking = async () => {
    if (!supabase) return;
    try {
      const newValue = !parkingActive;
      const { error } = await supabase
        .from("user_devices")
        .update({ parking_mode: newValue, updated_at: new Date().toISOString() })
        .eq("id", vehicle.id);
      if (error) throw error;
      setParkingActive(newValue);
      showToastMsg("success", newValue ? "Mode parking activé" : "Mode parking désactivé");
    } catch (err: any) {
      showToastMsg("error", "Erreur", err.message || "Une erreur est survenue");
    }
  };

  // SOS — navigate vers la page SOS dédiée
  const handleSOS = () => {
    router.push("/sos");
  };

  const badge = getStatusBadge(vehicle.status);
  const battColor = getBatteryColor(vehicle.battery);
  const firstLetter = (vehicle.name || "?")[0]?.toUpperCase() || "?";

  const { address, loading: addressLoading } = useReverseGeocode(
    vehicle.lat ?? null,
    vehicle.lng ?? null
  );

  // FIX : afficher jusqu'à 3 parties (street + commune + city)
  const addressParts: string[] = [];
  if (address?.street) addressParts.push(address.street);
  if (address?.commune) addressParts.push(address.commune);
  if (address?.city && address.city !== address.commune) addressParts.push(address.city);
  if (addressParts.length < 2) {
    if (address?.quarter && !addressParts.includes(address.quarter)) addressParts.push(address.quarter);
  }
  const addressDisplay = addressParts.length > 0 ? addressParts.slice(0, 3).join(", ") : address?.fullAddress || "Localisation en cours…";

  const handleShare = () => {
    // Rediriger vers la page partages avec le véhicule pré-sélectionné
    router.push(`/sharing?device=${vehicle.imei || vehicle.id}`);
  };

  return (
    <div className="flex max-h-full flex-col bg-yazz-surface overflow-hidden rounded-yazz-xl">
      {/* Header */}
      <div className="relative border-b border-yazz-border-light p-4 pr-12">
        <div className="flex items-start gap-3">
          {/* Avatar — photo véhicule en carré arrondi (Flutter: ClipRRect radius 14) */}
          {vehiclePhoto ? (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px]">
              <img
                src={vehiclePhoto}
                alt={vehicle.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-yazz-primary/10">
              <span className="font-outfit text-[18px] font-bold text-yazz-primary">
                {firstLetter}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-outfit truncate text-[15px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              {vehicle.name}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {/* FIX Feature 4 : badge Contact (vrai fil ACC physique) */}
              <Zap
                className={cn("h-3.5 w-3.5", contactOn && !isOffline ? "text-yazz-success" : "text-yazz-text-caption")}
              />
              <span className={cn("font-inter text-[11px]", contactOn && !isOffline ? "text-yazz-success" : "text-yazz-text-muted")}>
                {`Contact ${contactOn ? "✓" : "✗"}${!contactIsCertain ? " ?" : ""}`}
              </span>
              {/* FIX Feature 2 : badge Alim. (alimentation externe bit 3) */}
              <span className={cn("font-inter text-[11px] ml-1", alimOn && !isOffline ? "text-yazz-success" : "text-yazz-text-caption")}>
                {`Alim. ${alimOn ? "✓" : "✗"}`}
              </span>
              <Battery className={cn("h-3.5 w-3.5 ml-1", !isOffline && vehicle.battery !== null ? battColor : "text-yazz-text-caption")} />
              <span className={cn("font-inter text-[11px]", !isOffline ? "text-yazz-text-muted" : "text-yazz-text-caption")}>
                {vehicle.battery !== null ? `${vehicle.battery}%` : "—"}
              </span>
            </div>
            {/* Badge statut — sous la ligne contact, pas à droite */}
            <div className="mt-2 flex items-center gap-1.5">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.bg, badge.color)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", badge.color.replace("text-", "bg-"))} />
                {badge.label}
              </span>
              {/* FIX 2026-10-21 : "il y a X" à côté du badge "À l'arrêt" */}
              {isIdle && stopDurationLabel && (
                <span className="font-inter text-[10px] text-yazz-text-caption">
                  {stopDurationLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bouton fermer — repositionné pour ne pas chevaucher le badge */}
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Action buttons — grille 5 boutons */}
      <div className="grid grid-cols-5 gap-2 border-b border-yazz-border-light p-3">
        {/* 1. Coupe-moteur */}
        <button
          onClick={() => setShowEngineCut(true)}
          className={cn(
            "font-inter flex flex-col items-center gap-1.5 rounded-yazz-sm py-2.5 transition-all active:scale-95",
            isCut
              ? "bg-yazz-error text-white yazz-blink"
              : "bg-yazz-background text-yazz-text-body hover:bg-yazz-accent"
          )}
        >
          <Power className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold">{isCut ? "Restaurer" : "Couper"}</span>
        </button>

        {/* 2. Partager */}
        <button
          onClick={handleShare}
          className="font-inter flex flex-col items-center gap-1.5 rounded-yazz-sm bg-yazz-background py-2.5 text-yazz-text-body transition-all hover:bg-yazz-accent active:scale-95"
        >
          <Share2 className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold">Partager</span>
        </button>

        {/* 3. Parking */}
        <button
          onClick={handleToggleParking}
          className={cn(
            "font-inter flex flex-col items-center gap-1.5 rounded-yazz-sm py-2.5 transition-all active:scale-95",
            parkingActive
              ? "yazz-gradient-primary text-white yazz-blink"
              : "bg-yazz-background text-yazz-text-body hover:bg-yazz-accent"
          )}
        >
          <Car className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold">Parking</span>
        </button>

        {/* 4. SOS */}
        <button
          onClick={handleSOS}
          className="font-inter flex flex-col items-center gap-1.5 rounded-yazz-sm bg-yazz-background py-2.5 text-yazz-text-body transition-all hover:bg-yazz-accent active:scale-95"
        >
          <ShieldAlert className="h-[18px] w-[18px] yazz-blink" />
          <span className="text-[9px] font-semibold">SOS</span>
        </button>

        {/* 5. Options */}
        <button
          onClick={() => setShowOptions(true)}
          className="font-inter flex flex-col items-center gap-1.5 rounded-yazz-sm bg-yazz-background py-2.5 text-yazz-text-body transition-all hover:bg-yazz-accent active:scale-95"
        >
          <MoreVertical className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold">Options</span>
        </button>
      </div>

      {/* Toast container — slide-in du haut style yazz user */}
      {typeof window !== "undefined" && createPortal(
        <YazzToastContainer toasts={toastList} onDismiss={dismissToast} />,
        document.body
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Vitesse */}
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-yazz-primary/10">
            <Gauge className="h-[18px] w-[18px] text-yazz-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-inter text-[11px] text-yazz-text-muted">
              {isOffline ? "Dernière vitesse enregistrée" : "Vitesse actuelle"}
            </p>
            <p className={cn("font-outfit text-[14px] font-bold", isOffline ? "text-yazz-text-muted" : "text-yazz-text-dark")}>
              {(vehicle.speed ?? 0).toFixed(1)} km/h
            </p>
          </div>
        </div>

        <div className="my-3 h-px bg-yazz-border-light" />

        {/* Position */}
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-yazz-primary/10">
            <MapPin className="h-[18px] w-[18px] text-yazz-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-inter text-[11px] text-yazz-text-muted">
              {isOffline ? "Dernière position connue" : "Position actuelle"}
            </p>
            {addressLoading ? (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-yazz-primary" />
                <p className="font-inter text-[12px] text-yazz-text-muted">Localisation en cours…</p>
              </div>
            ) : (
              <p className={cn("font-inter text-[12px] leading-snug", isOffline ? "text-yazz-text-muted" : "text-yazz-text-dark")}>
                {addressDisplay}
              </p>
            )}
          </div>
        </div>

        {/* Stats compactes */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-yazz-md bg-yazz-background/60 p-2.5">
            <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">Cap</p>
            <p className="font-outfit text-[14px] font-bold text-yazz-text-dark">{vehicle.heading}°</p>
          </div>
          <div className="rounded-yazz-md bg-yazz-background/60 p-2.5">
            <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">Distance jour</p>
            <p className="font-outfit text-[14px] font-bold text-yazz-text-dark">{vehicle.todayDistanceKm} km</p>
          </div>
        </div>

        {/* Alertes actives */}
        {vehicle.alerts && vehicle.alerts.length > 0 && (
          <div className="mt-4">
            <p className="font-inter mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-yazz-text-caption">
              Alertes actives ({vehicle.alerts.length})
            </p>
            <ul className="space-y-1.5">
              {vehicle.alerts.map((alert, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 rounded-yazz-md border-l-2 border-l-yazz-error bg-yazz-error/5 p-2.5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yazz-error yazz-blink" />
                  <p className="font-inter flex-1 text-[11px] font-medium text-yazz-text-body">
                    {alert.label}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal Coupe-moteur — Portal vers body pour z-index global */}
      {showEngineCut && typeof window !== "undefined" && createPortal(
        <YazzEngineCutModal
          deviceId={vehicle.imei || vehicle.id}
          deviceName={vehicle.name}
          currentCutState={isCut}
          speed={vehicle.speed}
          onClose={() => setShowEngineCut(false)}
          onSuccess={() => setShowEngineCut(false)}
        />,
        document.body
      )}

      {/* Modal Options — Portal vers body (composant extrait pour réutilisation) */}
      {showOptions && typeof window !== "undefined" && createPortal(
        <OptionsModal
          vehicleName={vehicle.name}
          deviceId={vehicle.imei || vehicle.id}
          vehicleId={vehicle.id}
          onClose={() => setShowOptions(false)}
        />,
        document.body
      )}
    </div>
  );
}

// Le composant OptionsModal (et ses SubModal / SpeedLimitForm / ProlongedStopForm)
// a été extrait vers `yazz-options-modal.tsx` pour être réutilisé par la page
// /vehicles sans duplication de code. Le dashboard importe désormais ce module.
