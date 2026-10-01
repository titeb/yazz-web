"use client";

import { useState } from "react";
import {
  X,
  Battery,
  Gauge,
  MapPin,
  Power,
  Share2,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/yazz/mock-data";
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
  const [showEngineCut, setShowEngineCut] = useState(false);
  const engineCutState = (vehicle as any).engineCutState ?? false;
  const isCut = engineCutState === true;
  const accOn = (vehicle as any).accOn ?? true; // pas d'info acc dans le mock → défaut true
  const isOffline = vehicle.status === "offline";

  const badge = getStatusBadge(vehicle.status);
  const battColor = getBatteryColor(vehicle.battery);
  const firstLetter = (vehicle.name || "?")[0]?.toUpperCase() || "?";

  return (
    <div className="flex h-full flex-col bg-yazz-surface">
      {/* Header — style Flutter tracking_card.dart */}
      <div className="border-b border-yazz-border-light p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Avatar avec première lettre — Flutter CircleAvatar */}
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-yazz-primary/10">
              <span className="font-outfit text-[18px] font-bold text-yazz-primary">
                {firstLetter}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-outfit truncate text-[15px] font-bold tracking-[-0.02em] text-yazz-text-dark">
                {vehicle.name}
              </p>
              {/* Ligne contact + batterie — Flutter Row ligne 130-175 */}
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
            </div>
          </div>

          {/* Badge statut — Flutter _buildStatusBadge */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.bg, badge.color)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", badge.color.replace("text-", "bg-"))} />
              {badge.label}
            </span>
          </div>
        </div>

        {/* Bouton fermer */}
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
        <button className="font-inter flex flex-col items-center gap-1 rounded-yazz-md bg-yazz-info/10 py-2.5 text-yazz-info transition-all hover:bg-yazz-info/15 active:scale-95">
          <Share2 className="h-[18px] w-[18px]" />
          <span className="text-[10px] font-semibold">Partager</span>
        </button>
        <button className="font-inter flex flex-col items-center gap-1 rounded-yazz-md bg-yazz-accent py-2.5 text-yazz-primary transition-all hover:bg-yazz-primary/15 active:scale-95">
          <Settings className="h-[18px] w-[18px]" />
          <span className="text-[10px] font-semibold">Configurer</span>
        </button>
      </div>

      {/* Body — info lines style Flutter _infoLine */}
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
              {vehicle.speed > 0 ? `${vehicle.speed.toFixed(1)} km/h` : "À l'arrêt"}
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
            <p className={cn("font-inter text-[12px] leading-snug", isOffline ? "text-yazz-text-muted" : "text-yazz-text-dark")}>
              {vehicle.address && vehicle.address !== "—" ? vehicle.address : "Localisation en cours…"}
            </p>
            {vehicle.lat && vehicle.lng && (
              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                {vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}
              </p>
            )}
          </div>
        </div>

        {/* Stats supplémentaires */}
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

        {/* IMEI */}
        <div className="mt-4 rounded-yazz-md bg-yazz-background/60 p-2.5">
          <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">IMEI</p>
          <p className="font-mono text-[12px] font-bold text-yazz-text-dark">{vehicle.imei}</p>
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

      {/* Modal Coupe-moteur */}
      {showEngineCut && (
        <YazzEngineCutModal
          deviceId={vehicle.imei || vehicle.id}
          deviceName={vehicle.name}
          currentCutState={isCut}
          speed={vehicle.speed}
          onClose={() => setShowEngineCut(false)}
          onSuccess={(newState) => {
            console.log("[engine-cut] succès, nouvel état:", newState);
            setShowEngineCut(false);
          }}
        />
      )}
    </div>
  );
}
