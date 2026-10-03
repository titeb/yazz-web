"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";

export type UserStats = {
  totalVehicles: number;
  movingVehicles: number;
  activeAlerts: number;
  creditBalance: number;
  creditCurrency: string;
  creditIsActive: boolean;
  creditEstimatedExpiry: string | null;
  daysUntilExpiry: number | null;
  loading: boolean;
  error: string | null;
};

const DEFAULT_STATS: UserStats = {
  totalVehicles: 0,
  movingVehicles: 0,
  activeAlerts: 0,
  creditBalance: 0,
  creditCurrency: "CDF",
  creditIsActive: false,
  creditEstimatedExpiry: null,
  daysUntilExpiry: null,
  loading: true,
  error: null,
};

// Compteur global pour noms de channel uniques
let statsChannelCounter = 0;

/**
 * Hook qui récupère les statistiques utilisateur en temps réel.
 * - Total véhicules (user_devices)
 * - Véhicules en mouvement (last_known_positions.speed > 0 + connecté < 10 min)
 * - Alertes actives (notifications non lues)
 * - Solde crédit (user_credits)
 *
 * Toutes les valeurs sont mises à jour en Realtime via Supabase subscriptions.
 */
export function useUserStats() {
  const supabase = createClientSafe();
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-user-stats-realtime-${++statsChannelCounter}`;
  }

  const fetchStats = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured()) {
      setStats((s) => ({ ...s, loading: false }));
      return;
    }

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setStats((s) => ({ ...s, loading: false, error: "Non authentifié" }));
        return;
      }

      // ── 1. Véhicules + positions en parallèle ───────────────
      // Chaque requête est indépendante — si une échoue (ex: colonne inexistante),
      // on continue avec les autres plutôt que de tout casser.
      // Note: on sélectionne '*' sur user_devices car le nom de la colonne device_id
      // peut différer selon le schéma (parfois 'imei', parfois 'device_id').
      const [userDevicesRes, positionsRes, alertsRes, creditsRes] = await Promise.allSettled([
        supabase.from("user_devices").select("*").eq("user_id", user.id),
        supabase.from("last_known_positions").select("*"),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("user_credits").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      // Logger les erreurs individuelles (sans casser)
      if (userDevicesRes.status === "rejected") console.warn("[useUserStats] user_devices erreur:", userDevicesRes.reason);
      if (positionsRes.status === "rejected") console.warn("[useUserStats] last_known_positions erreur:", positionsRes.reason);
      if (alertsRes.status === "rejected") console.warn("[useUserStats] notifications erreur:", alertsRes.reason);
      if (creditsRes.status === "rejected") console.warn("[useUserStats] user_credits erreur:", creditsRes.reason);

      const userDevicesData = userDevicesRes.status === "fulfilled" ? userDevicesRes.value.data : null;
      const positionsData = positionsRes.status === "fulfilled" ? positionsRes.value.data : null;
      const alertsCount = alertsRes.status === "fulfilled" ? alertsRes.value.count : 0;
      const credit = creditsRes.status === "fulfilled" ? creditsRes.value.data : null;

      const totalVehicles = userDevicesData?.length ?? 0;

      // Détecter le nom de la colonne device_id (peut être 'device_id' ou 'imei')
      const firstDevice = userDevicesData?.[0] ?? {};
      const deviceIdField = "device_id" in firstDevice
        ? "device_id"
        : "imei" in firstDevice
        ? "imei"
        : "id";

      const deviceIds = new Set((userDevicesData ?? []).map((ud: any) => ud[deviceIdField]).filter(Boolean));
      const tenMinAgo = Date.now() - 10 * 60 * 1000;

      // Pour last_known_positions, le champ device_id est utilisé comme PK (cf. migration 003)
      const movingVehicles = (positionsData ?? []).filter(
        (p: any) =>
          deviceIds.has(p.device_id) &&
          (p.speed ?? 0) > 0 &&
          p.last_update &&
          new Date(p.last_update).getTime() > tenMinAgo
      ).length;

      const activeAlerts = alertsCount ?? 0;

      const balance = credit?.balance ?? 0;
      const currency = credit?.currency ?? "CDF";
      const creditIsActive = credit?.is_active ?? false;
      const estimatedExpiry = credit?.estimated_expiry ?? null;

      let daysUntilExpiry: number | null = null;
      if (estimatedExpiry) {
        const diffMs = new Date(estimatedExpiry).getTime() - Date.now();
        daysUntilExpiry = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
      }

      setStats({
        totalVehicles,
        movingVehicles,
        activeAlerts,
        creditBalance: balance,
        creditCurrency: currency,
        creditIsActive,
        creditEstimatedExpiry: estimatedExpiry,
        daysUntilExpiry,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.error("[useUserStats] erreur:", err);
      setStats((s) => ({ ...s, loading: false, error: err.message ?? "Erreur" }));
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
      fetchStats();

      // Subscribe to Realtime — session is ready
      channel = supabase
        .channel(channelNameRef.current)
        .on("postgres_changes", { event: "*", schema: "public", table: "user_devices" }, () => fetchStats())
        .on("postgres_changes", { event: "*", schema: "public", table: "last_known_positions" }, () => fetchStats())
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => fetchStats())
        .on("postgres_changes", { event: "*", schema: "public", table: "user_credits" }, () => fetchStats())
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchStats, supabase]);

  return { stats, refetch: fetchStats };
}
