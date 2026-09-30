"use client";

import { useState, useMemo } from "react";
import {
  Navigation,
  Crosshair,
  Layers,
  Plus,
  Minus,
  Maximize2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@/lib/yazz/mock-data";

type YazzMapPanelProps = {
  vehicles: Vehicle[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

const statusConfig: Record<VehicleStatus, {
  color: string;
  ring: string;
  bg: string;
  label: string;
}> = {
  moving: {
    color: "#2B44EE",
    ring: "shadow-[0_0_0_4px_rgba(43,68,238,0.2)]",
    bg: "bg-yazz-primary",
    label: "En mouvement",
  },
  idle: {
    color: "#5A5F8A",
    ring: "shadow-[0_0_0_4px_rgba(90,95,138,0.18)]",
    bg: "bg-yazz-text-muted",
    label: "À l'arrêt",
  },
  offline: {
    color: "#888CA8",
    ring: "shadow-[0_0_0_2px_rgba(136,140,168,0.15)]",
    bg: "bg-yazz-text-caption",
    label: "Hors-ligne",
  },
  alert: {
    color: "#E53E3E",
    ring: "shadow-[0_0_0_4px_rgba(229,62,62,0.25)]",
    bg: "bg-yazz-error",
    label: "Alerte",
  },
};

function MapButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-yazz-sm bg-yazz-surface text-yazz-text-body shadow-yazz-soft transition-all",
        "hover:bg-yazz-accent hover:text-yazz-primary active:scale-95",
        active && "bg-yazz-primary text-white hover:bg-yazz-primary hover:text-white",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function YazzMapPanel({ vehicles, selectedId, onSelect }: YazzMapPanelProps) {
  const [filter, setFilter] = useState<VehicleStatus | "all">("all");

  const filteredVehicles = useMemo(() => {
    if (filter === "all") return vehicles;
    return vehicles.filter((v) => v.status === filter);
  }, [vehicles, filter]);

  const movingCount = vehicles.filter((v) => v.status === "moving").length;
  const idleCount = vehicles.filter((v) => v.status === "idle").length;
  const alertCount = vehicles.filter((v) => v.status === "alert").length;
  const offlineCount = vehicles.filter((v) => v.status === "offline").length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-yazz-xl bg-yazz-surface yazz-shadow-soft">
      {/* Carte — fond grid + routes simulées */}
      <div className="absolute inset-0 yazz-map-grid">
        {/* "Rivière" — style Congo */}
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="river-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3182CE" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3182CE" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          {/* Routes principales simulées */}
          <path
            d="M 5 50 Q 25 40 50 50 T 95 45"
            stroke="rgba(43, 68, 238, 0.15)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 50 5 Q 55 30 50 50 Q 45 70 50 95"
            stroke="rgba(43, 68, 238, 0.12)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 10 20 L 40 30 L 70 25 L 90 40"
            stroke="rgba(43, 68, 238, 0.1)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 15 75 L 50 70 L 85 80"
            stroke="rgba(43, 68, 238, 0.1)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Rivière */}
          <path
            d="M 0 65 Q 20 60 35 68 Q 55 78 80 70 Q 95 65 100 70 L 100 100 L 0 100 Z"
            fill="url(#river-grad)"
          />
          <path
            d="M 0 65 Q 20 60 35 68 Q 55 78 80 70 Q 95 65 100 70"
            stroke="rgba(49, 130, 206, 0.4)"
            strokeWidth="0.5"
            fill="none"
          />

          {/* Quartiers (labels) */}
          <text x="38" y="38" fill="rgba(90, 95, 138, 0.5)" fontSize="2.4" fontWeight="600">
            GOMBE
          </text>
          <text x="60" y="22" fill="rgba(90, 95, 138, 0.4)" fontSize="2.2" fontWeight="600">
            LIMETE
          </text>
          <text x="44" y="62" fill="rgba(90, 95, 138, 0.4)" fontSize="2.2" fontWeight="600">
            LEMBA
          </text>
          <text x="18" y="48" fill="rgba(90, 95, 138, 0.4)" fontSize="2" fontWeight="600">
            KALAMU
          </text>
          <text x="68" y="58" fill="rgba(90, 95, 138, 0.4)" fontSize="2" fontWeight="600">
            MONT-NGAFUL
          </text>
        </svg>
      </div>

      {/* Header overlay */}
      <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-yazz-sm bg-yazz-surface/90 px-3 py-2 yazz-glass">
          <Crosshair className="h-4 w-4 text-yazz-primary" />
          <span className="font-outfit text-[12px] font-semibold text-yazz-text-dark">Kinshasa</span>
          <span className="font-inter text-[10px] text-yazz-text-caption">Live</span>
          <span className="ml-1 h-2 w-2 rounded-full bg-yazz-success yazz-blink" />
        </div>

        {/* Filter pills */}
        <div className="hidden items-center gap-1 rounded-yazz-sm bg-yazz-surface/90 p-1 yazz-glass md:flex">
          {([
            { id: "all", label: "Tous", count: vehicles.length },
            { id: "moving", label: "Mouvement", count: movingCount },
            { id: "idle", label: "Arrêt", count: idleCount },
            { id: "alert", label: "Alerte", count: alertCount },
            { id: "offline", label: "Hors-ligne", count: offlineCount },
          ] as const).map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as VehicleStatus | "all")}
                className={cn(
                  "font-inter rounded-yazz-xs px-2.5 py-1.5 text-[11px] font-semibold transition-all",
                  active
                    ? "bg-yazz-primary text-white shadow-yazz-soft"
                    : "text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary",
                )}
              >
                {f.label}
                <span className={cn("ml-1.5", active ? "opacity-80" : "opacity-50")}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Map controls (zoom, layers, etc.) */}
      <div className="absolute right-4 top-20 z-20 flex flex-col gap-1.5">
        <MapButton icon={Plus} label="Zoom +" />
        <MapButton icon={Minus} label="Zoom -" />
        <div className="my-1 h-px w-full bg-yazz-border-light" />
        <MapButton icon={Layers} label="Couches" />
        <MapButton icon={Crosshair} label="Localiser" />
        <MapButton icon={Maximize2} label="Plein écran" />
      </div>

      {/* Vehicles markers */}
      <div className="absolute inset-0 z-10">
        {filteredVehicles.map((v) => {
          const cfg = statusConfig[v.status];
          const isSelected = v.id === selectedId;
          const isAlert = v.status === "alert";
          return (
            <button
              key={v.id}
              onClick={() => onSelect?.(v.id)}
              className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer outline-none"
              style={{ left: `${v.position.x}%`, top: `${v.position.y}%` }}
              aria-label={v.name}
            >
              {/* Pulse ring for moving & alert vehicles */}
              {(v.status === "moving" || v.status === "alert") && (
                <span
                  className={cn(
                    "absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full",
                    isAlert ? "bg-yazz-error/30" : "bg-yazz-primary/25",
                  )}
                  style={{ animation: "yazz-pulse-ring 2.4s ease-out infinite" }}
                />
              )}

              {/* Marker */}
              <div
                className={cn(
                  "relative grid h-9 w-9 place-items-center rounded-full text-white transition-all duration-200",
                  cfg.bg,
                  cfg.ring,
                  "group-hover:scale-110 group-active:scale-95",
                  isSelected && "scale-125 ring-4 ring-yazz-primary/40",
                  v.status === "moving" && "yazz-animate-marker-bounce",
                )}
              >
                {isAlert ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Navigation
                    className="h-4 w-4"
                    style={{ transform: `rotate(${v.heading}deg)` }}
                  />
                )}
              </div>

              {/* Tooltip on hover */}
              <div
                className={cn(
                  "pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2",
                  "min-w-[180px] rounded-yazz-md bg-yazz-surface p-2.5 yazz-shadow-elevated",
                  "opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                  "border border-yazz-border-light",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-outfit text-[11px] font-semibold text-yazz-text-dark">{v.name}</p>
                  <span className={cn("font-inter rounded-full px-1.5 py-0.5 text-[9px] font-bold", cfg.bg, "text-white")}>
                    {cfg.label}
                  </span>
                </div>
                <p className="font-inter mt-0.5 truncate text-[10px] text-yazz-text-muted">{v.address}</p>
                <div className="font-inter mt-1.5 flex items-center justify-between text-[10px]">
                  <span className="font-outfit font-semibold text-yazz-primary">
                    {v.speed > 0 ? `${v.speed} km/h` : "À l'arrêt"}
                  </span>
                  <span className="text-yazz-text-caption">Batt: {v.battery}%</span>
                </div>
              </div>

              {/* Plate badge below marker */}
              <div
                className={cn(
                  "font-outfit absolute left-1/2 top-[42px] -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide",
                  isSelected
                    ? "bg-yazz-primary text-white"
                    : "bg-yazz-surface/90 text-yazz-text-body yazz-glass",
                )}
              >
                {v.plate}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend bottom-left */}
      <div className="absolute bottom-4 left-4 z-20 rounded-yazz-sm bg-yazz-surface/95 p-2.5 yazz-glass">
        <p className="font-inter mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-yazz-text-caption">
          Légende
        </p>
        <ul className="space-y-1">
          {(
            [
              { id: "moving", label: "En mouvement", color: "bg-yazz-primary" },
              { id: "idle", label: "À l'arrêt", color: "bg-yazz-text-muted" },
              { id: "alert", label: "Alerte active", color: "bg-yazz-error" },
              { id: "offline", label: "Hors-ligne", color: "bg-yazz-text-caption" },
            ] as const
          ).map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", l.color)} />
              <span className="font-inter text-[11px] font-medium text-yazz-text-body">{l.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Scale bottom-right */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-yazz-sm bg-yazz-surface/95 px-2.5 py-1.5 yazz-glass">
        <span className="font-outfit text-[10px] font-semibold text-yazz-text-muted">2 km</span>
        <div className="h-1.5 w-12 border-b-2 border-l-2 border-r-2 border-yazz-text-muted" />
      </div>
    </div>
  );
}
