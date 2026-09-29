"use client";

import {
  Navigation,
  AlertTriangle,
  Battery,
  Clock,
  MoreHorizontal,
  MapPin,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@/lib/yazz/mock-data";

type YazzVehicleListProps = {
  vehicles: Vehicle[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

const statusConfig: Record<VehicleStatus, {
  dot: string;
  badge: string;
  badgeLabel: string;
}> = {
  moving: {
    dot: "bg-yazz-primary",
    badge: "bg-yazz-primary/10 text-yazz-primary",
    badgeLabel: "En mouvement",
  },
  idle: {
    dot: "bg-yazz-text-muted",
    badge: "bg-yazz-text-muted/10 text-yazz-text-muted",
    badgeLabel: "À l'arrêt",
  },
  offline: {
    dot: "bg-yazz-text-caption",
    badge: "bg-yazz-text-caption/10 text-yazz-text-caption",
    badgeLabel: "Hors-ligne",
  },
  alert: {
    dot: "bg-yazz-error yazz-blink",
    badge: "bg-yazz-error/10 text-yazz-error",
    badgeLabel: "Alerte",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h}h`;
}

export function YazzVehicleList({ vehicles, selectedId, onSelect }: YazzVehicleListProps) {
  return (
    <div className="flex h-full flex-col bg-yazz-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-yazz-border-light px-4 py-3">
        <div>
          <h3 className="font-outfit text-[14px] font-bold tracking-[-0.01em] text-yazz-text-dark">Mes véhicules</h3>
          <p className="font-inter text-[11px] text-yazz-text-caption">
            {vehicles.length} véhicules · {vehicles.filter((v) => v.status === "moving").length} actifs
          </p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {vehicles.map((v) => {
            const cfg = statusConfig[v.status];
            const isSelected = v.id === selectedId;
            return (
              <li key={v.id}>
                <button
                  onClick={() => onSelect?.(v.id)}
                  className={cn(
                    "group w-full rounded-yazz-md p-3 text-left transition-all duration-200",
                    isSelected
                      ? "bg-yazz-primary/8 ring-1 ring-yazz-primary/30"
                      : "hover:bg-yazz-accent",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="relative mt-0.5">
                      <div className={cn("grid h-9 w-9 place-items-center rounded-yazz-lg", cfg.badge)}>
                        {v.status === "alert" ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <Navigation
                            className="h-4 w-4"
                            style={{ transform: `rotate(${v.heading}deg)` }}
                          />
                        )}
                      </div>
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-yazz-surface",
                          cfg.dot,
                        )}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-outfit truncate text-[13px] font-semibold tracking-[-0.01em] text-yazz-text-dark">
                          {v.name}
                        </p>
                        <span className="font-outfit shrink-0 text-[10px] font-bold uppercase tracking-wide text-yazz-text-caption">
                          {v.plate}
                        </span>
                      </div>

                      <p className="font-inter mt-0.5 flex items-center gap-1 truncate text-[11px] text-yazz-text-muted">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{v.address}</span>
                      </p>

                      {/* Stats line */}
                      <div className="font-inter mt-2 flex items-center gap-2">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", cfg.badge)}>
                          {cfg.badgeLabel}
                        </span>

                        {v.speed > 0 && (
                          <span className="font-outfit flex items-center gap-0.5 text-[10px] font-semibold text-yazz-primary">
                            <Zap className="h-2.5 w-2.5" />
                            {v.speed} km/h
                          </span>
                        )}

                        <span className="font-inter flex items-center gap-0.5 text-[10px] text-yazz-text-caption">
                          <Battery className="h-2.5 w-2.5" />
                          {v.battery}%
                        </span>

                        <span className="font-inter ml-auto flex items-center gap-0.5 text-[10px] text-yazz-text-caption">
                          <Clock className="h-2.5 w-2.5" />
                          {timeAgo(v.lastUpdate)}
                        </span>
                      </div>
                    </div>
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
