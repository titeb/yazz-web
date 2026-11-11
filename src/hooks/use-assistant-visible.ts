"use client";

import { useEffect, useState } from "react";
import { createClientSafe } from "@/lib/supabase/client";

/**
 * Règle de l'interrupteur de l'assistant (yazz-admin → Paramètres → Assistant IA),
 * la même que l'app et le serveur :
 *  - voice_assistant_enabled = true : bouton visible pour tout le monde ;
 *  - sinon visible seulement pour les comptes de voice_assistant_beta_users
 *    (compte du propriétaire, pour les démos).
 */
export function assistantVisibleFor(enabled: unknown, always: unknown, userId: string | null): boolean {
  if (enabled === true || enabled === "true") return true;
  return !!userId && Array.isArray(always) && always.includes(userId);
}

/** Le bouton de l'assistant est-il visible pour le compte connecté ? (caché en attendant) */
export function useAssistantVisible(): { visible: boolean; ready: boolean } {
  // Sans Supabase (démo hors ligne) : caché tout de suite
  const [state, setState] = useState(() => ({ visible: false, ready: !createClientSafe() }));

  useEffect(() => {
    const supabase = createClientSafe();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: auth }, { data: rows }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from("app_settings").select("key, value").in("key", ["voice_assistant_enabled", "voice_assistant_beta_users"]),
        ]);
        const get = (k: string) => (rows as { key: string; value: unknown }[] | null)?.find((r) => r.key === k)?.value;
        const visible = assistantVisibleFor(get("voice_assistant_enabled"), get("voice_assistant_beta_users"), auth?.user?.id ?? null);
        if (!cancelled) setState({ visible, ready: true });
      } catch {
        if (!cancelled) setState({ visible: false, ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
