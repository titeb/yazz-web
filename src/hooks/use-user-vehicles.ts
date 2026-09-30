"use client";

import { useEffect, useState, useCallback } from "react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/yazz/types/database";

type UserDevice = Database["public"]["Tables"]["user_devices"]["Row"];
type LastKnownPosition = Database["public"]["Tables"]["last_known_positions"]["Row"];
type Device = Database["public"]["Tables"]["devices"]["Row"];

export type VehicleWithPosition = {
  id: string; // user_device.id
  deviceId: string; // device IMEI
  name: string;
  plate: string | null;
  status: "moving" | "idle" | "offline" | "alert";
  speed: number;
  battery: number | null;
  lastUpdate: string;
  position: { x: number; y: number };
  lat: number;
  lng: number;
  heading: number;
  address: string;
  todayDistanceKm: number;
};

/**
 * Hook qui récupère les devices de l'utilisateur connecté,
 * leurs dernières positions, et souscrit aux mises à jour Realtime.
 *
 * Si Supabase n'est pas configuré, retourne un tableau vide
 * (l'app utilise alors les données mockées en fallback).
 */
export function useUserVehicles() {
  const supabase = createClientSafe();
  const [vehicles, setVehicles] = useState<VehicleWithPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computeStatus = (
    pos: LastKnownPosition | null,
    device: Device | null
  ): VehicleWithPosition["status"] => {
    if (!pos) return "offline";
    const lastUpdate = new Date(pos.last_update).getTime();
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    if (lastUpdate < tenMinAgo) return "offline";
    if (device?.engine_cut_state) return "alert";
    if (pos.battery_percent !== null && pos.battery_percent < 20) return "alert";
    if ((pos.speed ?? 0) > 0) return "moving";
    return "idle";
  };

  const fetchVehicles = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured()) return;

    try {
      setLoading(true);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setError("Non authentifié");
        setLoading(false);
        return;
      }

      const { data: userDevices, error: udErr } = await supabase
        .from("user_devices")
        .select("*")
        .eq("user_id", user.id);

      if (udErr) throw udErr;
      if (!userDevices || userDevices.length === 0) {
        setVehicles([]);
        setLoading(false);
        return;
      }

      // Debug : inspecter le schéma réel (au premier fetch)
      // (désactivé en prod — décommenter pour debug)
      // if (userDevices.length > 0) {
      //   const firstRow = userDevices[0] as any;
      //   const cols = Object.keys(firstRow);
      //   console.log("[useUserVehicles] user_devices columns:", cols.join(", "));
      // }

      // Détecter le nom de la colonne device_id (peut être 'device_id', 'imei', etc.)
      const firstDeviceRow = userDevices[0] as any;
      const deviceIdField = "device_id" in firstDeviceRow
        ? "device_id"
        : "imei" in firstDeviceRow
        ? "imei"
        : "id" in firstDeviceRow
        ? "id"
        : null;

      if (!deviceIdField) {
        console.error("[useUserVehicles] Aucune colonne device_id/imei/id trouvée dans user_devices");
        setVehicles([]);
        setLoading(false);
        return;
      }

      const deviceIds = userDevices.map((ud: any) => ud[deviceIdField]).filter(Boolean);

      // Récupère les devices correspondants (catalogue devices — 2e requête)
      const { data: devicesData, error: devErr } = await supabase
        .from("devices")
        .select("*")
        .in("id", deviceIds);

      if (devErr) {
        console.warn("[useUserVehicles] devices query erreur (non bloquant):", devErr.message);
      }

      const devicesMap = new Map<string, any>();
      devicesData?.forEach((d: any) => devicesMap.set(d.id, d));

      const { data: positions, error: posErr } = await supabase
        .from("last_known_positions")
        .select("*")
        .in("device_id", deviceIds);

      if (posErr) {
        console.warn("[useUserVehicles] last_known_positions query erreur (non bloquant):", posErr.message);
      }

      // Debug : inspecter le schéma réel
      // (désactivé en prod — décommenter pour debug)
      // if (positions && positions.length > 0) {
      //   const cols = Object.keys(positions[0] as any);
      //   console.log("[useUserVehicles] last_known_positions columns:", cols.join(", "));
      // } else if (positions && positions.length === 0) {
      //   console.log("[useUserVehicles] last_known_positions vide pour deviceIds:", deviceIds.join(","));
      // }

      const positionsMap = new Map<string, any>();
      positions?.forEach((p: any) => positionsMap.set(p.device_id, p));

      const vehiclesData: VehicleWithPosition[] = userDevices.map((ud: any) => {
        const deviceId = ud[deviceIdField];
        const pos = positionsMap.get(deviceId);
        const device = devicesMap.get(deviceId) ?? null;
        const status = computeStatus(pos, device);

        const lat = pos?.latitude ?? -4.325;
        const lng = pos?.longitude ?? 15.313;
        // Projection lat/lng → x/y pour rétrocompat carte (Kinshasa approx)
        const x = ((lng - 15.2) / 0.2) * 100;
        const y = ((-4.2 - lat) / 0.2) * 100;

        // Hiérarchie des noms : name > nickname > vehicle_plate > short_id > device.name > fallback
        const vehicleName =
          ud.name ||
          ud.nickname ||
          ud.vehicle_plate ||
          (ud.short_id ? `Capteur ${ud.short_id}` : null) ||
          device?.name ||
          (deviceId ? `Capteur ${String(deviceId).slice(-6)}` : "Capteur inconnu");

        return {
          id: ud.id ?? deviceId,
          deviceId,
          name: vehicleName,
          plate: ud.vehicle_plate ?? null,
          status,
          speed: pos?.speed ?? 0,
          battery: pos?.battery_percent ?? null,
          lastUpdate: pos?.last_update ?? new Date().toISOString(),
          position: { x, y },
          lat,
          lng,
          heading: pos?.heading ?? 0,
          address: "—",
          todayDistanceKm: 0,
        };
      });

      setVehicles(vehiclesData);
      setError(null);
    } catch (err: any) {
      console.error("[useUserVehicles] erreur:", err);
      setError(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    fetchVehicles();

    const channel = supabase
      .channel("yazz-vehicles-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "last_known_positions",
        },
        () => fetchVehicles()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_devices",
        },
        () => fetchVehicles()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchVehicles, supabase]);

  return { vehicles, loading, error, refetch: fetchVehicles };
}
