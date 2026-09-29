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
        .select("*, devices(*)")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (udErr) throw udErr;
      if (!userDevices || userDevices.length === 0) {
        setVehicles([]);
        setLoading(false);
        return;
      }

      const deviceIds = userDevices.map((ud) => ud.device_id);
      const { data: positions, error: posErr } = await supabase
        .from("last_known_positions")
        .select("*")
        .in("device_id", deviceIds);

      if (posErr) throw posErr;

      const positionsMap = new Map<string, LastKnownPosition>();
      positions?.forEach((p) => positionsMap.set(p.device_id, p));

      const vehiclesData: VehicleWithPosition[] = userDevices.map((ud) => {
        const pos = positionsMap.get(ud.device_id);
        const device = ud.devices as Device | null;
        const status = computeStatus(pos, device);

        const lat = pos?.latitude ?? -4.325;
        const lng = pos?.longitude ?? 15.313;
        // Projection lat/lng → x/y pour rétrocompat carte (Kinshasa approx)
        const x = ((lng - 15.2) / 0.2) * 100;
        const y = ((-4.2 - lat) / 0.2) * 100;

        return {
          id: ud.id,
          deviceId: ud.device_id,
          name: ud.nickname || device?.name || `Device ${ud.device_id.slice(-6)}`,
          plate: ud.vehicle_plate,
          status,
          speed: pos?.speed ?? 0,
          battery: pos?.battery_percent ?? null,
          lastUpdate: pos?.last_update ?? new Date().toISOString(),
          position: { x, y },
          lat,
          lng,
          heading: pos?.heading ?? 0,
          address: "Chargement de l'adresse…",
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
