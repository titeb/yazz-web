"use client";

import { useUserStats } from "@/hooks/use-user-stats";
import { useUserAlerts } from "@/hooks/use-user-alerts";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { YazzStatCard } from "@/components/yazz/yazz-stat-card";
import { stats as mockStats } from "@/lib/yazz/mock-data";
import { Database, AlertTriangle } from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

export default function StatsPage() {
  const isReady = isSupabaseConfigured();
  const { stats: realStats, loading } = useUserStats();
  const { alerts, unreadCount } = useUserAlerts(10);

  const stats = !isReady ? mockStats : [
    {
      id: "s1",
      label: "Total véhicules",
      value: String(realStats.totalVehicles),
      delta: realStats.totalVehicles > 0 ? `${realStats.totalVehicles} actif${realStats.totalVehicles > 1 ? "s" : ""}` : undefined,
      trend: "up" as const,
      icon: "car" as const,
      accent: "primary" as const,
    },
    {
      id: "s2",
      label: "En mouvement",
      value: String(realStats.movingVehicles),
      delta:
        realStats.totalVehicles > 0
          ? `${Math.round((realStats.movingVehicles / Math.max(realStats.totalVehicles, 1)) * 100)}% actif`
          : undefined,
      trend: "up" as const,
      icon: "moving" as const,
      accent: "success" as const,
    },
    {
      id: "s3",
      label: "Alertes actives",
      value: String(realStats.activeAlerts),
      delta: realStats.activeAlerts > 0 ? "non lues" : "rien à signaler",
      trend: realStats.activeAlerts > 0 ? ("up" as const) : ("flat" as const),
      icon: "alert" as const,
      accent: realStats.activeAlerts > 0 ? ("warning" as const) : ("success" as const),
    },
    {
      id: "s4",
      label: "Crédit solde",
      value: realStats.creditIsActive
        ? `${realStats.creditBalance.toLocaleString("fr-FR")} ${realStats.creditCurrency}`
        : "Inactif",
      delta: realStats.daysUntilExpiry !== null ? `${realStats.daysUntilExpiry}j restants` : undefined,
      trend: realStats.daysUntilExpiry !== null && realStats.daysUntilExpiry < 3 ? ("down" as const) : ("flat" as const),
      icon: "credit" as const,
      accent: realStats.daysUntilExpiry !== null && realStats.daysUntilExpiry < 3 ? ("warning" as const) : ("info" as const),
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
            Statistiques
          </h1>
          <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
            Vue d'ensemble de votre flotte YAZZ en temps réel.
          </p>
        </div>

        {/* Mode démo */}
        {!isReady && (
          <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 shrink-0 text-yazz-warning" />
              <div>
                <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">Mode démo — Supabase non configuré</p>
                <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                  Les chiffres ci-dessous sont fictifs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <YazzStatCard key={s.id} {...s} />
          ))}
        </div>

        {/* Alertes récentes */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              Alertes récentes
            </h2>
            {isReady && unreadCount > 0 && (
              <span className="font-inter rounded-full bg-yazz-error/15 px-2.5 py-1 text-[10px] font-bold text-yazz-error">
                {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isReady && alerts.length === 0 && (
            <div className="grid place-items-center py-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-yazz-success/10">
                <AlertTriangle className="h-5 w-5 text-yazz-success" />
              </div>
              <p className="font-outfit mt-2 text-[14px] font-semibold text-yazz-text-dark">
                Aucune alerte
              </p>
              <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
                Tout est sous contrôle.
              </p>
            </div>
          )}

          {isReady && alerts.length > 0 && (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-yazz-md border-l-2 bg-yazz-surface p-3 yazz-shadow-soft ${
                    a.severity === "critical" ? "border-l-yazz-error" :
                    a.severity === "warning" ? "border-l-yazz-warning" :
                    "border-l-yazz-info"
                  } ${!a.isRead ? "ring-1 ring-yazz-primary/20" : "opacity-70"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                        {a.title}
                      </p>
                      <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                        {a.vehicleName} · {a.plate || "—"}
                      </p>
                      <p className="font-inter mt-1 text-[11px] leading-relaxed text-yazz-text-body">
                        {a.message}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-inter text-[10px] text-yazz-text-caption">
                        {timeAgo(a.createdAt)}
                      </span>
                      {!a.isRead && (
                        <span className="rounded-full bg-yazz-primary/15 px-2 py-0.5 text-[9px] font-bold text-yazz-primary">
                          Non lu
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
