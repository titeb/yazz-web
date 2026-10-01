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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/yazz/mock-data";
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";
import { YazzEngineCutModal } from "./yazz-engine-cut-modal";

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
  const engineCutState = vehicle.engineCutState ?? false;
  const isCut = engineCutState === true;
  const accOn = vehicle.accOn ?? true;
  const isOffline = vehicle.status === "offline";
  const vehiclePhoto = vehicle.urlImage || null;

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

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2 border-b border-yazz-border-light p-3">
        <button
          onClick={() => setShowEngineCut(true)}
          className={cn(
            "font-inter flex flex-col items-center gap-1 rounded-yazz-md py-2.5 transition-all active:scale-95",
            isCut
              ? "bg-yazz-success/10 text-yazz-success hover:bg-yazz-success/15"
              : "bg-yazz-error/10 text-yazz-error hover:bg-yazz-error/15"
          )}
        >
          <Power className="h-[18px] w-[18px]" />
          <span className="text-[10px] font-semibold">{isCut ? "Restaurer" : "Coupe-moteur"}</span>
        </button>
        <button
          onClick={handleShare}
          className="font-inter flex flex-col items-center gap-1 rounded-yazz-md bg-yazz-info/10 py-2.5 text-yazz-info transition-all hover:bg-yazz-info/15 active:scale-95"
        >
          <Share2 className="h-[18px] w-[18px]" />
          <span className="text-[10px] font-semibold">Partager</span>
        </button>
        <button
          onClick={() => setShowOptions(true)}
          className="font-inter flex flex-col items-center gap-1 rounded-yazz-md bg-yazz-accent py-2.5 text-yazz-primary transition-all hover:bg-yazz-primary/15 active:scale-95"
        >
          <MoreVertical className="h-[18px] w-[18px]" />
          <span className="text-[10px] font-semibold">Options</span>
        </button>
      </div>

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
// ============================================================
function OptionsModal({
  vehicleName,
  onClose,
  onNavigate,
}: {
  vehicleName: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const options = [
    { icon: Route, title: "Historique des trajets", subtitle: "Consulter les parcours passés", path: "/history" },
    { icon: GeofenceIcon, title: "Zones géofence", subtitle: "Définir des périmètres de sécurité", path: "/geofences" },
    { icon: SpeedIcon, title: "Limite de vitesse", subtitle: "Définir une vitesse maximum", path: "/vehicles" },
    { icon: Clock, title: "Alerte arrêt prolongé", subtitle: "Notification après immobilité prolongée", path: "/vehicles" },
    { icon: Siren, title: "Alerte SOS", subtitle: "Activer le mode vigile SOS", path: "/vehicles" },
    { icon: ShieldAlert, title: "Mode parking", subtitle: "Surveillance antivol à l'arrêt", path: "/vehicles" },
    { icon: Pencil, title: "Modifier le capteur", subtitle: "Nom, véhicule et photo", path: "/vehicles" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-md" />
      <div
        className="relative w-full max-w-md rounded-t-yazz-xl sm:rounded-yazz-xl bg-yazz-surface yazz-shadow-high yazz-animate-fade-in-up max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixe (pas affecté par le scroll) */}
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

        {/* Liste scrollable */}
        <ul className="flex-1 overflow-y-auto p-3 space-y-1">
          {options.map((opt, idx) => {
            const Icon = opt.icon;
            return (
              <li key={idx}>
                <button
                  onClick={() => onNavigate(opt.path)}
                  className="flex w-full items-center gap-3 rounded-yazz-md p-3 text-left transition-colors hover:bg-yazz-accent"
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
        </ul>
      </div>
    </div>
  );
}
