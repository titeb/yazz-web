"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type LoadingState = {
  visible: boolean;
  message?: string;
};

type GlobalLoadingProps = {
  state: LoadingState;
};

/**
 * Loading overlay global — s'affiche au-dessus de TOUT (z-[200])
 * avec backdrop blur. Utilisé pendant :
 * - Navigation entre pages
 * - Appels API (engine cut, payments, etc.)
 * - Toute opération async
 *
 * Animations :
 * - Backdrop: fade-in
 * - Card: fade-in-up
 * - Spinner: rotate
 */
export function GlobalLoading({ state }: GlobalLoadingProps) {
  if (!state.visible || typeof window === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-yazz-text-dark/30 backdrop-blur-sm yazz-animate-fade-in" />

      {/* Loading card */}
      <div className="relative flex flex-col items-center gap-4 rounded-yazz-xl bg-yazz-surface px-8 py-6 yazz-shadow-high yazz-animate-fade-in-up">
        {/* Spinner */}
        <div className="relative grid h-12 w-12 place-items-center">
          <div className="absolute inset-0 rounded-full border-2 border-yazz-border-light" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-yazz-primary animate-spin" />
        </div>

        {/* Message */}
        {state.message && (
          <p className="font-inter text-[13px] font-medium text-yazz-text-dark">
            {state.message}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Hook utilitaire pour gérer le loading global.
 * Usage:
 *   const { showLoading, hideLoading, loading } = useGlobalLoading();
 *   <GlobalLoading state={loading} />
 *   showLoading("Envoi de la commande...");
 *   await apiCall();
 *   hideLoading();
 */
export function useGlobalLoading() {
  const [loading, setLoading] = useState<LoadingState>({ visible: false });

  const showLoading = (message?: string) => {
    setLoading({ visible: true, message });
  };

  const hideLoading = () => {
    setLoading({ visible: false });
  };

  return { loading, showLoading, hideLoading };
}
