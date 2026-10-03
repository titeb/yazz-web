"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastData = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
};

type YazzToastContainerProps = {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
};

const toastConfig: Record<ToastType, { icon: any; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2, color: "text-yazz-success", bg: "bg-yazz-success/10", border: "border-l-yazz-success" },
  error: { icon: AlertTriangle, color: "text-yazz-error", bg: "bg-yazz-error/10", border: "border-l-yazz-error" },
  warning: { icon: AlertTriangle, color: "text-yazz-warning", bg: "bg-yazz-warning/10", border: "border-l-yazz-warning" },
  info: { icon: Info, color: "text-yazz-info", bg: "bg-yazz-info/10", border: "border-l-yazz-info" },
};

export function YazzToastContainer({ toasts, onDismiss }: YazzToastContainerProps) {
  return (
    <div className="fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map((toast) => (
        <YazzToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function YazzToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const cfg = toastConfig[toast.type];
  const Icon = cfg.icon;

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 10);
    // Auto dismiss after 4s
    const dismissT = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 4000);
    return () => {
      clearTimeout(t);
      clearTimeout(dismissT);
    };
  }, [onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-yazz-xl border-l-4 bg-yazz-surface p-3.5 yazz-shadow-elevated transition-all duration-300",
        cfg.border,
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-8 opacity-0"
      )}
    >
      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-yazz-lg", cfg.bg)}>
        <Icon className={cn("h-4 w-4", cfg.color)} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
          {toast.title}
        </p>
        {toast.message && (
          <p className="font-inter mt-0.5 text-[11px] leading-relaxed text-yazz-text-muted">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-yazz-sm text-yazz-text-caption hover:bg-yazz-accent"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Hook utilitaire pour gérer les toasts
export function useYazzToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = (type: ToastType, title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, showToast, dismissToast };
}
