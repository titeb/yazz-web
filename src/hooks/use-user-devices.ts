"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";

export type UserDevice = {
  id: string; // IMEI / device_id
  userId: string;
  shortId: string | null;
  name: string | null;
  urlImage: string | null;
  isActive: boolean | null;
  linkedAt: string | null;
  speedLimit: number | null;
  isShared: boolean | null;
  sharedByOwnerId: string | null;
  sharedPermission: string | null;
  maxStopDurationMinutes: number | null;
  parkingMode: boolean | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehiclePhoto: string | null;
  engineCutState: boolean | null;
  // Position actuelle (depuis last_known_positions)
  speed: number | null;
  batteryPercent: number | null;
  lastUpdate: string | null;
  isConnected: boolean | null;
  latitude: number | null;
  longitude: number | null;
};

export type UseUserDevicesResult = {
  devices: UserDevice[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addDevice: (input: {
    imei: string;
    name?: string;
    vehiclePlate?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    urlImage?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateDevice: (
    id: string,
    input: Partial<Pick<UserDevice, "name" | "vehiclePlate" | "vehicleBrand" | "vehicleModel" | "vehicleColor" | "speedLimit" | "urlImage">>
  ) => Promise<{ success: boolean; error?: string }>;
  removeDevice: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleActive: (id: string, active: boolean) => Promise<{ success: boolean; error?: string }>;
};

/**
 * Hook pour gérer la liste complète des user_devices (page Mes capteurs).
 * Inclut : fetch, add, update, remove, toggle active.
 * Realtime : re-fetch automatique sur changements user_devices et last_known_positions.
 */
let userDevicesChannelCounter = 0;

export function useUserDevices(): UseUserDevicesResult {
  const supabase = createClientSafe();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-user-devices-realtime-${++userDevicesChannelCounter}`;
  }

  const fetchDevices = useCallback(async (silent = false) => {
    if (!supabase || !isSupabaseConfigured()) return;

    try {
      if (!silent) setLoading(true);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setError("Non authentifié");
        if (!silent) setLoading(false);
        return;
      }

      const { data: userDevices, error: udErr } = await supabase
        .from("user_devices")
        .select("*")
        .eq("user_id", user.id)
        .order("linked_at", { ascending: false });

      if (udErr) throw udErr;
      if (!userDevices || userDevices.length === 0) {
        setDevices([]);
        setError(null);
        if (!silent) setLoading(false);
        return;
      }

      const deviceIds = userDevices.map((ud: any) => ud.id);

      const { data: positions, error: posErr } = await supabase
        .from("last_known_positions")
        .select("*")
        .in("device_id", deviceIds);

      if (posErr) {
        console.warn("[useUserDevices] positions erreur (non bloquant):", posErr.message);
      }

      const positionsMap = new Map<string, any>();
      positions?.forEach((p: any) => positionsMap.set(p.device_id, p));

      const devicesData: UserDevice[] = userDevices.map((ud: any) => {
        const pos = positionsMap.get(ud.id);
        return {
          id: ud.id,
          userId: ud.user_id,
          shortId: ud.short_id ?? null,
          name: ud.name ?? null,
          urlImage: ud.url_image ?? null,
          isActive: ud.is_active ?? null,
          linkedAt: ud.linked_at ?? null,
          speedLimit: ud.speed_limit ?? null,
          isShared: ud.is_shared ?? null,
          sharedByOwnerId: ud.shared_by_owner_id ?? null,
          sharedPermission: ud.shared_permission ?? null,
          maxStopDurationMinutes: ud.max_stop_duration_minutes ?? null,
          parkingMode: ud.parking_mode ?? null,
          vehicleColor: ud.vehicle_color ?? null,
          vehiclePlate: ud.vehicle_plate ?? null,
          vehicleBrand: ud.vehicle_brand ?? null,
          vehicleModel: ud.vehicle_model ?? null,
          vehiclePhoto: ud.vehicle_photo ?? null,
          engineCutState: ud.engine_cut_state ?? null,
          speed: pos?.speed ?? null,
          batteryPercent: pos?.battery_percent ?? null,
          lastUpdate: pos?.last_update ?? null,
          isConnected: pos?.is_connected ?? null,
          latitude: pos?.latitude ?? null,
          longitude: pos?.longitude ?? null,
        };
      });

      setDevices(devicesData);
      setError(null);
    } catch (err: any) {
      console.error("[useUserDevices] erreur:", err);
      setError(err.message ?? "Erreur");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !channelNameRef.current) return;

    let channel: any = null;

    // Map une ligne user_devices (snake_case DB) vers le type UserDevice (camelCase app).
    // Réutilisé par les handlers Realtime pour appliquer le payload directement
    // au state local SANS re-SELECTer toute la table (gain ~100-300ms par event).
    const mapDeviceRow = (ud: any, existingPos?: Partial<UserDevice>): UserDevice => ({
      id: ud.id,
      userId: ud.user_id,
      shortId: ud.short_id ?? null,
      name: ud.name ?? null,
      urlImage: ud.url_image ?? null,
      isActive: ud.is_active ?? null,
      linkedAt: ud.linked_at ?? null,
      speedLimit: ud.speed_limit ?? null,
      isShared: ud.is_shared ?? null,
      sharedByOwnerId: ud.shared_by_owner_id ?? null,
      sharedPermission: ud.shared_permission ?? null,
      maxStopDurationMinutes: ud.max_stop_duration_minutes ?? null,
      parkingMode: ud.parking_mode ?? null,
      vehicleColor: ud.vehicle_color ?? null,
      vehiclePlate: ud.vehicle_plate ?? null,
      vehicleBrand: ud.vehicle_brand ?? null,
      vehicleModel: ud.vehicle_model ?? null,
      vehiclePhoto: ud.vehicle_photo ?? null,
      engineCutState: ud.engine_cut_state ?? null,
      // Position : conservée depuis l'état existant (les updates user_devices ne touchent pas les positions)
      speed: existingPos?.speed ?? null,
      batteryPercent: existingPos?.batteryPercent ?? null,
      lastUpdate: existingPos?.lastUpdate ?? null,
      isConnected: existingPos?.isConnected ?? null,
      latitude: existingPos?.latitude ?? null,
      longitude: existingPos?.longitude ?? null,
    });

    const init = async () => {
      // Ensure session is loaded before subscribing to Realtime
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch initial data (full snapshot)
      fetchDevices();

      // ─── Realtime optimisé ─────────────────────────────────────
      // Au lieu de re-SELECTer toute la table à chaque événement (latence 100-300ms),
      // on applique directement le payload Realtime au state local.
      // Latence réduite à ~50-100ms (WebSocket → React render).
      // Un safety net (re-fetch silencieux toutes les 30s) rattrape tout événement
      // manqué (ex: coupure WebSocket brève).
      // ────────────────────────────────────────────────────────────
      channel = supabase
        .channel(channelNameRef.current)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_devices" },
          (payload: any) => {
            const eventType: string = payload.eventType;
            const newRow = payload.new as any;
            const oldRow = payload.old as any;

            setDevices((prev) => {
              // DELETE → retirer de la liste
              if (eventType === "DELETE") {
                return prev.filter((d) => d.id !== oldRow?.id);
              }

              // INSERT ou UPDATE
              const idx = prev.findIndex((d) => d.id === newRow.id);
              const mapped = mapDeviceRow(newRow, idx >= 0 ? prev[idx] : undefined);

              if (idx === -1) {
                // Nouveau device — ajouter en tête
                return [mapped, ...prev];
              }

              // Device existant — remplacer en place
              const updated = [...prev];
              updated[idx] = mapped;
              return updated;
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "last_known_positions" },
          (payload: any) => {
            const newRow = payload.new as any;
            if (!newRow?.device_id) return;

            setDevices((prev) => {
              const idx = prev.findIndex((d) => d.id === newRow.device_id);
              if (idx === -1) return prev; // Device pas dans notre liste → ignorer

              const updated = [...prev];
              // Pour les positions, on utilise `!== undefined` et non `??` :
              // `null` est une valeur valide (ex: battery_percent null = pas de donnée),
              // on ne doit pas le confondre avec `undefined` (champ absent du payload).
              updated[idx] = {
                ...updated[idx],
                speed: newRow.speed !== undefined ? newRow.speed : updated[idx].speed,
                batteryPercent: newRow.battery_percent !== undefined ? newRow.battery_percent : updated[idx].batteryPercent,
                lastUpdate: newRow.last_update !== undefined ? newRow.last_update : updated[idx].lastUpdate,
                isConnected: newRow.is_connected !== undefined ? newRow.is_connected : updated[idx].isConnected,
                latitude: newRow.latitude !== undefined ? newRow.latitude : updated[idx].latitude,
                longitude: newRow.longitude !== undefined ? newRow.longitude : updated[idx].longitude,
              };
              return updated;
            });
          }
        )
        .subscribe();
    };

    init();

    // Safety net : re-fetch silencieux toutes les 30 secondes.
    // Silent = true → ne déclenche PAS setLoading, donc invisible pour l'UI.
    // Garantit que le state reste cohérent même si un événement Realtime est
    // manqué (coupure réseau brève, redémarrage serveur, etc.).
    const safetyInterval = setInterval(() => {
      fetchDevices(true);
    }, 30000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(safetyInterval);
    };
  }, [fetchDevices, supabase]);

  const addDevice = useCallback(
    async (input: {
      imei: string;
      name?: string;
      vehiclePlate?: string;
      vehicleBrand?: string;
      vehicleModel?: string;
      vehicleColor?: string;
      urlImage?: string;
    }) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Non authentifié" };

        // Valider IMEI : 5 à 20 chiffres
        if (!/^\d{5,20}$/.test(input.imei)) {
          return { success: false, error: "IMEI invalide (5 à 20 chiffres requis)" };
        }

        const insert: any = {
          id: input.imei,
          user_id: user.id,
          is_active: true,
          linked_at: new Date().toISOString(),
        };
        if (input.name) insert.name = input.name;
        if (input.vehiclePlate) insert.vehicle_plate = input.vehiclePlate;
        if (input.vehicleBrand) insert.vehicle_brand = input.vehicleBrand;
        if (input.vehicleModel) insert.vehicle_model = input.vehicleModel;
        if (input.vehicleColor) insert.vehicle_color = input.vehicleColor;
        if (input.urlImage) insert.url_image = input.urlImage;

        const { error: insertErr } = await supabase.from("user_devices").insert(insert);

        if (insertErr) {
          // Si IMEI déjà lié à un autre user → erreur explicite
          if (insertErr.code === "23505") {
            return { success: false, error: "Ce capteur est déjà lié à un compte." };
          }
          throw insertErr;
        }

        await fetchDevices();
        return { success: true };
      } catch (err: any) {
        console.error("[useUserDevices] addDevice erreur:", err);
        return { success: false, error: err.message ?? "Erreur lors de l'ajout" };
      }
    },
    [supabase, fetchDevices]
  );

  const updateDevice = useCallback(
    async (
      id: string,
      input: Partial<
        Pick<UserDevice, "name" | "vehiclePlate" | "vehicleBrand" | "vehicleModel" | "vehicleColor" | "speedLimit" | "urlImage">
      >
    ) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };

      try {
        const update: any = { updated_at: new Date().toISOString() };
        if (input.name !== undefined) update.name = input.name;
        if (input.vehiclePlate !== undefined) update.vehicle_plate = input.vehiclePlate;
        if (input.vehicleBrand !== undefined) update.vehicle_brand = input.vehicleBrand;
        if (input.vehicleModel !== undefined) update.vehicle_model = input.vehicleModel;
        if (input.vehicleColor !== undefined) update.vehicle_color = input.vehicleColor;
        if (input.speedLimit !== undefined) update.speed_limit = input.speedLimit;
        if (input.urlImage !== undefined) update.url_image = input.urlImage;

        const { error: updateErr } = await supabase
          .from("user_devices")
          .update(update)
          .eq("id", id);

        if (updateErr) throw updateErr;

        await fetchDevices();
        return { success: true };
      } catch (err: any) {
        console.error("[useUserDevices] updateDevice erreur:", err);
        return { success: false, error: err.message ?? "Erreur lors de la mise à jour" };
      }
    },
    [supabase, fetchDevices]
  );

  const removeDevice = useCallback(
    async (id: string) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };

      try {
        const { error: deleteErr } = await supabase
          .from("user_devices")
          .delete()
          .eq("id", id);

        if (deleteErr) throw deleteErr;

        await fetchDevices();
        return { success: true };
      } catch (err: any) {
        console.error("[useUserDevices] removeDevice erreur:", err);
        return { success: false, error: err.message ?? "Erreur lors de la suppression" };
      }
    },
    [supabase, fetchDevices]
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };

      try {
        const { error: updateErr } = await supabase
          .from("user_devices")
          .update({ is_active: active, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (updateErr) throw updateErr;

        await fetchDevices();
        return { success: true };
      } catch (err: any) {
        console.error("[useUserDevices] toggleActive erreur:", err);
        return { success: false, error: err.message ?? "Erreur" };
      }
    },
    [supabase, fetchDevices]
  );

  return {
    devices,
    loading,
    error,
    refetch: fetchDevices,
    addDevice,
    updateDevice,
    removeDevice,
    toggleActive,
  };
}
