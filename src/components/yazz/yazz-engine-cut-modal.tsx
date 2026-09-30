"use client";

import { useState } from "react";
import { Loader2, AlertTriangle, Power, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type YazzEngineCutModalProps = {
  deviceId: string;
  deviceName: string;
  currentCutState: boolean | null;
  speed: number | null;
  onClose: () => void;
  onSuccess?: (newState: boolean) => void;
};

type Step = "confirm" | "loading" | "success" | "error";

export function YazzEngineCutModal({
  deviceId,
  deviceName,
  currentCutState,
  speed,
  onClose,
  onSuccess,
}: YazzEngineCutModalProps) {
  const [step, setStep] = useState<Step>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const action = currentCutState ? "restore" : "cut";
  const isCut = currentCutState === true;

  // Safety check : si speed > 20 km/h, on bloque l'action
  const speedTooHigh = (speed ?? 0) > 20;

  const handleConfirm = async () => {
    if (speedTooHigh) {
      setErrorMessage(
        `Véhicule en mouvement (${speed} km/h). Le coupe-moteur est désactivé au-dessus de 20 km/h pour des raisons de sécurité.`
      );
      setStep("error");
      return;
    }

    setStep("loading");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/engine-cut`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Erreur ${res.status}`);
      }

      // ACK asynchrone côté backend — on attend ~3s pour confirmer
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStep("success");
      setTimeout(() => {
        onSuccess?.(action === "cut");
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("[engine-cut] erreur:", err);
      setErrorMessage(err.message || "Erreur lors de la commande");
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3 pr-8">
          <div className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg",
            isCut ? "bg-yazz-success/10 text-yazz-success" : "bg-yazz-error/10 text-yazz-error"
          )}>
            <Power className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
              {isCut ? "Restaurer le moteur" : "Couper le moteur"}
            </h2>
            <p className="font-inter text-[11px] text-yazz-text-muted">{deviceName}</p>
          </div>
        </div>

        {/* Content selon step */}
        {step === "confirm" && (
          <>
            <div className={cn(
              "rounded-yazz-sm border-l-4 p-3",
              isCut ? "border-l-yazz-success bg-yazz-success/5" : "border-l-yazz-error bg-yazz-error/5"
            )}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", isCut ? "text-yazz-success" : "text-yazz-error")} />
                <div>
                  <p className="font-inter text-[12px] font-semibold text-yazz-text-dark">
                    {isCut
                      ? "Le moteur va être restauré."
                      : "Le moteur va être coupé à distance."}
                  </p>
                  <p className="font-inter mt-1 text-[11px] leading-relaxed text-yazz-text-muted">
                    {isCut
                      ? "Le véhicule pourra redémarrer normalement. Cette action prend effet en quelques secondes."
                      : "Le véhicule ne pourra plus démarrer tant que le moteur n'est pas restauré. Cette action prend effet en quelques secondes."}
                  </p>
                </div>
              </div>
            </div>

            {speedTooHigh && (
              <div className="mt-3 rounded-yazz-sm border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yazz-warning" />
                  <p className="font-inter text-[11px] text-yazz-text-body">
                    <strong>Sécurité :</strong> Le véhicule roule à {speed} km/h. Le coupe-moteur est désactivé au-dessus de 20 km/h.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-accent"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={speedTooHigh}
                className={cn(
                  "font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 active:scale-95",
                  isCut
                    ? "bg-yazz-success hover:bg-yazz-success/90"
                    : "bg-yazz-error hover:bg-yazz-error/90"
                )}
              >
                <Power className="h-4 w-4" />
                Confirmer
              </button>
            </div>
          </>
        )}

        {step === "loading" && (
          <div className="grid place-items-center py-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-yazz-primary" />
            <p className="font-outfit mt-3 text-[14px] font-semibold text-yazz-text-dark">
              {isCut ? "Restauration en cours…" : "Coupe-moteur en cours…"}
            </p>
            <p className="font-inter mt-1 text-[11px] text-yazz-text-muted">
              Envoi de la commande au capteur…
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="grid place-items-center py-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-success/10">
              <CheckCircle2 className="h-7 w-7 text-yazz-success" />
            </div>
            <p className="font-outfit mt-3 text-[15px] font-bold text-yazz-text-dark">
              {isCut ? "Moteur restauré" : "Moteur coupé"}
            </p>
            <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
              La commande a été envoyée avec succès.
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="py-4">
            <div className="rounded-yazz-sm border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yazz-error" />
                <div>
                  <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
                    Échec de la commande
                  </p>
                  <p className="font-inter mt-1 text-[11px] leading-relaxed text-yazz-error">
                    {errorMessage}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep("confirm")}
              className="font-inter mt-3 w-full rounded-yazz-sm bg-yazz-primary py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 active:scale-95"
            >
              Réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
