"use client";

import { Construction, Bell } from "lucide-react";
import { useUserAlerts } from "@/hooks/use-user-alerts";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function AlertsPage() {
  const isReady = isSupabaseConfigured();
  const { alerts, unreadCount, loading, error, markAllAsRead } = useUserAlerts(50);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              Alertes
            </h1>
            <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
              {isReady ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}` : "Mode démo"}
            </p>
          </div>
          {isReady && unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="font-inter rounded-yazz-sm bg-yazz-primary px-3 py-2 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 active:scale-95"
            >
              Tout marquer comme lu
            </button>
          )}
        </div>

        {/* Mode démo */}
        {!isReady && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <div className="flex items-start gap-3">
              <Construction className="h-5 w-5 shrink-0 text-yazz-warning" />
              <div>
                <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">Supabase non configuré</p>
                <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                  Configure les variables d'environnement pour voir les vraies alertes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-4">
            <p className="font-inter text-[12px] text-yazz-error">{error}</p>
          </div>
        )}

        {/* Liste */}
        {isReady && alerts.length === 0 && (
          <div className="grid place-items-center py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-success/10">
              <Bell className="h-6 w-6 text-yazz-success" />
            </div>
            <p className="font-outfit mt-3 text-[15px] font-semibold text-yazz-text-dark">Aucune alerte</p>
            <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">Tout est sous contrôle 🎉</p>
          </div>
        )}

        {/* Alerts list */}
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
                      {new Date(a.createdAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
  );
}
