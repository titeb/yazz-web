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
  Route,
  MapPin as GeofenceIcon,
  Gauge as SpeedIcon,
  Clock,
  Pencil,
  AlertTriangle,
  Siren,
  ShieldAlert,
  Car,
  Trash2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/yazz/mock-data";
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";
import { YazzEngineCutModal } from "./yazz-engine-cut-modal";
import { createClientSafe } from "@/lib/supabase/client";

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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const engineCutState = vehicle.engineCutState ?? false;
  const isCut = engineCutState === true;
  const accOn = vehicle.accOn ?? true;
  const isOffline = vehicle.status === "offline";
  const vehiclePhoto = vehicle.urlImage || null;

  const supabase = createClientSafe();

  // Charger l'état parking_mode au montage
  useEffect(() => {
    if (!supabase || !vehicle.id) return;
    supabase.from("user_devices").select("parking_mode").eq("id", vehicle.id).maybeSingle()
      .then(({ data }) => setParkingActive(data?.parking_mode ?? false));
  }, [supabase, vehicle.id]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
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
      showToast("success", newValue ? "Mode parking activé" : "Mode parking désactivé");
    } catch (err: any) {
      showToast("error", err.message || "Erreur");
    }
  };

  // SOS — Flutter navigate vers sos_trigger_page
  const handleSOS = () => {
    router.push("/alerts?type=sos");
  };

  const badge = getStatusBadge(vehicle.status);
  const battColor = getBatteryColor(vehicle.battery);
  const firstLetter = (vehicle.name || "?")[0]?.toUpperCase() || "?";

  const { address, loading: addressLoading } = useReverseGeocode(
    vehicle.lat ?? null,
    vehicle.lng ?? null
  );

  const addressParts: string[] = [];
  if (address?.street) addressParts.push(address.street);
  if (address?.quarter) addressParts.push(address.quarter);
  if (address?.commune) addressParts.push(address.commune);
  if (address?.city && address.city !== address.commune) addressParts.push(address.city);
  const addressDisplay = addressParts.length > 0 ? addressParts.join(", ") : address?.fullAddress || "Localisation en cours…";

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
              <Zap
                className={cn("h-3.5 w-3.5", accOn && !isOffline ? "text-yazz-success" : "text-yazz-text-caption")}
              />
              <span className={cn("font-inter text-[11px]", accOn && !isOffline ? "text-yazz-success" : "text-yazz-text-muted")}>
                {accOn ? "Contact mis" : "Contact coupé"}
              </span>
              <Battery className={cn("h-3.5 w-3.5 ml-1", !isOffline && vehicle.battery !== null ? battColor : "text-yazz-text-caption")} />
              <span className={cn("font-inter text-[11px]", !isOffline ? "text-yazz-text-muted" : "text-yazz-text-caption")}>
                {vehicle.battery !== null ? `${vehicle.battery}%` : "—"}
              </span>
            </div>
            {/* Badge statut — sous la ligne contact, pas à droite */}
            <div className="mt-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.bg, badge.color)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", badge.color.replace("text-", "bg-"))} />
                {badge.label}
              </span>
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

      {/* Toast feedback */}
      {toast && (
        <div className={cn(
          "shrink-0 border-b p-2.5",
          toast.type === "success" ? "border-l-4 border-l-yazz-success bg-yazz-success/10" : "border-l-4 border-l-yazz-error bg-yazz-error/10"
        )}>
          <p className={cn("font-inter text-[12px] font-semibold", toast.type === "success" ? "text-yazz-success" : "text-yazz-error")}>
            {toast.message}
          </p>
        </div>
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
            {vehicle.lat && vehicle.lng && !addressLoading && (
              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                {vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}
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

      {/* Modal Options — Portal vers body */}
      {showOptions && typeof window !== "undefined" && createPortal(
        <OptionsModal
          vehicleName={vehicle.name}
          deviceId={vehicle.imei || vehicle.id}
          vehicleId={vehicle.id}
          onClose={() => setShowOptions(false)}
          onNavigate={(path) => {
            setShowOptions(false);
            router.push(path);
          }}
        />,
        document.body
      )}
    </div>
  );
}

// ============================================================
// Modal Options — reproduit le SensorOptionsModal du Flutter
// Chaque option a sa propre action (pas juste une redirection)
// ============================================================
function OptionsModal({
  vehicleName,
  deviceId,
  vehicleId,
  onClose,
  onNavigate,
}: {
  vehicleName: string;
  deviceId: string;
  vehicleId: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const router = useRouter();
  const [activeSubModal, setActiveSubModal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deviceActive, setDeviceActive] = useState(true);

  const supabase = createClientSafe();

  // Charger l'état is_active du device au montage
  useEffect(() => {
    if (!supabase) return;
    supabase.from("user_devices").select("is_active").eq("id", vehicleId).maybeSingle()
      .then(({ data }) => setDeviceActive(data?.is_active ?? true));
  }, [supabase, vehicleId]);

  const showResult = (type: "success" | "error", message: string) => {
    setActionResult({ type, message });
    setTimeout(() => setActionResult(null), 3000);
  };

  // Action: toggle device active (désactiver/activer) — comme Flutter _toggleDeviceActive
  const toggleDeviceActive = async () => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      // Lire l'état actuel
      const { data: current } = await supabase
        .from("user_devices")
        .select("is_active")
        .eq("id", vehicleId)
        .maybeSingle();
      const newValue = !current?.is_active;
      const { error } = await supabase
        .from("user_devices")
        .update({ is_active: newValue, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
      if (error) throw error;
      setDeviceActive(newValue);
      showResult("success", newValue ? "Capteur activé" : "Capteur désactivé");
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: delete device (supprimer)
  const deleteDevice = async () => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .delete()
        .eq("id", vehicleId);
      if (error) throw error;
      showResult("success", "Capteur supprimé");
      setTimeout(() => { onClose(); router.push("/vehicles"); }, 1500);
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: set speed limit
  const setSpeedLimit = async (limit: number | null) => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .update({ speed_limit: limit, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
      if (error) throw error;
      showResult("success", limit ? `Limite fixée à ${limit} km/h` : "Limite supprimée");
      setTimeout(() => setActiveSubModal(null), 1500);
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: set prolonged stop threshold
  const setProlongedStop = async (minutes: number | null) => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .update({ max_stop_duration_minutes: minutes, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
      if (error) throw error;
      showResult("success", minutes ? `Alerte après ${minutes} min` : "Alerte désactivée");
      setTimeout(() => setActiveSubModal(null), 1500);
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Options — exactement comme Flutter SensorOptionsModal
  // Pas de "mode parking" ni "SOS" ici (ils sont dans capteurDetailPage, pas dans le modal)
  const navOptions = [
    { icon: Route, title: "Historique des trajets", subtitle: "Consulter les parcours passés", action: () => { onClose(); router.push("/history"); } },
    { icon: GeofenceIcon, title: "Zones géofence", subtitle: "Définir des périmètres de sécurité", action: () => { onClose(); router.push("/geofences"); } },
    { icon: SpeedIcon, title: "Limite de vitesse", subtitle: "Configurer les alertes d'excès", action: () => setActiveSubModal("speedLimit") },
    { icon: Clock, title: "Alerte arrêt prolongé", subtitle: "Notification en cas d'immobilité", action: () => setActiveSubModal("prolongedStop") },
    { icon: Pencil, title: "Modifier le capteur", subtitle: "Nom, véhicule et photo", action: () => { onClose(); router.push(`/vehicles?edit=${vehicleId}`); } },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-md" />
      <div
        className="relative w-full max-w-md rounded-t-yazz-xl sm:rounded-yazz-xl bg-yazz-surface yazz-shadow-high yazz-animate-fade-in-up max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixe */}
        <div className="relative shrink-0 border-b border-yazz-border-light p-5 pb-3">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
            Options
          </h2>
          <p className="font-inter text-[12px] text-yazz-text-muted">{vehicleName}</p>
        </div>

        {/* Résultat action */}
        {actionResult && (
          <div className={cn(
            "shrink-0 border-b p-3",
            actionResult.type === "success" ? "border-l-4 border-l-yazz-success bg-yazz-success/10" : "border-l-4 border-l-yazz-error bg-yazz-error/10"
          )}>
            <p className={cn("font-inter text-[12px] font-semibold", actionResult.type === "success" ? "text-yazz-success" : "text-yazz-error")}>
              {actionResult.message}
            </p>
          </div>
        )}

        {/* Liste scrollable */}
        <ul className="flex-1 overflow-y-auto p-3 space-y-1">
          {navOptions.map((opt, idx) => {
            const Icon = opt.icon;
            return (
              <li key={idx}>
                <button
                  onClick={opt.action}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-yazz-md p-3 text-left transition-colors hover:bg-yazz-accent disabled:opacity-50"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-yazz-primary/10">
                    <Icon className="h-[18px] w-[18px] text-yazz-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                      {opt.title}
                    </p>
                    <p className="font-inter text-[11px] text-yazz-text-muted">
                      {opt.subtitle}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}

          {/* Divider avant switch */}
          <li className="my-1 h-px bg-yazz-border-light" />

          {/* Switch désactiver/activer — Flutter _buildOptionTile avec Switch */}
          <li>
            <div className="flex w-full items-center gap-3 rounded-yazz-md p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-yazz-primary/10">
                <Power className="h-[18px] w-[18px] text-yazz-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                  {deviceActive ? "Capteur actif" : "Capteur inactif"}
                </p>
                <p className="font-inter text-[11px] text-yazz-text-muted">
                  {deviceActive ? "Mettre en pause le suivi en direct" : "Réactiver le suivi en direct"}
                </p>
              </div>
              {actionLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-yazz-primary" />
              ) : (
                <button
                  onClick={toggleDeviceActive}
                  role="switch"
                  aria-checked={deviceActive}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    deviceActive ? "bg-yazz-primary" : "bg-yazz-border-medium"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-yazz-soft transition-transform",
                      deviceActive ? "translate-x-[22px]" : "translate-x-0.5"
                    )}
                  />
                </button>
              )}
            </div>
          </li>

          {/* Divider avant supprimer */}
          <li className="my-1 h-px bg-yazz-border-light" />

          {/* Supprimer le capteur — Flutter _confirmDelete */}
          <li>
            <button
              onClick={() => setActiveSubModal("delete")}
              disabled={actionLoading}
              className="flex w-full items-center gap-3 rounded-yazz-md p-3 text-left transition-colors hover:bg-yazz-error/10 disabled:opacity-50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-yazz-error/10">
                <Trash2 className="h-[18px] w-[18px] text-yazz-error" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-outfit text-[13px] font-semibold text-yazz-error">
                  Supprimer le capteur
                </p>
                <p className="font-inter text-[11px] text-yazz-text-muted">
                  Retirer définitivement ce tracker
                </p>
              </div>
            </button>
          </li>
        </ul>

        {/* Sub-modals pour les actions avec input */}
        {activeSubModal === "speedLimit" && (
          <SubModal title="Limite de vitesse" onClose={() => setActiveSubModal(null)}>
            <SpeedLimitForm onSubmit={setSpeedLimit} loading={actionLoading} />
          </SubModal>
        )}

        {activeSubModal === "prolongedStop" && (
          <SubModal title="Alerte arrêt prolongé" onClose={() => setActiveSubModal(null)}>
            <ProlongedStopForm onSubmit={setProlongedStop} loading={actionLoading} />
          </SubModal>
        )}

        {activeSubModal === "delete" && (
          <SubModal title="Supprimer le capteur ?" onClose={() => setActiveSubModal(null)}>
            <div className="space-y-3">
              <div className="rounded-yazz-sm border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
                <p className="font-inter text-[12px] text-yazz-text-body">
                  Cette action est <strong>irréversible</strong>. Le capteur <strong>{vehicleName}</strong> sera définitivement retiré de votre compte.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActiveSubModal(null)} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light py-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent">
                  Annuler
                </button>
                <button
                  onClick={deleteDevice}
                  disabled={actionLoading}
                  className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white hover:bg-yazz-error/90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Supprimer
                </button>
              </div>
            </div>
          </SubModal>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-modal wrapper
// ============================================================
function SubModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-yazz-text-dark/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[90%] max-w-sm rounded-yazz-xl bg-yazz-surface p-4 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-outfit text-[14px] font-bold text-yazz-text-dark">{title}</h3>
          <button onClick={onClose} className="grid h-6 w-6 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Form: Speed Limit
// ============================================================
function SpeedLimitForm({ onSubmit, loading }: { onSubmit: (limit: number | null) => void; loading: boolean }) {
  const [value, setValue] = useState("");
  const presets = [40, 50, 70, 90, 120];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setValue(String(p))}
            className={cn(
              "font-outfit rounded-yazz-sm border py-2 text-[12px] font-bold transition-all",
              value === String(p) ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ou valeur personnalisée (km/h)"
        className="font-inter h-10 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
      />
      <div className="flex gap-2">
        <button onClick={() => onSubmit(null)} disabled={loading} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light py-2 text-[12px] font-semibold text-yazz-text-muted hover:bg-yazz-accent disabled:opacity-50">
          Supprimer
        </button>
        <button
          onClick={() => onSubmit(value ? parseInt(value, 10) : null)}
          disabled={loading || !value}
          className="font-inter flex flex-1 items-center justify-center gap-1 rounded-yazz-sm bg-yazz-primary py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Form: Prolonged Stop
// ============================================================
function ProlongedStopForm({ onSubmit, loading }: { onSubmit: (minutes: number | null) => void; loading: boolean }) {
  const presets = [
    { value: 15, label: "15 min" },
    { value: 30, label: "30 min" },
    { value: 60, label: "1h" },
    { value: 120, label: "2h" },
    { value: 240, label: "4h" },
  ];
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <p className="font-inter text-[11px] text-yazz-text-muted">Recevoir une alerte après combien de temps d'immobilité ?</p>
      <div className="grid grid-cols-5 gap-2">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => setSelected(p.value)}
            className={cn(
              "font-outfit rounded-yazz-sm border py-2 text-[11px] font-bold transition-all",
              selected === p.value ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(null)} disabled={loading} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light py-2 text-[12px] font-semibold text-yazz-text-muted hover:bg-yazz-accent disabled:opacity-50">
          Désactiver
        </button>
        <button
          onClick={() => onSubmit(selected)}
          disabled={loading || selected === null}
          className="font-inter flex flex-1 items-center justify-center gap-1 rounded-yazz-sm bg-yazz-primary py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
