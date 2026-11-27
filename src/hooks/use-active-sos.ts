"use client";

import { useEffect, useState } from "react";
import { createClientSafe } from "@/lib/supabase/client";

let activeSosChannelCounter = 0;

/**
 * Vrai si une alerte SOS est en cours sur ce véhicule, quelle que soit
 * l'interface qui l'a lancée (app, site, assistant). Mis à jour en direct :
 * lancée ou levée ailleurs, le bouton SOS change tout de suite ici.
 */
export function useActiveSos(deviceId: string | null | undefined): boolean {
  const supabase = createClientSafe();
  const [active, setActive] = useState(false);
  const [channelName] = useState(() => `yazz-active-sos-${++activeSosChannelCounter}`);

  useEffect(() => {
    if (!supabase || !deviceId) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const { data } = await supabase
          .from("sos_alerts")
          .select("id")
          .eq("device_id", deviceId)
          .eq("status", "active")
          .limit(1);
        if (!cancelled) setActive(Array.isArray(data) && data.length > 0);
      } catch {
        /* garder l'état actuel */
      }
    };
    refresh();

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts", filter: `device_id=eq.${deviceId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, deviceId, channelName]);

  return Boolean(deviceId) && active;
}
