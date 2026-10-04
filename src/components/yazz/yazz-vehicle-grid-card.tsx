"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Power,
  Share2,
  Car,
  ShieldAlert,
  MoreVertical,
  Zap,
  Battery,
  Gauge,
  MapPin,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserDevice } from "@/hooks/use-user-devices";
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";
import { YazzEngineCutModal } from "./yazz-engine-cut-modal";
import { OptionsModal } from "./yazz-options-modal";
import { createClientSafe } from "@/lib/supabase/client";
import { useYazzToast, YazzToastContainer } from "./yazz-toast";

// ============================================================
// Helpers — mêmes règles que le dashboard (cohérence visuelle)
// ============================================================

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function getBatteryColor(percent: number | null): string {
  if (percent === null) return "text-yazz-text-caption";
  if (percent > 60) return "text-yazz-success";
  if (percent > 20) return "text-yazz-warning";
  return "text-yazz-error";
}

type StatusInfo = {
  label: string;
  color: string; // text-*
  dot: string; // bg-*
  bg: string; // badge background
};

// Dérive le statut depuis les données réelles (vitesse, batterie, parking, engineCut, lastUpdate)
// Couleurs sémantiques alignées sur le panneau de détail du dashboard (getStatusBadge),
// avec une couleur distincte par statut pour rester lisible d'un coup d'œil :
//   - Hors-ligne    → rouge (error) — signal perdu, problème
//   - Moteur coupé  → rouge clignotant (error + yazz-blink) — alerte critique
//   - Batterie faible → orange (crawling) — attention, distinct du jaune "à l'arrêt"
//   - En mouvement  → vert (success) — véhicule actif
//   - Mode parking  → bleu (info) — état intentionnel
//   - À l'arrêt     → jaune (warning) — en ligne mais immobilisé
function deriveStatus(d: UserDevice): StatusInfo {
  const TEN_MIN = 10 * 60 * 1000;
  const lastTs = d.lastUpdate ? new Date(d.lastUpdate).getTime() : 0;
  const isOffline = !d.lastUpdate || Date.now() - lastTs > TEN_MIN;

  if (isOffline) {
    return {
      label: "Hors-ligne",
      color: "text-yazz-error",
      dot: "bg-yazz-error",
      bg: "bg-yazz-error/15 border border-yazz-error/40",
    };
  }
  if (d.engineCutState) {
    return {
      label: "Moteur coupé",
      color: "text-yazz-error",
      dot: "bg-yazz-error yazz-blink",
      bg: "bg-yazz-error/15 border border-yazz-error/40",
    };
  }
  if ((d.batteryPercent ?? 100) < 20) {
    return {
      label: "Batterie faible",
      color: "text-yazz-crawling",
      dot: "bg-yazz-crawling",
      bg: "bg-yazz-crawling/15 border border-yazz-crawling/40",
    };
  }
  if ((d.speed ?? 0) > 0) {
    return {
      label: "En mouvement",
      color: "text-yazz-success",
      dot: "bg-yazz-success",
      bg: "bg-yazz-success/15 border border-yazz-success/40",
    };
  }
  if (d.parkingMode) {
    return {
      label: "Mode parking",
      color: "text-yazz-info",
      dot: "bg-yazz-info",
      bg: "bg-yazz-info/15 border border-yazz-info/40",
    };
  }
  return {
    label: "À l'arrêt",
    color: "text-yazz-warning",
    dot: "bg-yazz-warning",
    bg: "bg-yazz-warning/15 border border-yazz-warning/40",
  };
}

