"use client";

import { useState } from "react";
import { Construction, Bell, Trash2, CheckCheck, Loader2, AlertTriangle, X } from "lucide-react";
import { useUserAlerts, type AlertItem } from "@/hooks/use-user-alerts";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function AlertsPage() {
  const isReady = isSupabaseConfigured();
  const { alerts, unreadCount, loading, error, markAllAsRead, deleteAlert, deleteAllRead } = useUserAlerts(50);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearRead, setConfirmClearRead] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const readCount = alerts.filter((a) => a.isRead).length;

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const r = await deleteAlert(id);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (r.success) {
      showFeedback("success", "Notification supprimée");
    } else {
      showFeedback("error", r.error || "Erreur lors de la suppression");
    }
  };

  const handleClearRead = async () => {
    setClearing(true);
    setConfirmClearRead(false);
    const r = await deleteAllRead();
    setClearing(false);
    if (r.success) {
      showFeedback("success", r.count ? `${r.count} notification${r.count > 1 ? "s" : ""} supprimée${r.count > 1 ? "s" : ""}` : "Aucune notification à supprimer");
    } else {
      showFeedback("error", r.error || "Erreur");
    }
  };

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
          <div className="flex flex-wrap items-center gap-2">
            {isReady && unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="font-inter flex items-center gap-1.5 rounded-yazz-sm bg-yazz-primary px-3 py-2 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 active:scale-95"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout marquer lu
              </button>
            )}
            {isReady && readCount > 0 && (
              <button
                onClick={() => setConfirmClearRead(true)}
                disabled={clearing}
                className="font-inter flex items-center gap-1.5 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface px-3 py-2 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-error/10 hover:border-yazz-error/40 hover:text-yazz-error disabled:opacity-50"
              >
                {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Supprimer les lues{readCount > 0 ? ` (${readCount})` : ""}
              </button>
            )}
          </div>
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

        {/* Feedback toast */}
        {feedback && (
          <div
            className={cn(
              "mb-4 rounded-yazz-md border-l-4 p-3 yazz-animate-fade-in-up",
              feedback.type === "success"
                ? "border-l-yazz-success bg-yazz-success/10"
                : "border-l-yazz-error bg-yazz-error/10"
            )}
          >
            <p
              className={cn(
                "font-inter text-[12px] font-semibold",
                feedback.type === "success" ? "text-yazz-success" : "text-yazz-error"
              )}
            >
              {feedback.message}
            </p>
          </div>
        )}

        {/* Loading */}
        {isReady && loading && alerts.length === 0 && (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yazz-primary" />
          </div>
        )}

        {/* Empty state */}
        {isReady && alerts.length === 0 && !loading && (
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
              <AlertRow
                key={a.id}
                alert={a}
                onAskDelete={() => setConfirmDeleteId(a.id)}
                isConfirming={confirmDeleteId === a.id}
                onConfirmDelete={() => handleDelete(a.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                isDeleting={deletingId === a.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Modal confirmation : supprimer toutes les lues */}
      {confirmClearRead && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setConfirmClearRead(false)}
        >
          <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg bg-yazz-error/10">
                <AlertTriangle className="h-5 w-5 text-yazz-error" />
              </div>
              <div>
                <h2 className="font-outfit text-[15px] font-bold text-yazz-text-dark">
                  Supprimer les notifications lues ?
                </h2>
                <p className="font-inter text-[11px] text-yazz-text-muted">
                  {readCount} notification{readCount > 1 ? "s" : ""} seront supprimée{readCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <p className="font-inter mb-4 text-[12px] leading-relaxed text-yazz-text-muted">
              Cette action est irréversible. Les notifications non lues seront conservées.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClearRead(false)}
                className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-accent"
              >
                Annuler
              </button>
              <button
                onClick={handleClearRead}
                disabled={clearing}
                className="font-inter flex flex-1 items-center justify-center gap-1.5 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white transition-all hover:bg-yazz-error/90 disabled:opacity-50 active:scale-95"
              >
                {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Ligne d'alerte avec bouton supprimer + confirmation inline
// ============================================================
function AlertRow({
  alert,
  onAskDelete,
  isConfirming,
  onConfirmDelete,
  onCancelDelete,
  isDeleting,
}: {
  alert: AlertItem;
  onAskDelete: () => void;
  isConfirming: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-yazz-md border-l-2 bg-yazz-surface p-3 yazz-shadow-soft transition-all",
        alert.severity === "critical"
          ? "border-l-yazz-error"
          : alert.severity === "warning"
            ? "border-l-yazz-warning"
            : "border-l-yazz-info",
        !alert.isRead ? "ring-1 ring-yazz-primary/20" : "opacity-70",
        isConfirming && "ring-2 ring-yazz-error/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">{alert.title}</p>
          <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
            {alert.vehicleName} · {alert.plate || "—"}
          </p>
          <p className="font-inter mt-1 text-[11px] leading-relaxed text-yazz-text-body">{alert.message}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-inter text-[10px] text-yazz-text-caption">
            {new Date(alert.createdAt).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {!alert.isRead && (
            <span className="rounded-full bg-yazz-primary/15 px-2 py-0.5 text-[9px] font-bold text-yazz-primary">
              Non lu
            </span>
          )}
          {/* Bouton supprimer */}
          {!isConfirming && (
            <button
              onClick={onAskDelete}
              disabled={isDeleting}
              aria-label="Supprimer"
              className="mt-1 grid h-6 w-6 place-items-center rounded-yazz-sm text-yazz-text-caption transition-colors hover:bg-yazz-error/10 hover:text-yazz-error disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation inline */}
      {isConfirming && (
        <div className="mt-3 flex items-center gap-2 rounded-yazz-sm bg-yazz-error/5 p-2 yazz-animate-fade-in-up">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yazz-error" />
          <p className="font-inter flex-1 text-[11px] font-medium text-yazz-text-body">
            Supprimer cette notification ?
          </p>
          <button
            onClick={onCancelDelete}
            className="font-inter rounded-yazz-sm px-2 py-1 text-[10px] font-semibold text-yazz-text-muted hover:bg-yazz-accent"
          >
            Non
          </button>
          <button
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="font-inter flex items-center gap-1 rounded-yazz-sm bg-yazz-error px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-yazz-error/90 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Supprimer
          </button>
        </div>
      )}
    </li>
  );
}
