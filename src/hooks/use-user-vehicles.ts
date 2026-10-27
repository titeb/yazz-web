"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  urlImage: string | null;
  accOn: boolean;
  // FIX Feature 4 : vrai fil ACC physique (iStartek in-sta bit 1).
  // NULL si non-iStartek ou iStartek sans fil orange branché.
  contactInputState: boolean | null;
  // FIX Heuristique : true si contact_input_state a déjà été true dans les 7 derniers jours.
  // Utilisé par l'UI pour décider si "Contact ✗" est certain (fil branché) ou incertain (fil non branché).
  contactInputEverTrue: boolean;
  // FIX Feature 2 : alimentation externe (iStartek system-sta bit 3).
  externalPowerStatus: boolean | null;
  externalVoltage: number | null;
  engineCutState: boolean;
};

/**
 * Hook qui récupère les devices de l'utilisateur connecté,
 * leurs dernières positions, et souscrit aux mises à jour Realtime.
 *
 * Si Supabase n'est pas configuré, retourne un tableau vide
 * (l'app utilise alors les données mockées en fallback).
 */
let vehiclesChannelCounter = 0;

export function useUserVehicles() {
  const supabase = createClientSafe();
  const [vehicles, setVehicles] = useState<VehicleWithPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-vehicles-realtime-${++vehiclesChannelCounter}`;
  }

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

      // FIX : charger aussi les capteurs PARTAGÉS avec moi (shared_devices).
      // Même logique que useUserDevices — le dashboard utilise ce hook.
      const { data: myShares } = await supabase
        .from("shared_devices")
        .select("device_id, owner_id, permission, is_expired")
        .eq("shared_with_id", user.id)
        .eq("is_expired", false);

      const sharedIds = (myShares || []).map((s: any) => s.device_id);
      let sharedUserDevices: any[] = [];
      if (sharedIds.length > 0) {
        const { data: sharedUD } = await supabase
          .from("user_devices")
          .select("*")
          .in("id", sharedIds);
        sharedUserDevices = sharedUD || [];
      }

      // Combiner owned + shared (sans doublons)
      const ownedIds = new Set((userDevices || []).map((ud: any) => ud.id));
      const sharedOnly = sharedUserDevices.filter((ud: any) => !ownedIds.has(ud.id));
      const allUserDevices = [...(userDevices || []), ...sharedOnly];

      if (allUserDevices.length === 0) {
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
      const firstDeviceRow = allUserDevices[0] as any;
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

      const deviceIds = allUserDevices.map((ud: any) => ud[deviceIdField]).filter(Boolean);

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

      // FIX Heuristique : vérifier si contact_input_state a déjà été true dans les 7 derniers jours.
      // Si oui → le fil ACC est branché, on peut faire confiance à la valeur actuelle.
      // Si non (toujours false sur 7j) ET capteur iStartek → le fil n'est probablement pas branché
      // → on affichera "Contact ✗ ?" (avec ?) pour signaler l'incertitude.
      // Requête légère : SELECT device_id seulement (pas de données GPS), LIMIT 100.
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: contactEverTrueRows } = await supabase
        .from("gps_points")
        .select("device_id")
        .eq("contact_input_state", true)
        .gte("timestamp", sevenDaysAgo.toISOString())
        .in("device_id", deviceIds)
        .limit(100);
      const contactEverTrueSet = new Set<string>(
        (contactEverTrueRows || []).map((r: any) => r.device_id)
      );

      const vehiclesData: VehicleWithPosition[] = allUserDevices.map((ud: any) => {
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
          urlImage: ud.url_image ?? ud.vehicle_photo ?? null,
          accOn: pos?.acc_status ?? false,
          // FIX Feature 4 : vrai fil ACC physique (iStartek in-sta bit 1).
          // NULL si non-iStartek ou iStartek sans fil orange branché.
          contactInputState: pos?.contact_input_state ?? null,
          // FIX Heuristique : true si contact_input_state a déjà été true dans les 7 derniers jours.
          // Si false ET contactInputState=false → fil probablement non branché → afficher "?"
          contactInputEverTrue: contactEverTrueSet.has(deviceId),
          // FIX Feature 2 : alimentation externe (iStartek system-sta bit 3).
          externalPowerStatus: pos?.external_power_status ?? null,
          externalVoltage: pos?.external_voltage ?? null,
          engineCutState: ud.engine_cut_state ?? false,
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
    if (!supabase || !channelNameRef.current) return;

    let channel: any = null;

    const init = async () => {
      // Ensure session is loaded before subscribing to Realtime
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch initial data
      fetchVehicles();

      // Subscribe to Realtime — session is ready, WebSocket will open
      channel = supabase
        .channel(channelNameRef.current)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "last_known_positions" },
          (payload) => {
            // FIX : update INSTANTANÉ depuis le payload Realtime.
            // Pas de refetch → zéro latence réseau.
            // Le payload contient la ligne complète mise à jour (payload.new).
            const newPos = payload.new as any;
            if (!newPos?.device_id) return;

            setVehicles(prev => prev.map(v => {
              if (v.deviceId !== newPos.device_id) return v;

              const lat = newPos.latitude ?? v.lat;
              const lng = newPos.longitude ?? v.lng;
              const x = ((lng - 15.2) / 0.2) * 100;
              const y = ((-4.2 - lat) / 0.2) * 100;

              // Recompute status inline (même logique que computeStatus)
              const lastUpdateMs = new Date(newPos.last_update).getTime();
              const tenMinAgo = Date.now() - 10 * 60 * 1000;
              let status: VehicleWithPosition["status"] = "idle";
              if (lastUpdateMs < tenMinAgo) status = "offline";
              else if (v.engineCutState) status = "alert";
              else if (newPos.battery_percent !== null && newPos.battery_percent < 20) status = "alert";
              else if ((newPos.speed ?? 0) > 0) status = "moving";

              return {
                ...v,
                lat,
                lng,
                position: { x, y },
                speed: newPos.speed ?? v.speed,
                battery: newPos.battery_percent ?? v.battery,
                lastUpdate: newPos.last_update ?? v.lastUpdate,
                heading: newPos.heading ?? v.heading,
                accOn: newPos.acc_status ?? v.accOn,
                // FIX Feature 4 + 2 : update Realtime des champs contact + alim
                contactInputState: newPos.contact_input_state ?? v.contactInputState,
                externalPowerStatus: newPos.external_power_status ?? v.externalPowerStatus,
                externalVoltage: newPos.external_voltage ?? v.externalVoltage,
                status,
              };
            }));
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_devices" },
          () => fetchVehicles() // user_devices change rarement (rename, photo) → refetch OK
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchVehicles, supabase]);

  return { vehicles, loading, error, refetch: fetchVehicles };
}
