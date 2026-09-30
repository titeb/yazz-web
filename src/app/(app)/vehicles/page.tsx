"use client";

import { useState } from "react";
import { useUserDevices, type UserDevice } from "@/hooks/use-user-devices";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  Plus,
  Car,
  Battery,
  Gauge,
  Clock,
  Trash2,
  Power,
  Pencil,
  X,
  Loader2,
  AlertTriangle,
  MapPin,
  ShieldCheck,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function getDeviceStatus(d: UserDevice): { label: string; color: string; dot: string } {
  if (!d.lastUpdate) return { label: "Hors-ligne", color: "text-yazz-text-caption", dot: "bg-yazz-text-caption" };
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const lastTs = new Date(d.lastUpdate).getTime();
  if (lastTs < tenMinAgo) return { label: "Hors-ligne", color: "text-yazz-text-caption", dot: "bg-yazz-text-caption" };
  if (d.engineCutState) return { label: "Moteur coupé", color: "text-yazz-error", dot: "bg-yazz-error yazz-blink" };
  if ((d.batteryPercent ?? 100) < 20) return { label: "Batterie faible", color: "text-yazz-warning", dot: "bg-yazz-warning" };
  if ((d.speed ?? 0) > 0) return { label: "En mouvement", color: "text-yazz-primary", dot: "bg-yazz-primary" };
  if (d.parkingMode) return { label: "Mode parking", color: "text-yazz-info", dot: "bg-yazz-info" };
  return { label: "À l'arrêt", color: "text-yazz-text-muted", dot: "bg-yazz-text-muted" };
}