// ============================================================
// Composant carte — reproduction fidèle du YazzVehicleDetail
// mais en format carte (vertical, scrollable dans une grille).
// Données 100% issues de useUserDevices (realtime).
// ============================================================
export function YazzVehicleGridCard({ device }: { device: UserDevice }) {
  const router = useRouter();
  const supabase = createClientSafe();

  const [showEngineCut, setShowEngineCut] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [parkingActive, setParkingActive] = useState<boolean>(device.parkingMode ?? false);
  const { toasts: toastList, showToast, dismissToast } = useYazzToast();

  // Sync local parking state when the device prop updates (realtime)
  useEffect(() => {
    setParkingActive(device.parkingMode ?? false);
  }, [device.parkingMode]);

  const isCut = device.engineCutState === true;
  const accOn = !isCut; // Si le moteur est coupé, le contact est considéré coupé
  const status = useMemo(() => deriveStatus(device), [device]);
  const isOffline = status.label === "Hors-ligne";

  // Reverse geocoding pour l'adresse (comme le dashboard)
  const { address, loading: addressLoading } = useReverseGeocode(
    device.latitude,
    device.longitude
  );

  const addressParts: string[] = [];
  if (address?.street) addressParts.push(address.street);
  if (address?.quarter) addressParts.push(address.quarter);
  if (address?.commune) addressParts.push(address.commune);
  // Ville après commune (ex: "Lemba, Kinshasa" ou "Matadi, Kongo Central")
  if (address?.city && address.city !== address.commune) addressParts.push(address.city);
  // Province si différente de la ville (ex: "Matadi, Kongo Central")
  if (address?.region && address.region !== address.city && address.region !== address.commune) {
    addressParts.push(address.region);
  }
  const addressDisplay =
    addressParts.length > 0
      ? addressParts.join(", ")
      : address?.fullAddress || (isOffline ? "Dernière position connue" : "Localisation en cours…");

  const vehicleName =
    device.name || device.vehiclePlate || `Capteur ${device.shortId || device.id.slice(-6)}`;
  const firstLetter = (vehicleName || "?")[0]?.toUpperCase() || "?";
  const vehiclePhoto = device.urlImage || device.vehiclePhoto || null;
  const battColor = getBatteryColor(device.batteryPercent);

  // ─── Actions ( mêmes comportements que YazzVehicleDetail ) ──────────────

  const showToastMsg = (type: "success" | "error", title: string, message?: string) => {
    showToast(type, title, message);
  };

  const handleToggleParking = async () => {
    if (!supabase) return;
    try {
      const newValue = !parkingActive;
      const { error } = await supabase
        .from("user_devices")
        .update({ parking_mode: newValue, updated_at: new Date().toISOString() })
        .eq("id", device.id);
      if (error) throw error;
      setParkingActive(newValue);
      showToastMsg("success", newValue ? "Mode parking activé" : "Mode parking désactivé");
    } catch (err: any) {
      showToastMsg("error", "Erreur", err.message || "Une erreur est survenue");
    }
  };

  const handleShare = () => {
    router.push(`/sharing?device=${device.id}`);
  };

  const handleSOS = () => {
    router.push("/sos");
  };

  return (
    <>
      <article
        className={cn(
          "group flex flex-col overflow-hidden rounded-yazz-xl border bg-yazz-surface yazz-shadow-soft transition-all hover:yazz-shadow-elevated",
          device.isActive === false
            ? "border-yazz-border-light opacity-75"
            : "border-yazz-border-light"
        )}
      >
        {/* ─── Header : avatar + identité + statut ─────────────────────── */}
        <div className="flex items-start gap-3 p-4 pb-3">
          {/* Avatar — photo véhicule en carré arrondi (Flutter: ClipRRect radius 14) */}
          {vehiclePhoto ? (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px]">
              <img
                src={vehiclePhoto}
                alt={vehicleName}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-[14px]",
                device.isActive === false
                  ? "bg-yazz-accent"
                  : "yazz-gradient-primary text-white"
              )}
            >
              <span className="font-outfit text-[18px] font-bold">{firstLetter}</span>
            </div>
          )}

          {/* Identité */}
          <div className="min-w-0 flex-1">
            <p className="font-outfit truncate text-[15px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              {vehicleName}
            </p>
            {device.vehiclePlate && (
              <p className="font-outfit text-[11px] font-bold uppercase tracking-wide text-yazz-text-caption">
                {device.vehiclePlate}
              </p>
            )}
            <p className="font-inter mt-0.5 truncate text-[10px] text-yazz-text-caption">
              IMEI: <span className="font-mono">{device.id}</span>
            </p>
          </div>

          {/* Statut (top-right) */}
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold",
              status.bg,
              status.color
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
        </div>

        {/* ─── Ligne contact + batterie ───────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <div className="flex items-center gap-1.5">
            <Zap
              className={cn(
                "h-3.5 w-3.5",
                accOn && !isOffline ? "text-yazz-success" : "text-yazz-text-caption"
              )}
            />
            <span
              className={cn(
                "font-inter text-[11px]",
                accOn && !isOffline ? "text-yazz-success" : "text-yazz-text-muted"
              )}
            >
              {accOn ? "Contact mis" : "Contact coupé"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Battery
              className={cn(
                "h-3.5 w-3.5",
                !isOffline && device.batteryPercent !== null ? battColor : "text-yazz-text-caption"
              )}
            />
            <span
              className={cn(
                "font-inter text-[11px]",
                !isOffline ? "text-yazz-text-muted" : "text-yazz-text-caption"
              )}
            >
              {device.batteryPercent !== null ? `${device.batteryPercent}%` : "—"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-yazz-text-caption" />
            <span className="font-inter text-[10px] text-yazz-text-caption">
              {timeAgo(device.lastUpdate)}
            </span>
          </div>
        </div>

        {/* ─── Stats compactes (3 cols) ────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          <div className="rounded-yazz-md bg-yazz-background/60 p-2.5">
            <div className="flex items-center gap-1">
              <Gauge className="h-3 w-3 text-yazz-primary" />
              <p className="font-inter text-[9px] uppercase tracking-wide text-yazz-text-caption">
                Vitesse
              </p>
            </div>
            <p className="font-outfit mt-0.5 text-[14px] font-bold text-yazz-text-dark">
              {device.speed ?? 0}
              <span className="ml-0.5 text-[10px] font-normal text-yazz-text-caption">km/h</span>
            </p>
          </div>
          <div className="rounded-yazz-md bg-yazz-background/60 p-2.5">
            <div className="flex items-center gap-1">
              <Battery className="h-3 w-3 text-yazz-primary" />
              <p className="font-inter text-[9px] uppercase tracking-wide text-yazz-text-caption">
                Batterie
              </p>
            </div>
            <p
              className={cn(
                "font-outfit mt-0.5 text-[14px] font-bold",
                (device.batteryPercent ?? 100) < 20
                  ? "text-yazz-error"
                  : (device.batteryPercent ?? 100) < 50
                    ? "text-yazz-warning"
                    : "text-yazz-text-dark"
              )}
            >
              {device.batteryPercent ?? "—"}
              {device.batteryPercent !== null && (
                <span className="ml-0.5 text-[10px] font-normal text-yazz-text-caption">%</span>
              )}
            </p>
          </div>
          <div className="rounded-yazz-md bg-yazz-background/60 p-2.5">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3 text-yazz-primary" />
              <p className="font-inter text-[9px] uppercase tracking-wide text-yazz-text-caption">
                Position
              </p>
            </div>
            <p className="font-outfit mt-0.5 text-[12px] font-bold text-yazz-text-dark">
              {device.latitude !== null && device.longitude !== null
                ? `${device.latitude.toFixed(3)}, ${device.longitude.toFixed(3)}`
                : "—"}
            </p>
          </div>
        </div>

        {/* ─── Adresse reverse-geocodée ───────────────────────────────── */}
        {device.latitude !== null && device.longitude !== null && (
          <div className="mx-4 mb-3 flex items-start gap-1.5 rounded-yazz-md yazz-gradient-subtle px-2.5 py-2">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-yazz-primary" />
            <div className="min-w-0 flex-1">
              {addressLoading ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-yazz-primary" />
                  <p className="font-inter text-[10px] text-yazz-text-muted">
                    Localisation en cours…
                  </p>
                </div>
              ) : (
                <p
                  className={cn(
                    "font-inter text-[11px] leading-snug",
                    isOffline ? "text-yazz-text-muted" : "text-yazz-text-dark"
                  )}
                >
                  {addressDisplay}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── Badges (état du véhicule) ──────────────────────────────── */}
        {(device.parkingMode ||
          device.engineCutState ||
          device.isShared ||
          device.speedLimit !== null ||
          device.maxStopDurationMinutes !== null) && (
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {device.parkingMode && (
              <span className="rounded-full bg-yazz-info/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-info">
                Parking
              </span>
            )}
            {device.engineCutState && (
              <span className="rounded-full bg-yazz-error/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-error">
                Moteur coupé
              </span>
            )}
            {device.isShared && (
              <span className="rounded-full bg-yazz-success/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-success">
                Partagé
              </span>
            )}
            {device.speedLimit !== null && (
              <span className="rounded-full bg-yazz-accent px-2 py-0.5 text-[9px] font-semibold text-yazz-text-muted">
                Limit {device.speedLimit} km/h
              </span>
            )}
            {device.maxStopDurationMinutes !== null && (
              <span className="rounded-full bg-yazz-accent px-2 py-0.5 text-[9px] font-semibold text-yazz-text-muted">
                Arrêt &gt; {device.maxStopDurationMinutes}min
              </span>
            )}
            {device.isActive === false && (
              <span className="rounded-full bg-yazz-warning/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-warning">
                Capteur inactif
              </span>
            )}
          </div>
        )}

        {/* ─── 5 boutons d'action (style dashboard) ───────────────────── */}
        <div className="mt-auto grid grid-cols-5 gap-1.5 border-t border-yazz-border-light p-3">
          {/* 1. Coupe-moteur */}
          <button
            onClick={() => setShowEngineCut(true)}
            className={cn(
              "font-inter flex flex-col items-center gap-1 rounded-yazz-sm py-2 transition-all active:scale-95",
              isCut
                ? "bg-yazz-error text-white yazz-blink"
                : "bg-yazz-background text-yazz-text-body hover:bg-yazz-accent"
            )}
            title={isCut ? "Restaurer le moteur" : "Couper le moteur"}
          >
            <Power className="h-[16px] w-[16px]" />
            <span className="text-[9px] font-semibold">{isCut ? "Restaurer" : "Couper"}</span>
          </button>

          {/* 2. Partager */}
          <button
            onClick={handleShare}
            className="font-inter flex flex-col items-center gap-1 rounded-yazz-sm bg-yazz-background py-2 text-yazz-text-body transition-all hover:bg-yazz-accent active:scale-95"
            title="Partager"
          >
            <Share2 className="h-[16px] w-[16px]" />
            <span className="text-[9px] font-semibold">Partager</span>
          </button>

          {/* 3. Parking */}
          <button
            onClick={handleToggleParking}
            className={cn(
              "font-inter flex flex-col items-center gap-1 rounded-yazz-sm py-2 transition-all active:scale-95",
              parkingActive
                ? "yazz-gradient-primary text-white yazz-blink"
                : "bg-yazz-background text-yazz-text-body hover:bg-yazz-accent"
            )}
            title={parkingActive ? "Désactiver le mode parking" : "Activer le mode parking"}
          >
            <Car className="h-[16px] w-[16px]" />
            <span className="text-[9px] font-semibold">Parking</span>
          </button>

          {/* 4. SOS */}
          <button
            onClick={handleSOS}
            className="font-inter flex flex-col items-center gap-1 rounded-yazz-sm bg-yazz-background py-2 text-yazz-text-body transition-all hover:bg-yazz-accent active:scale-95"
            title="SOS"
          >
            <ShieldAlert className="h-[16px] w-[16px] yazz-blink" />
            <span className="text-[9px] font-semibold">SOS</span>
          </button>

          {/* 5. Options (more) → ouvre le modal options */}
          <button
            onClick={() => setShowOptions(true)}
            className="font-inter flex flex-col items-center gap-1 rounded-yazz-sm bg-yazz-background py-2 text-yazz-text-body transition-all hover:bg-yazz-accent active:scale-95"
            title="Plus d'options"
          >
            <MoreVertical className="h-[16px] w-[16px]" />
            <span className="text-[9px] font-semibold">Options</span>
          </button>
        </div>
      </article>

      {/* ─── Modals (Portal vers body pour z-index global) ────────────── */}

      {/* Coupe-moteur */}
      {showEngineCut &&
        typeof window !== "undefined" &&
        createPortal(
          <YazzEngineCutModal
            deviceId={device.id}
            deviceName={vehicleName}
            currentCutState={isCut}
            speed={device.speed}
            onClose={() => setShowEngineCut(false)}
            onSuccess={() => setShowEngineCut(false)}
          />,
          document.body
        )}

      {/* Options */}
      {showOptions &&
        typeof window !== "undefined" &&
        createPortal(
          <OptionsModal
            vehicleName={vehicleName}
            deviceId={device.id}
            vehicleId={device.id}
            onClose={() => setShowOptions(false)}
          />,
          document.body
        )}

      {/* Toast container — slide-in du haut style yazz user */}
      {typeof window !== "undefined" &&
        createPortal(
          <YazzToastContainer toasts={toastList} onDismiss={dismissToast} />,
          document.body
        )}
    </>
  );
}
