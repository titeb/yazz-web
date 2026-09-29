"use client";

import {
  AlertTriangle,
  Bell,
  Clock,
  ChevronRight,
  MapPin,
  Gauge,
  ShieldAlert,
  Battery,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/lib/yazz/mock-data";

type YazzAlertsFeedProps = {
  alerts: AlertItem[];
};

const typeConfig: Record<
  AlertItem["type"],
  { icon: LucideIcon; color: string; bg: string }
> = {
  geofence: { icon: MapPin, color: "text-yazz-info", bg: "bg-yazz-info/10" },
  speed: { icon: Gauge, color: "text-yazz-crawling", bg: "bg-yazz-crawling/10" },
  battery: { icon: Battery, color: "text-yazz-warning", bg: "bg-yazz-warning/10" },
  parking: { icon: ShieldAlert, color: "text-yazz-error", bg: "bg-yazz-error/10" },
  sos: { icon: Siren, color: "text-yazz-error", bg: "bg-yazz-error/10" },
};

const severityConfig: Record<AlertItem["severity"], string> = {
  info: "border-l-yazz-info",
  warning: "border-l-yazz-warning",
  critical: "border-l-yazz-error",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h}h`;
}

export function YazzAlertsFeed({ alerts }: YazzAlertsFeedProps) {
  return (
    <div className="flex h-full flex-col bg-yazz-surface">
      <div className="flex items-center justify-between border-b border-yazz-border-light px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="h-[18px] w-[18px] text-yazz-text-body" />
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-yazz-error yazz-blink" />
          </div>
          <div>
            <h3 className="font-outfit text-[14px] font-bold tracking-[-0.01em] text-yazz-text-dark">Alertes récentes</h3>
            <p className="font-inter text-[11px] text-yazz-text-caption">
              {alerts.length} non lues · {alerts.filter((a) => a.severity === "critical").length} critiques
            </p>
          </div>
        </div>
        <button className="font-inter text-[11px] font-semibold text-yazz-primary hover:underline">
          Tout voir
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1.5">
          {alerts.map((a) => {
            const cfg = typeConfig[a.type];
            const Icon = cfg.icon;
            return (
              <li key={a.id}>
                <button
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-yazz-md border-l-2 bg-yazz-background/50 p-3 text-left transition-all hover:bg-yazz-accent/60",
                    severityConfig[a.severity],
                  )}
                >
                  <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-yazz-lg", cfg.bg)}>
                    <Icon className={cn("h-[18px] w-[18px]", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-outfit truncate text-[12px] font-semibold tracking-[-0.01em] text-yazz-text-dark">
                        {a.vehicleName}
                      </p>
                      <span className="font-inter shrink-0 text-[10px] text-yazz-text-caption">
                        {timeAgo(a.ts)}
                      </span>
                    </div>
                    <p className="font-inter mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-yazz-text-muted">
                      {a.label}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-outfit rounded-full bg-yazz-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-yazz-text-caption">
                        {a.plate}
                      </span>
                      <span
                        className={cn(
                          "font-inter flex items-center gap-1 text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100",
                          "text-yazz-primary",
                        )}
                      >
                        Détails
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {alerts.length === 0 && (
          <div className="grid place-items-center py-10 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-yazz-success/10">
              <Bell className="h-5 w-5 text-yazz-success" />
            </div>
            <p className="font-outfit mt-3 text-[13px] font-semibold text-yazz-text-dark">
              Aucune alerte
            </p>
            <p className="font-inter mt-1 text-[11px] text-yazz-text-muted">
              Tout est sous contrôle
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