export default function VehiclesPage() {
  const isReady = isSupabaseConfigured();
  const { devices, loading, error, addDevice, updateDevice, removeDevice, toggleActive } = useUserDevices();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<UserDevice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserDevice | null>(null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              Mes véhicules
            </h1>
            <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
              {isReady
                ? `${devices.length} capteur${devices.length > 1 ? "s" : ""} · ${devices.filter((d) => d.isActive).length} actif${devices.filter((d) => d.isActive).length > 1 ? "s" : ""}`
                : "Mode démo"}
            </p>
          </div>
          {isReady && (
            <button
              onClick={() => setShowAddModal(true)}
              className="font-inter flex h-10 items-center gap-2 rounded-yazz-sm bg-yazz-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          )}
        </div>

        {/* States */}
        {!isReady && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <p className="font-inter text-[12px] text-yazz-text-muted">
              Configure Supabase dans <code className="font-mono">.env.local</code> pour voir vos capteurs.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-4">
            <p className="font-inter text-[12px] text-yazz-error">{error}</p>
          </div>
        )}

        {isReady && loading && (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yazz-primary" />
          </div>
        )}

        {isReady && !loading && devices.length === 0 && (
          <div className="grid place-items-center py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-accent">
              <Car className="h-6 w-6 text-yazz-text-muted" />
            </div>
            <p className="font-outfit mt-3 text-[15px] font-semibold text-yazz-text-dark">Aucun capteur</p>
            <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
              Ajoutez votre premier capteur GPS pour commencer le suivi.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="font-inter mt-4 flex h-10 items-center gap-2 rounded-yazz-sm bg-yazz-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Ajouter un capteur
            </button>
          </div>
        )}

        {/* Devices grid */}
        {isReady && !loading && devices.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {devices.map((d) => {
              const status = getDeviceStatus(d);
              const vehicleName = d.name || d.vehiclePlate || `Capteur ${d.shortId || d.id.slice(-6)}`;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-yazz-xl border bg-yazz-surface p-4 yazz-shadow-soft transition-all hover:yazz-shadow-elevated",
                    d.isActive ? "border-yazz-border-light" : "border-yazz-border-light opacity-70"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg", d.isActive ? "bg-yazz-gradient-primary text-white" : "bg-yazz-accent text-yazz-text-muted")}>
                        <Car className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-outfit truncate text-[14px] font-semibold tracking-[-0.01em] text-yazz-text-dark">
                          {vehicleName}
                        </p>
                        {d.vehiclePlate && (
                          <p className="font-outfit text-[11px] font-bold uppercase tracking-wide text-yazz-text-caption">
                            {d.vehiclePlate}
                          </p>
                        )}
                        <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                          IMEI: {d.id}
                        </p>
                      </div>
                    </div>
                    <span className={cn("flex items-center gap-1.5 shrink-0 rounded-full bg-yazz-background px-2 py-1 text-[10px] font-semibold", status.color)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-yazz-sm bg-yazz-background/60 p-2">
                      <p className="font-inter text-[9px] uppercase tracking-wide text-yazz-text-caption">Vitesse</p>
                      <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
                        {d.speed ?? 0}<span className="ml-0.5 text-[10px] font-normal text-yazz-text-caption">km/h</span>
                      </p>
                    </div>
                    <div className="rounded-yazz-sm bg-yazz-background/60 p-2">
                      <p className="font-inter text-[9px] uppercase tracking-wide text-yazz-text-caption">Batterie</p>
                      <p className={cn("font-outfit text-[13px] font-bold", (d.batteryPercent ?? 100) < 20 ? "text-yazz-error" : (d.batteryPercent ?? 100) < 50 ? "text-yazz-warning" : "text-yazz-text-dark")}>
                        {d.batteryPercent ?? "—"}{d.batteryPercent !== null && <span className="ml-0.5 text-[10px] font-normal text-yazz-text-caption">%</span>}
                      </p>
                    </div>
                    <div className="rounded-yazz-sm bg-yazz-background/60 p-2">
                      <p className="font-inter text-[9px] uppercase tracking-wide text-yazz-text-caption">MAJ</p>
                      <p className="font-inter text-[11px] font-semibold text-yazz-text-dark">
                        {timeAgo(d.lastUpdate)}
                      </p>
                    </div>
                  </div>

                  {/* Address */}
                  {d.latitude !== null && d.longitude !== null && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-yazz-sm bg-yazz-gradient-subtle px-2 py-1.5">
                      <MapPin className="h-3 w-3 shrink-0 text-yazz-primary" />
                      <p className="font-inter truncate text-[10px] text-yazz-text-muted">
                        {d.latitude.toFixed(4)}, {d.longitude.toFixed(4)}
                      </p>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {d.parkingMode && (
                      <span className="rounded-full bg-yazz-info/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-info">
                        Parking
                      </span>
                    )}
                    {d.engineCutState && (
                      <span className="rounded-full bg-yazz-error/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-error">
                        Moteur coupé
                      </span>
                    )}
                    {d.isShared && (
                      <span className="rounded-full bg-yazz-success/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-success">
                        Partagé
                      </span>
                    )}
                    {d.speedLimit !== null && (
                      <span className="rounded-full bg-yazz-accent px-2 py-0.5 text-[9px] font-semibold text-yazz-text-muted">
                        Limit {d.speedLimit} km/h
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-1 border-t border-yazz-border-light pt-3">
                    <button
                      onClick={() => toggleActive(d.id, !d.isActive)}
                      className={cn(
                        "font-inter flex flex-1 items-center justify-center gap-1 rounded-yazz-sm py-2 text-[11px] font-semibold transition-colors",
                        d.isActive
                          ? "text-yazz-warning hover:bg-yazz-warning/10"
                          : "text-yazz-success hover:bg-yazz-success/10"
                      )}
                      title={d.isActive ? "Désactiver" : "Activer"}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {d.isActive ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      onClick={() => setEditingDevice(d)}
                      className="font-inter grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
                      title="Éditer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(d)}
                      className="font-inter grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-error/70 hover:bg-yazz-error/10 hover:text-yazz-error"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal ajout */}
      {showAddModal && (
        <AddDeviceModal
          onClose={() => setShowAddModal(false)}
          onAdd={async (input) => {
            const r = await addDevice(input);
            if (r.success) {
              setShowAddModal(false);
            }
            return r;
          }}
        />
      )}

      {/* Modal édition */}
      {editingDevice && (
        <EditDeviceModal
          device={editingDevice}
          onClose={() => setEditingDevice(null)}
          onUpdate={async (input) => {
            const r = await updateDevice(editingDevice.id, input);
            if (r.success) setEditingDevice(null);
            return r;
          }}
        />
      )}

      {/* Modal confirmation suppression */}
      {confirmDelete && (
        <ConfirmDeleteModal
          device={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const r = await removeDevice(confirmDelete.id);
            if (r.success) setConfirmDelete(null);
            return r;
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal : Ajouter un capteur
// ============================================================
function AddDeviceModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: any) => Promise<{ success: boolean; error?: string }>;
}) {
  const [imei, setImei] = useState("");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!/^\d{5,20}$/.test(imei)) {
      setError("IMEI invalide : 5 à 20 chiffres requis.");
      return;
    }
    setLoading(true);
    const r = await onAdd({
      imei,
      name: name || undefined,
      vehiclePlate: plate || undefined,
      vehicleBrand: brand || undefined,
      vehicleModel: model || undefined,
      vehicleColor: color || undefined,
    });
    setLoading(false);
    if (!r.success) setError(r.error || "Erreur lors de l'ajout.");
  };

  return (
    <ModalShell onClose={onClose} title="Ajouter un capteur">
      <div className="space-y-3">
        <Field label="IMEI du capteur" required>
          <input
            type="text"
            inputMode="numeric"
            placeholder="ex: 861234501820394"
            value={imei}
            onChange={(e) => setImei(e.target.value.replace(/\D/g, ""))}
            maxLength={20}
            className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
          />
          <p className="font-inter mt-1 text-[10px] text-yazz-text-caption">
            L'IMEI se trouve sur le capteur ou dans les paramètres du fabricant.
          </p>
        </Field>

        <Field label="Nom du véhicule (optionnel)">
          <input
            type="text"
            placeholder="ex: Toyota Hilux"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Plaque (optionnel)">
            <input
              type="text"
              placeholder="CG-XXXX-XX"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
          </Field>
          <Field label="Couleur (optionnel)">
            <input
              type="text"
              placeholder="Rouge"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Marque (optionnel)">
            <input
              type="text"
              placeholder="Toyota"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
          </Field>
          <Field label="Modèle (optionnel)">
            <input
              type="text"
              placeholder="Hilux"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2">
            <p className="font-inter text-[11px] text-yazz-error">{error}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-accent"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!imei || loading}
            className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 disabled:opacity-50 active:scale-95"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// Modal : Éditer un capteur
// ============================================================
function EditDeviceModal({
  device,
  onClose,
  onUpdate,
}: {
  device: UserDevice;
  onClose: () => void;
  onUpdate: (input: any) => Promise<{ success: boolean; error?: string }>;
}) {
  const [name, setName] = useState(device.name ?? "");
  const [plate, setPlate] = useState(device.vehiclePlate ?? "");
  const [brand, setBrand] = useState(device.vehicleBrand ?? "");
  const [model, setModel] = useState(device.vehicleModel ?? "");
  const [color, setColor] = useState(device.vehicleColor ?? "");
  const [speedLimit, setSpeedLimit] = useState(device.speedLimit?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    const r = await onUpdate({
      name: name || null,
      vehiclePlate: plate || null,
      vehicleBrand: brand || null,
      vehicleModel: model || null,
      vehicleColor: color || null,
      speedLimit: speedLimit ? parseInt(speedLimit, 10) : null,
    });
    setLoading(false);
    if (!r.success) setError(r.error || "Erreur lors de la mise à jour.");
  };

  return (
    <ModalShell onClose={onClose} title="Éditer le capteur">
      <div className="space-y-3">
        <div className="rounded-yazz-sm bg-yazz-background p-2">
          <p className="font-inter text-[10px] text-yazz-text-caption">IMEI</p>
          <p className="font-mono text-[12px] font-bold text-yazz-text-dark">{device.id}</p>
        </div>

        <Field label="Nom du véhicule">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Plaque">
            <input type="text" value={plate} onChange={(e) => setPlate(e.target.value)} className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20" />
          </Field>
          <Field label="Couleur">
            <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Marque">
            <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20" />
          </Field>
          <Field label="Modèle">
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20" />
          </Field>
        </div>

        <Field label="Limite de vitesse (km/h)">
          <input
            type="number"
            value={speedLimit}
            onChange={(e) => setSpeedLimit(e.target.value)}
            placeholder="ex: 90"
            className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
          />
        </Field>

        {error && (
          <div className="rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2">
            <p className="font-inter text-[11px] text-yazz-error">{error}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-accent">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-primary py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 disabled:opacity-50 active:scale-95"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// Modal : Confirmer suppression
// ============================================================
function ConfirmDeleteModal({
  device,
  onClose,
  onConfirm,
}: {
  device: UserDevice;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    const r = await onConfirm();
    setLoading(false);
    if (!r.success) setError(r.error || "Erreur lors de la suppression.");
  };

  return (
    <ModalShell onClose={onClose} title="Supprimer le capteur ?" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-yazz-sm bg-yazz-error/10 p-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yazz-error" />
          <div>
            <p className="font-inter text-[13px] font-semibold text-yazz-text-dark">
              Cette action est irréversible.
            </p>
            <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
              Le capteur <strong>{device.name || device.vehiclePlate || device.id}</strong> sera retiré de votre compte.
              Vous ne pourrez plus le suivre tant que vous ne l'ajouterez pas à nouveau.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2">
            <p className="font-inter text-[11px] text-yazz-error">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body transition-colors hover:bg-yazz-accent">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-error/90 disabled:opacity-50 active:scale-95"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Supprimer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// Composants UI réutilisables
// ============================================================
function ModalShell({
  children,
  onClose,
  title,
  maxWidth = "max-w-lg",
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className={cn("relative w-full rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up", maxWidth)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-outfit text-[16px] font-bold tracking-[-0.01em] text-yazz-text-dark">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
        {label}
        {required && <span className="ml-0.5 text-yazz-error">*</span>}
      </label>
      {children}
    </div>
  );
}
