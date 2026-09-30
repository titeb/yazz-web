"use client";

import { useState } from "react";
import {
  X,
  Navigation,
  Battery,
  Clock,
  Gauge,
  MapPin,
  Route,
  Power,
  Fuel,
  Thermometer,
  Settings,
  Share2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/lib/yazz/mock-data";
import { YazzEngineCutModal } from "./yazz-engine-cut-modal";

type YazzVehicleDetailProps = {
  vehicle: Vehicle;
  onClose?: () => void;
};

function StatItem({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Navigation;
  label: string;
  value: string;
  accent?: "primary" | "success" | "warning" | "error" | "info";
}) {
  const accentColor =
    accent === "primary" ? "text-yazz-primary"
    : accent === "success" ? "text-yazz-success"
    : accent === "warning" ? "text-yazz-warning"
    : accent === "error" ? "text-yazz-error"
    : accent === "info" ? "text-yazz-info"
    : "text-yazz-text-dark";

  return (
    <div className="flex items-center gap-3 rounded-yazz-md bg-yazz-background/60 p-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-yazz-lg bg-yazz-surface text-yazz-text-muted">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">{label}</p>
        <p className={cn("font-outfit text-[14px] font-bold tracking-[-0.01em]", accentColor)}>{value}</p>
      </div>
    </div>
  );
}

export function YazzVehicleDetail({ vehicle, onClose }: YazzVehicleDetailProps) {
  const [showEngineCut, setShowEngineCut] = useState(false);

  // Pour le mock (sans engineCutState), on suppose false (moteur non coupé)
  const engineCutState = (vehicle as any).engineCutState ?? false;
  const isCut = engineCutState === true;

  return (
    <div className="flex h-full flex-col bg-yazz-surface">
      {/* Header */}
      <div className="relative border-b border-yazz-border-light p-4">
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-yazz-lg bg-yazz-gradient-primary text-white shadow-yazz-medium">
            <Navigation
              className="h-5 w-5"
              style={{ transform: `rotate(${vehicle.heading}deg)` }}
            />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="font-outfit truncate text-[15px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              {vehicle.name}
            </h3>
            <p className="font-outfit text-[12px] font-semibold tracking-wide text-yazz-text-muted">
              {vehicle.plate}
            </p>
            <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
              IMEI: {vehicle.imei}
            </p>
          </div>
        </div>

        {/* Live status pill */}
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-yazz-success/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-yazz-success yazz-blink" />
          <span className="font-inter text-[11px] font-semibold text-yazz-success">
            Mise à jour il y a 30s
          </span>
        </div>
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
          <span className="text-[10px] font-semibold">
            {isCut ? "Restaurer" : "Coupe-moteur"}
          </span>
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

      {/* Live stats */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="font-inter mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-yazz-text-caption">
          État en temps réel
        </p>
        <div className="grid grid-cols-2 gap-2">
          <StatItem
            icon={Gauge}
            label="Vitesse"
            value={vehicle.speed > 0 ? `${vehicle.speed} km/h` : "À l'arrêt"}
            accent={vehicle.speed > 0 ? "primary" : undefined}
          />
          <StatItem
            icon={Battery}
            label="Batterie"
            value={`${vehicle.battery}%`}
            accent={vehicle.battery < 20 ? "error" : vehicle.battery < 50 ? "warning" : "success"}
          />
          <StatItem
            icon={Navigation}
            label="Cap"
            value={`${vehicle.heading}°`}
          />
          <StatItem
            icon={Route}
            label="Distance aujourd'hui"
            value={`${vehicle.todayDistanceKm} km`}
            accent="info"
          />
        </div>

        {/* Address block */}
        <div className="mt-3 rounded-yazz-md bg-yazz-gradient-subtle p-3">
          <p className="font-inter mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-yazz-text-caption">
            <MapPin className="h-3 w-3" />
            Position actuelle
          </p>
          <p className="font-inter text-[12px] font-medium leading-snug text-yazz-text-dark">
            {vehicle.address}
          </p>
        </div>

        {/* Driver */}
        {vehicle.driver && (
          <div className="mt-3 flex items-center gap-3 rounded-yazz-md border border-yazz-border-light p-3">
            <div className="font-outfit grid h-10 w-10 place-items-center rounded-full bg-yazz-gradient-primary text-xs font-bold text-white">
              {(vehicle.driver || "?").split(" ").map((p) => p[0]).join("").slice(0, 2) || "?"}
            </div>
            <div className="flex-1">
              <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">Conducteur</p>
              <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">{vehicle.driver}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-yazz-text-caption" />
          </div>
        )}

        {/* Alertes du véhicule */}
        {vehicle.alerts && vehicle.alerts.length > 0 && (
          <div className="mt-3">
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
                  <span className="font-inter text-[10px] text-yazz-text-caption">
                    <Clock className="mr-1 inline h-2.5 w-2.5" />
                    {new Date(alert.ts).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
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
            // TODO : mettre à jour le state parent (vehicle.engineCutState)
            console.log("[engine-cut] succès, nouvel état:", newState);
            setShowEngineCut(false);
          }}
        />
      )}
    </div>
  );
}
