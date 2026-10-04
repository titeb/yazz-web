"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Power,
  Loader2,
  Route,
  MapPin as GeofenceIcon,
  Gauge as SpeedIcon,
  Clock,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClientSafe } from "@/lib/supabase/client";

// ============================================================
// Modal Options — reproduit le SensorOptionsModal du Flutter.
// Extrait ici pour être réutilisé à la fois par :
//   - le panneau de détail du dashboard (yazz-vehicle-detail.tsx)
//   - la carte véhicule de la page /vehicles (yazz-vehicle-grid-card.tsx)
// Chaque option a sa propre action (pas juste une redirection).
// ============================================================
export function OptionsModal({
  vehicleName,
  deviceId,
  vehicleId,
  onClose,
}: {
  vehicleName: string;
  deviceId: string;
  vehicleId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [activeSubModal, setActiveSubModal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deviceActive, setDeviceActive] = useState(true);

  const supabase = createClientSafe();

  // Charger l'état is_active du device au montage
  useEffect(() => {
    if (!supabase) return;
    supabase.from("user_devices").select("is_active").eq("id", vehicleId).maybeSingle()
      .then(({ data }) => setDeviceActive(data?.is_active ?? true));
  }, [supabase, vehicleId]);

  const showResult = (type: "success" | "error", message: string) => {
    setActionResult({ type, message });
    setTimeout(() => setActionResult(null), 3000);
  };

  // Action: toggle device active (désactiver/activer) — comme Flutter _toggleDeviceActive
  const toggleDeviceActive = async () => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { data: current } = await supabase
        .from("user_devices")
        .select("is_active")
        .eq("id", vehicleId)
        .maybeSingle();
      const newValue = !current?.is_active;
      const { error } = await supabase
        .from("user_devices")
        .update({ is_active: newValue, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
      if (error) throw error;
      setDeviceActive(newValue);
      showResult("success", newValue ? "Capteur activé" : "Capteur désactivé");
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: delete device (supprimer)
  const deleteDevice = async () => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .delete()
        .eq("id", vehicleId);
      if (error) throw error;
      showResult("success", "Capteur supprimé");
      setTimeout(() => { onClose(); router.push("/vehicles"); }, 1500);
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: set speed limit
  const setSpeedLimit = async (limit: number | null) => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .update({ speed_limit: limit, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
      if (error) throw error;
      showResult("success", limit ? `Limite fixée à ${limit} km/h` : "Limite supprimée");
      setTimeout(() => setActiveSubModal(null), 1500);
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Action: set prolonged stop threshold
  const setProlongedStop = async (minutes: number | null) => {
    if (!supabase) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .update({ max_stop_duration_minutes: minutes, updated_at: new Date().toISOString() })
        .eq("id", vehicleId);
      if (error) throw error;
      showResult("success", minutes ? `Alerte après ${minutes} min` : "Alerte désactivée");
      setTimeout(() => setActiveSubModal(null), 1500);
    } catch (err: any) {
      showResult("error", err.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  // Options — exactement comme Flutter SensorOptionsModal
  const navOptions = [
    { icon: Route, title: "Historique des trajets", subtitle: "Consulter les parcours passés", action: () => { onClose(); router.push("/history"); } },
    { icon: GeofenceIcon, title: "Zones géofence", subtitle: "Définir des périmètres de sécurité", action: () => { onClose(); router.push("/geofences"); } },
    { icon: SpeedIcon, title: "Limite de vitesse", subtitle: "Configurer les alertes d'excès", action: () => setActiveSubModal("speedLimit") },
    { icon: Clock, title: "Alerte arrêt prolongé", subtitle: "Notification en cas d'immobilité", action: () => setActiveSubModal("prolongedStop") },
    { icon: Pencil, title: "Modifier le capteur", subtitle: "Nom, véhicule et photo", action: () => { onClose(); router.push(`/vehicles?edit=${vehicleId}`); } },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-md" />
      <div
        className="relative w-full max-w-md rounded-t-yazz-xl sm:rounded-yazz-xl bg-yazz-surface yazz-shadow-high yazz-animate-fade-in-up max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixe */}
        <div className="relative shrink-0 border-b border-yazz-border-light p-5 pb-3">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">
            Options
          </h2>
          <p className="font-inter text-[12px] text-yazz-text-muted">{vehicleName}</p>
        </div>

        {/* Résultat action */}
        {actionResult && (
          <div className={cn(
            "shrink-0 border-b p-3",
            actionResult.type === "success" ? "border-l-4 border-l-yazz-success bg-yazz-success/10" : "border-l-4 border-l-yazz-error bg-yazz-error/10"
          )}>
            <p className={cn("font-inter text-[12px] font-semibold", actionResult.type === "success" ? "text-yazz-success" : "text-yazz-error")}>
              {actionResult.message}
            </p>
          </div>
        )}

        {/* Liste scrollable */}
        <ul className="flex-1 overflow-y-auto p-3 space-y-1">
          {navOptions.map((opt, idx) => {
            const Icon = opt.icon;
            return (
              <li key={idx}>
                <button
                  onClick={opt.action}
                  disabled={actionLoading}
                  className="flex w-full items-center gap-3 rounded-yazz-md p-3 text-left transition-colors hover:bg-yazz-accent disabled:opacity-50"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-yazz-primary/10">
                    <Icon className="h-[18px] w-[18px] text-yazz-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                      {opt.title}
                    </p>
                    <p className="font-inter text-[11px] text-yazz-text-muted">
                      {opt.subtitle}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}

          {/* Divider avant switch */}
          <li className="my-1 h-px bg-yazz-border-light" />

          {/* Switch désactiver/activer — Flutter _buildOptionTile avec Switch */}
          <li>
            <div className="flex w-full items-center gap-3 rounded-yazz-md p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-yazz-primary/10">
                <Power className="h-[18px] w-[18px] text-yazz-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-outfit text-[13px] font-semibold text-yazz-text-dark">
                  {deviceActive ? "Capteur actif" : "Capteur inactif"}
                </p>
                <p className="font-inter text-[11px] text-yazz-text-muted">
                  {deviceActive ? "Mettre en pause le suivi en direct" : "Réactiver le suivi en direct"}
                </p>
              </div>
              {actionLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-yazz-primary" />
              ) : (
                <button
                  onClick={toggleDeviceActive}
                  role="switch"
                  aria-checked={deviceActive}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    deviceActive ? "bg-yazz-primary" : "bg-yazz-border-light"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-yazz-soft transition-transform border border-yazz-border-light/50",
                      deviceActive ? "translate-x-[18px]" : "translate-x-0.5"
                    )}
                  />
                </button>
              )}
            </div>
          </li>

          {/* Divider avant supprimer */}
          <li className="my-1 h-px bg-yazz-border-light" />

          {/* Supprimer le capteur — Flutter _confirmDelete */}
          <li>
            <button
              onClick={() => setActiveSubModal("delete")}
              disabled={actionLoading}
              className="flex w-full items-center gap-3 rounded-yazz-md p-3 text-left transition-colors hover:bg-yazz-error/10 disabled:opacity-50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-yazz-error/10">
                <Trash2 className="h-[18px] w-[18px] text-yazz-error" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-outfit text-[13px] font-semibold text-yazz-error">
                  Supprimer le capteur
                </p>
                <p className="font-inter text-[11px] text-yazz-text-muted">
                  Retirer définitivement ce tracker
                </p>
              </div>
            </button>
          </li>
        </ul>

        {/* Sub-modals pour les actions avec input */}
        {activeSubModal === "speedLimit" && (
          <SubModal title="Limite de vitesse" onClose={() => setActiveSubModal(null)}>
            <SpeedLimitForm onSubmit={setSpeedLimit} loading={actionLoading} />
          </SubModal>
        )}

        {activeSubModal === "prolongedStop" && (
          <SubModal title="Alerte arrêt prolongé" onClose={() => setActiveSubModal(null)}>
            <ProlongedStopForm onSubmit={setProlongedStop} loading={actionLoading} />
          </SubModal>
        )}

        {activeSubModal === "delete" && (
          <SubModal title="Supprimer le capteur ?" onClose={() => setActiveSubModal(null)}>
            <div className="space-y-3">
              <div className="rounded-yazz-sm border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
                <p className="font-inter text-[12px] text-yazz-text-body">
                  Cette action est <strong>irréversible</strong>. Le capteur <strong>{vehicleName}</strong> sera définitivement retiré de votre compte.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActiveSubModal(null)} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light py-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent">
                  Annuler
                </button>
                <button
                  onClick={deleteDevice}
                  disabled={actionLoading}
                  className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white hover:bg-yazz-error/90 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Supprimer
                </button>
              </div>
            </div>
          </SubModal>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-modal wrapper
// ============================================================
function SubModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-yazz-text-dark/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[90%] max-w-sm rounded-yazz-xl bg-yazz-surface p-4 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-outfit text-[14px] font-bold text-yazz-text-dark">{title}</h3>
          <button onClick={onClose} className="grid h-6 w-6 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Form: Speed Limit
// ============================================================
function SpeedLimitForm({ onSubmit, loading }: { onSubmit: (limit: number | null) => void; loading: boolean }) {
  const [value, setValue] = useState("");
  const presets = [40, 50, 70, 90, 120];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setValue(String(p))}
            className={cn(
              "font-outfit rounded-yazz-sm border py-2 text-[12px] font-bold transition-all",
              value === String(p) ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ou valeur personnalisée (km/h)"
        className="font-inter h-10 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
      />
      <div className="flex gap-2">
        <button onClick={() => onSubmit(null)} disabled={loading} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light py-2 text-[12px] font-semibold text-yazz-text-muted hover:bg-yazz-accent disabled:opacity-50">
          Supprimer
        </button>
        <button
          onClick={() => onSubmit(value ? parseInt(value, 10) : null)}
          disabled={loading || !value}
          className="font-inter flex flex-1 items-center justify-center gap-1 rounded-yazz-sm bg-yazz-primary py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Form: Prolonged Stop
// ============================================================
function ProlongedStopForm({ onSubmit, loading }: { onSubmit: (minutes: number | null) => void; loading: boolean }) {
  const presets = [
    { value: 15, label: "15 min" },
    { value: 30, label: "30 min" },
    { value: 60, label: "1h" },
    { value: 120, label: "2h" },
    { value: 240, label: "4h" },
  ];
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <p className="font-inter text-[11px] text-yazz-text-muted">Recevoir une alerte après combien de temps d'immobilité ?</p>
      <div className="grid grid-cols-5 gap-2">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => setSelected(p.value)}
            className={cn(
              "font-outfit rounded-yazz-sm border py-2 text-[11px] font-bold transition-all",
              selected === p.value ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(null)} disabled={loading} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light py-2 text-[12px] font-semibold text-yazz-text-muted hover:bg-yazz-accent disabled:opacity-50">
          Désactiver
        </button>
        <button
          onClick={() => onSubmit(selected)}
          disabled={loading || selected === null}
          className="font-inter flex flex-1 items-center justify-center gap-1 rounded-yazz-sm bg-yazz-primary py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
