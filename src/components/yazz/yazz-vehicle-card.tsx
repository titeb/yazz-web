"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Navigation,
  AlertTriangle,
  Battery,
  Zap,
  Clock,
  Car,
} from "lucide-react";
import type { Vehicle, VehicleStatus } from "@/lib/yazz/mock-data";

type YazzVehicleCardProps = {
  vehicles: Vehicle[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

const statusConfig: Record<VehicleStatus, {
  dot: string;
  bg: string;
  badgeLabel: string;
  badgeClass: string;
}> = {
  // Flutter yazz user : tous bleu primary, sauf alerte rouge
  // L'opacité distingue online vs offline
  moving: {
    dot: "bg-yazz-primary",
    bg: "bg-yazz-primary/10",
    badgeLabel: "Mouvement",
    badgeClass: "bg-yazz-primary/10 text-yazz-primary",
  },
  idle: {
    dot: "bg-yazz-primary",
    bg: "bg-yazz-primary/10",
    badgeLabel: "Arrêt",
    badgeClass: "bg-yazz-primary/10 text-yazz-primary",
  },
  offline: {
    dot: "bg-yazz-primary opacity-30",
    bg: "bg-yazz-primary/5",
    badgeLabel: "Hors-ligne",
    badgeClass: "bg-yazz-text-caption/10 text-yazz-text-caption",
  },
  alert: {
    dot: "bg-yazz-error yazz-blink",
    bg: "bg-yazz-error/10",
    badgeLabel: "Alerte",
    badgeClass: "bg-yazz-error/10 text-yazz-error",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}j`;
}

export function YazzVehicleCard({ vehicles, selectedId, onSelect }: YazzVehicleCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const counts = useMemo(() => ({
    total: vehicles.length,
    moving: vehicles.filter((v) => v.status === "moving").length,
    alert: vehicles.filter((v) => v.status === "alert").length,
  }), [vehicles]);

  return (
    <div className="flex max-h-[calc(100vh-180px)] w-[260px] flex-col overflow-hidden rounded-yazz-xl border border-yazz-border-light bg-yazz-surface/95 yazz-glass yazz-shadow-elevated">
      {/* Header — cliquable pour collapse */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between gap-2 border-b border-yazz-border-light px-3 py-2.5 transition-colors hover:bg-yazz-accent/50"
      >
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-yazz-lg yazz-gradient-primary text-white">
            <Car className="h-3.5 w-3.5" />
          </div>
          <div className="text-left">
            <p className="font-outfit text-[12px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Mes véhicules
            </p>
            <p className="font-inter text-[10px] text-yazz-text-caption">
              {counts.total} · {counts.moving} en mouvement
              {counts.alert > 0 && (
                <span className="ml-1 text-yazz-error">· {counts.alert} alerte{counts.alert > 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-yazz-text-muted">
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </button>

      {/* Liste des véhicules */}
      {!collapsed && (
        <ul className="flex-1 overflow-y-auto p-1.5">
          {vehicles.length === 0 && (
            <li className="py-6 text-center">
              <p className="font-inter text-[11px] text-yazz-text-caption">Aucun véhicule</p>
            </li>
          )}
          {vehicles.map((v) => {
            const cfg = statusConfig[v.status];
            const isSelected = v.id === selectedId;
            return (
              <li key={v.id}>
                <button
                  onClick={() => onSelect?.(v.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-yazz-sm p-2 text-left transition-all",
                    isSelected ? "bg-yazz-primary/8 ring-1 ring-yazz-primary/30" : "hover:bg-yazz-accent/60"
                  )}
                >
                  {/* Status icon — style carré arrondi comme modal options */}
                  <div className="relative mt-0.5 shrink-0">
                    <div className={cn("grid h-9 w-9 place-items-center rounded-[14px]", cfg.bg)}>
                      {v.status === "alert" ? (
                        <AlertTriangle className={cn("h-[18px] w-[18px]", cfg.badgeClass.split(" ")[1])} />
                      ) : (
                        <Navigation
                          className={cn("h-[18px] w-[18px]", cfg.badgeClass.split(" ")[1])}
                          style={{ transform: `rotate(${v.heading || 0}deg)` }}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-yazz-surface",
                        cfg.dot
                      )}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-outfit truncate text-[12px] font-semibold tracking-[-0.01em] text-yazz-text-dark">
                      {v.name}
                    </p>
                    {v.plate && v.plate !== "—" && (
                      <p className="font-outfit text-[9px] font-bold uppercase tracking-wide text-yazz-text-caption">
                        {v.plate}
                      </p>
                    )}

                    {/* Stats line */}
                    <div className="mt-1 flex items-center gap-1.5">
                      {v.status === "offline" ? (
                        <span className="font-outfit text-[10px] font-semibold text-yazz-text-caption">
                          Hors-ligne
                        </span>
                      ) : v.speed > 0 ? (
                        <span className="font-outfit flex items-center gap-0.5 text-[10px] font-bold text-yazz-primary">
                          <Zap className="h-2.5 w-2.5" />
                          {v.speed} km/h
                        </span>
                      ) : v.status === "alert" ? (
                        <span className="font-outfit text-[10px] font-semibold text-yazz-error">
                          Alerte
                        </span>
                      ) : (
                        <span className="font-outfit text-[10px] font-semibold text-yazz-text-muted">
                          À l'arrêt
                        </span>
                      )}
                      <span className="font-inter flex items-center gap-0.5 text-[10px] text-yazz-text-caption">
                        <Battery className="h-2.5 w-2.5" />
                        {v.battery ?? "—"}%
                      </span>
                      <span className="font-inter ml-auto flex items-center gap-0.5 text-[10px] text-yazz-text-caption">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(v.lastUpdate)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
