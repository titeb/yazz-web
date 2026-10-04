"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/yazz/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type AlertItem = {
  id: string;
  vehicleId: string | null;
  vehicleName: string;
  plate: string | null;
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical" | null;
  isRead: boolean;
  createdAt: string;
};

export type UseUserAlertsResult = {
  alerts: AlertItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteAlert: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteAllRead: () => Promise<{ success: boolean; error?: string; count?: number }>;
};

// Compteur global pour générer des noms de channel uniques
// (sinon Supabase casse quand le même hook est monté 2x avec le même channel name)
let channelCounter = 0;

const VEHICLE_NAME_CACHE = new Map<string, { name: string; plate: string | null }>();

/**
 * Hook qui récupère les notifications de l'utilisateur (feed alertes).
 * Top N notifications triées par date desc.
 * Realtime : nouvelle notification → re-fetch automatique.
 */
export function useUserAlerts(limit = 20): UseUserAlertsResult {
  const supabase = createClientSafe();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-alerts-realtime-${++channelCounter}`;
  }

  const fetchAlerts = useCallback(async () => {
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

      // 1. Récupère les notifications
      const { data: notifs, error: notifErr } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (notifErr) throw notifErr;
      if (!notifs || notifs.length === 0) {
        setAlerts([]);
        setError(null);
        setLoading(false);
        return;
      }

      // 2. Récupère les user_devices correspondants pour avoir nickname + plaque
      const deviceIds = Array.from(new Set(notifs.map((n) => n.device_id).filter(Boolean))) as string[];
      let devicesMap = new Map<string, { nickname: string | null; vehicle_plate: string | null }>();

      if (deviceIds.length > 0) {
        const { data: userDevices } = await supabase
          .from("user_devices")
          .select("device_id, nickname, vehicle_plate")
          .in("device_id", deviceIds);
        userDevices?.forEach((ud) => {
          devicesMap.set(ud.device_id, {
            nickname: ud.nickname,
            vehicle_plate: ud.vehicle_plate,
          });
          VEHICLE_NAME_CACHE.set(ud.device_id, {
            name: ud.nickname || `Capteur ${ud.device_id.slice(-6)}`,
            plate: ud.vehicle_plate,
          });
        });
      }

      // 3. Combiner
      const alertItems: AlertItem[] = notifs.map((n: Notification) => {
        const deviceInfo = n.device_id ? devicesMap.get(n.device_id) : undefined;
        const cached = n.device_id ? VEHICLE_NAME_CACHE.get(n.device_id) : undefined;
        return {
          id: n.id,
          vehicleId: n.device_id,
          vehicleName: deviceInfo?.nickname || cached?.name || (n.device_id ? `Capteur ${n.device_id.slice(-6)}` : "Système"),
          plate: deviceInfo?.vehicle_plate ?? cached?.plate ?? null,
          type: n.type,
          title: n.title,
          message: n.message,
          severity: n.severity,
          isRead: n.is_read ?? false,
          createdAt: n.created_at,
        };
      });

      setAlerts(alertItems);
      setError(null);
    } catch (err: any) {
      console.error("[useUserAlerts] erreur:", err);
      setError(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }, [supabase, limit]);

  useEffect(() => {
    if (!supabase || !channelNameRef.current) return;

    let channel: any = null;

    const init = async () => {
      // Ensure session is loaded before subscribing to Realtime
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch initial data
      fetchAlerts();

      // Subscribe to Realtime — session is ready
      channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => fetchAlerts()
      )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchAlerts, supabase]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!supabase) return;
      try {
        await supabase.from("notifications").update({ is_read: true }).eq("id", id);
        setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
      } catch (err) {
        console.error("[useUserAlerts] markAsRead erreur:", err);
      }
    },
    [supabase]
  );

  const markAllAsRead = useCallback(async () => {
    if (!supabase) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
    } catch (err) {
      console.error("[useUserAlerts] markAllAsRead erreur:", err);
    }
  }, [supabase]);

  // Supprime une notification (RLS: user_id = auth.uid())
  const deleteAlert = useCallback(
    async (id: string) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };
      try {
        // Optimistic : retire immédiatement de la liste
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        const { error: deleteErr } = await supabase
          .from("notifications")
          .delete()
          .eq("id", id);
        if (deleteErr) throw deleteErr;
        return { success: true };
      } catch (err: any) {
        console.error("[useUserAlerts] deleteAlert erreur:", err);
        // Re-fetch pour réconcilier (en cas d'erreur, on remet la notif)
        fetchAlerts();
        return { success: false, error: err.message ?? "Erreur lors de la suppression" };
      }
    },
    [supabase, fetchAlerts]
  );

  // Supprime toutes les notifications lues (clear read)
  const deleteAllRead = useCallback(async () => {
    if (!supabase) return { success: false, error: "Supabase non configuré" };
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { success: false, error: "Non authentifié" };

      // Optimistic : retire les lues immédiatement
      const readCount = alerts.filter((a) => a.isRead).length;
      setAlerts((prev) => prev.filter((a) => !a.isRead));

      const { error: deleteErr } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .eq("is_read", true);

      if (deleteErr) throw deleteErr;
      return { success: true, count: readCount };
    } catch (err: any) {
      console.error("[useUserAlerts] deleteAllRead erreur:", err);
      fetchAlerts();
      return { success: false, error: err.message ?? "Erreur" };
    }
  }, [supabase, fetchAlerts, alerts]);

  const unreadCount = alerts.filter((a) => !a.isRead).length;

  return { alerts, unreadCount, loading, error, refetch: fetchAlerts, markAsRead, markAllAsRead, deleteAlert, deleteAllRead };
}
