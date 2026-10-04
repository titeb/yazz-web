"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUserVehicles } from "@/hooks/use-user-vehicles";
import { isSupabaseConfigured, createClientSafe } from "@/lib/supabase/client";
import {
  MapPin,
  Plus,
  Loader2,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Circle,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Geofence = {
  id: string;
  name: string;
  type: string; // "circle" | "polygon"
  coordinates: any;
  radius: number | null;
  color: string | null;
  is_active: boolean | null;
  alert_on_enter: boolean | null;
  alert_on_exit: boolean | null;
  device_id: string | null;
  user_id: string;
  created_at: string;
  updated_at: string | null;
};

export default function GeofencesPage() {
  const isReady = isSupabaseConfigured();
  const supabase = createClientSafe();
  const { vehicles } = useUserVehicles();

  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Geofence | null>(null);
  const schemaRef = useRef<{ cols: string[] } | null>(null);

  const fetchGeofences = useCallback(async () => {
    if (!supabase || !isReady) return;

    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Non authentifié");
        return;
      }

      const { data, error: gfErr } = await supabase
        .from("geofences")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (gfErr) {
        // Tenter sans le filtre user_id (peut-être que la colonne n'existe pas)
        if (gfErr.message.includes("user_id")) {
          const { data: data2, error: err2 } = await supabase
            .from("geofences")
            .select("*")
            .order("created_at", { ascending: false });
          if (err2) throw err2;
          const arr = (data2 ?? []).map(mapGeofence);
          setGeofences(arr);
          return;
        }
        throw gfErr;
      }

      if (data && data.length > 0 && !schemaRef.current) {
        schemaRef.current = { cols: Object.keys(data[0]) };
      }

      const arr = (data ?? []).map(mapGeofence);
      setGeofences(arr);
    } catch (err: any) {
      console.error("[geofences] erreur:", err);
      setError(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }, [supabase, isReady]);

  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  const addGeofence = async (input: {
    name: string;
    type: "circle" | "polygon";
    deviceId?: string;
    radius?: number;
    color?: string;
    alertOnEnter?: boolean;
    alertOnExit?: boolean;
  }) => {
    if (!supabase) return { success: false, error: "Supabase non configuré" };

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { success: false, error: "Non authentifié" };

      const insert: any = {
        user_id: user.id,
        name: input.name,
        type: input.type,
        is_active: true,
        alert_on_enter: input.alertOnEnter ?? true,
        alert_on_exit: input.alertOnExit ?? true,
      };
      if (input.deviceId) insert.device_id = input.deviceId;
      if (input.radius) insert.radius = input.radius;
      if (input.color) insert.color = input.color;
      // Coordinates: par défaut un cercle autour de Kinshasa centre
      insert.coordinates = { lat: -4.325, lng: 15.313 };

      const { error: insertErr } = await supabase.from("geofences").insert(insert);

      if (insertErr) {
        // Si une colonne n'existe pas, on réessaie sans
        if (insertErr.code === "PGRST204" || insertErr.message?.includes("Could not find the")) {
          const missingCol = insertErr.message?.match(/'([^']+)'/)?.[1];
          if (missingCol) {
            const filtered = { ...insert };
            delete filtered[missingCol];
            const { error: retryErr } = await supabase.from("geofences").insert(filtered);
            if (retryErr) throw retryErr;
            await fetchGeofences();
            return { success: true };
          }
        }
        throw insertErr;
      }

      await fetchGeofences();
      return { success: true };
    } catch (err: any) {
      console.error("[geofences] add erreur:", err);
      return { success: false, error: err.message ?? "Erreur lors de l'ajout" };
    }
  };

  const removeGeofence = async (id: string) => {
    if (!supabase) return { success: false, error: "Non configuré" };

    try {
      const { error: delErr } = await supabase.from("geofences").delete().eq("id", id);
      if (delErr) throw delErr;
      await fetchGeofences();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const toggleActive = async (gf: Geofence) => {
    if (!supabase) return;
    try {
      const { error: updErr } = await supabase
        .from("geofences")
        .update({ is_active: !gf.is_active, updated_at: new Date().toISOString() })
        .eq("id", gf.id);
      if (updErr) throw updErr;
      await fetchGeofences();
    } catch (err: any) {
      console.error("[geofences] toggle erreur:", err);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
              Géofences
            </h1>
            <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
              Définissez des zones autorisées ou interdites pour vos véhicules.
            </p>
          </div>
          {isReady && (
            <button
              onClick={() => setShowAddModal(true)}
              className="font-inter flex h-10 items-center gap-2 rounded-yazz-sm yazz-gradient-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium transition-all hover:shadow-yazz-elevated active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Créer
            </button>
          )}
        </div>

        {!isReady && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <p className="font-inter text-[12px] text-yazz-text-muted">
              Configurez Supabase dans <code className="font-mono">.env.local</code>.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
            <p className="font-inter text-[12px] text-yazz-error">{error}</p>
          </div>
        )}

        {isReady && geofences.length === 0 && !error && (
          <div className="grid place-items-center py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-accent">
              <MapPin className="h-6 w-6 text-yazz-text-muted" />
            </div>
            <p className="font-outfit mt-3 text-[15px] font-semibold text-yazz-text-dark">
              Aucune géofence
            </p>
            <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
              Créez une zone pour être alerté quand votre véhicule entre ou sort.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="font-inter mt-4 flex h-10 items-center gap-2 rounded-yazz-sm yazz-gradient-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium"
            >
              <Plus className="h-4 w-4" />
              Créer une géofence
            </button>
          </div>
        )}

        {/* Liste des géofences */}
        {isReady && geofences.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {geofences.map((gf) => (
              <div
                key={gf.id}
                className={cn(
                  "rounded-yazz-xl border bg-yazz-surface p-4 yazz-shadow-soft transition-all hover:yazz-shadow-elevated",
                  gf.is_active ? "border-yazz-border-light" : "border-yazz-border-light opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg text-white"
                      style={{ backgroundColor: gf.color || "#2B44EE" }}
                    >
                      {gf.type === "circle" ? <Circle className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-outfit truncate text-[14px] font-semibold text-yazz-text-dark">
                        {gf.name}
                      </p>
                      <p className="font-inter text-[10px] uppercase text-yazz-text-caption">
                        {gf.type === "circle" ? "Cercle" : "Polygone"}
                        {gf.radius ? ` · ${gf.radius}m` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(gf)}
                    className={cn(
                      "font-inter rounded-full px-2 py-0.5 text-[9px] font-bold transition-colors",
                      gf.is_active
                        ? "bg-yazz-success/15 text-yazz-success"
                        : "bg-yazz-text-muted/15 text-yazz-text-muted"
                    )}
                  >
                    {gf.is_active ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {gf.alert_on_enter && (
                    <span className="font-inter rounded-full bg-yazz-info/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-info">
                      Alerte entrée
                    </span>
                  )}
                  {gf.alert_on_exit && (
                    <span className="font-inter rounded-full bg-yazz-warning/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-warning">
                      Alerte sortie
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-yazz-border-light pt-2">
                  <span className="font-inter text-[10px] text-yazz-text-caption">
                    {new Date(gf.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <button
                    onClick={() => setConfirmDelete(gf)}
                    className="font-inter grid h-7 w-7 place-items-center rounded-yazz-sm text-yazz-error/70 hover:bg-yazz-error/10 hover:text-yazz-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal création */}
      {showAddModal && (
        <AddGeofenceModal
          vehicles={vehicles.map((v) => ({ id: v.deviceId, name: v.name }))}
          onClose={() => setShowAddModal(false)}
          onAdd={async (input) => {
            const r = await addGeofence(input);
            if (r.success) setShowAddModal(false);
            return r;
          }}
        />
      )}

      {/* Modal suppression */}
      {confirmDelete && (
        <ConfirmDeleteGeofenceModal
          geofence={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const r = await removeGeofence(confirmDelete.id);
            if (r.success) setConfirmDelete(null);
            return r;
          }}
        />
      )}
    </div>
  );
}

function mapGeofence(g: any): Geofence {
  return {
    id: g.id,
    name: g.name ?? "Géofence sans nom",
    type: g.type ?? "circle",
    coordinates: g.coordinates,
    radius: g.radius ?? null,
    color: g.color ?? null,
    is_active: g.is_active ?? null,
    alert_on_enter: g.alert_on_enter ?? null,
    alert_on_exit: g.alert_on_exit ?? null,
    device_id: g.device_id ?? null,
    user_id: g.user_id,
    created_at: g.created_at,
    updated_at: g.updated_at ?? null,
  };
}

function AddGeofenceModal({
  vehicles,
  onClose,
  onAdd,
}: {
  vehicles: { id: string; name: string }[];
  onClose: () => void;
  onAdd: (input: any) => Promise<{ success: boolean; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"circle" | "polygon">("circle");
  const [deviceId, setDeviceId] = useState("");
  const [radius, setRadius] = useState("500");
  const [color, setColor] = useState("#2B44EE");
  const [alertOnEnter, setAlertOnEnter] = useState(true);
  const [alertOnExit, setAlertOnExit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Le nom est requis.");
      return;
    }
    setLoading(true);
    setError(null);
    const r = await onAdd({
      name,
      type,
      deviceId: deviceId || undefined,
      radius: type === "circle" ? parseInt(radius, 10) : undefined,
      color,
      alertOnEnter,
      alertOnExit,
    });
    setLoading(false);
    if (!r.success) setError(r.error || "Erreur");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-outfit mb-4 text-[16px] font-bold text-yazz-text-dark">Créer une géofence</h2>

        <div className="space-y-3">
          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Nom *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Domicile, Bureau"
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            />
          </div>

          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Type de zone</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setType("circle")}
                className={cn(
                  "font-inter flex items-center justify-center gap-2 rounded-yazz-sm border py-2.5 text-[12px] font-semibold transition-all",
                  type === "circle" ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
                )}
              >
                <Circle className="h-4 w-4" />
                Cercle
              </button>
              <button
                onClick={() => setType("polygon")}
                className={cn(
                  "font-inter flex items-center justify-center gap-2 rounded-yazz-sm border py-2.5 text-[12px] font-semibold transition-all",
                  type === "polygon" ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary" : "border-yazz-border-light text-yazz-text-body"
                )}
              >
                <Square className="h-4 w-4" />
                Polygone
              </button>
            </div>
          </div>

          {type === "circle" && (
            <div>
              <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Rayon (mètres)</label>
              <input
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                min={50}
                max={10000}
                className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
              />
            </div>
          )}

          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Véhicule associé</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
            >
              <option value="">Tous mes véhicules</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">Couleur</label>
            <div className="flex gap-2">
              {["#2B44EE", "#38A169", "#E53E3E", "#D69E2E", "#3182CE", "#ED8936"].map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("h-9 w-9 rounded-full border-2 transition-all", color === c ? "border-yazz-text-dark scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              onClick={() => setAlertOnEnter(!alertOnEnter)}
              className={cn(
                "font-inter flex w-full items-center justify-between rounded-yazz-sm border p-2.5 text-left transition-colors",
                alertOnEnter ? "border-yazz-primary/30 bg-yazz-primary/5" : "border-yazz-border-light"
              )}
            >
              <span className="font-inter text-[12px] font-medium text-yazz-text-body">Alerte à l'entrée</span>
              <div className={cn("relative h-5 w-9 rounded-full transition-colors", alertOnEnter ? "bg-yazz-primary" : "bg-yazz-border-medium")}>
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", alertOnEnter ? "translate-x-[18px]" : "translate-x-0.5")} />
              </div>
            </button>
            <button
              onClick={() => setAlertOnExit(!alertOnExit)}
              className={cn(
                "font-inter flex w-full items-center justify-between rounded-yazz-sm border p-2.5 text-left transition-colors",
                alertOnExit ? "border-yazz-primary/30 bg-yazz-primary/5" : "border-yazz-border-light"
              )}
            >
              <span className="font-inter text-[12px] font-medium text-yazz-text-body">Alerte à la sortie</span>
              <div className={cn("relative h-5 w-9 rounded-full transition-colors", alertOnExit ? "bg-yazz-primary" : "bg-yazz-border-medium")}>
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", alertOnExit ? "translate-x-[18px]" : "translate-x-0.5")} />
              </div>
            </button>
          </div>

          {error && (
            <div className="rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2">
              <p className="font-inter text-[11px] text-yazz-error">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent">
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !name.trim()}
              className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm yazz-gradient-primary py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium hover:shadow-yazz-elevated disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteGeofenceModal({
  geofence,
  onClose,
  onConfirm,
}: {
  geofence: Geofence;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    const r = await onConfirm();
    setLoading(false);
    if (!r.success) setError(r.error || "Erreur");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg bg-yazz-error/10">
            <AlertTriangle className="h-5 w-5 text-yazz-error" />
          </div>
          <div>
            <h2 className="font-outfit text-[16px] font-bold text-yazz-text-dark">Supprimer la géofence ?</h2>
            <p className="font-inter text-[11px] text-yazz-text-muted">Action irréversible</p>
          </div>
        </div>

        <p className="font-inter mb-4 text-[12px] text-yazz-text-muted">
          La géofence <strong>{geofence.name}</strong> sera supprimée définitivement.
        </p>

        {error && (
          <div className="mb-3 rounded-yazz-sm border-l-2 border-l-yazz-error bg-yazz-error/10 p-2">
            <p className="font-inter text-[11px] text-yazz-error">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="font-inter flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface py-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="font-inter flex flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error py-2.5 text-[12px] font-semibold text-white shadow-yazz-medium hover:bg-yazz-error/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
