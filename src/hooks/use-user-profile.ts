"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";

export type UserProfile = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  // Préférences (champs peuvent varier selon le schéma)
  creditNotificationsEnabled: boolean | null;
  jammingAlertsEnabled: boolean | null;
  gpsFrozenAlertsEnabled: boolean | null;
  gpsFrozenThresholdMin: number | null;
  preferredLanguage: string | null;
};

type UseUserProfileResult = {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateProfile: (input: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
};

/**
 * Hook pour gérer le profil utilisateur.
 * - Fetch depuis la table `users` (id = auth.uid())
 * - Update via Supabase JS direct (RLS user read/write own)
 * - Realtime : re-fetch sur UPDATE
 */
let profileChannelCounter = 0;

export function useUserProfile(): UseUserProfileResult {
  const supabase = createClientSafe();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-user-profile-realtime-${++profileChannelCounter}`;
  }

  const fetchProfile = useCallback(async () => {
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

      const { data, error: profileErr } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      // Si la row user n'existe pas encore, on prend les infos depuis auth.users
      if (!data) {
        setProfile({
          id: user.id,
          fullName: (user.user_metadata?.full_name as string) ?? null,
          email: user.email ?? null,
          phone: user.phone ?? null,
          avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
          creditNotificationsEnabled: null,
          jammingAlertsEnabled: null,
          gpsFrozenAlertsEnabled: null,
          gpsFrozenThresholdMin: null,
          preferredLanguage: "fr",
        });
        setError(null);
        setLoading(false);
        return;
      }

      // Mapping flexible — la table users YAZZ peut avoir différents noms de colonnes
      const p: UserProfile = {
        id: data.id,
        fullName: data.full_name ?? data.fullName ?? data.name ?? null,
        email: data.email ?? user.email ?? null,
        phone: data.phone ?? user.phone ?? null,
        avatarUrl: data.avatar_url ?? data.avatarUrl ?? null,
        creditNotificationsEnabled: data.credit_notifications_enabled ?? null,
        jammingAlertsEnabled: data.jamming_alerts_enabled ?? null,
        gpsFrozenAlertsEnabled: data.gps_frozen_alerts_enabled ?? null,
        gpsFrozenThresholdMin: data.gps_frozen_threshold_min ?? null,
        preferredLanguage: data.preferred_language ?? "fr",
      };

      setProfile(p);
      setError(null);
    } catch (err: any) {
      console.error("[useUserProfile] erreur:", err);
      setError(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !channelNameRef.current) return;

    fetchProfile();

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => fetchProfile()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProfile, supabase]);

  const updateProfile = useCallback(
    async (input: Partial<UserProfile>) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Non authentifié" };

        // Étape 1 : Lire la row existante pour détecter les colonnes présentes
        const { data: existing } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        const existingCols = existing ? Object.keys(existing) : [];

        // Étape 2 : Mapper les champs en snake_case
        const candidate: Record<string, any> = {};
        if (input.fullName !== undefined) candidate.full_name = input.fullName;
        if (input.avatarUrl !== undefined) candidate.avatar_url = input.avatarUrl;
        if (input.creditNotificationsEnabled !== undefined)
          candidate.credit_notifications_enabled = input.creditNotificationsEnabled;
        if (input.jammingAlertsEnabled !== undefined)
          candidate.jamming_alerts_enabled = input.jammingAlertsEnabled;
        if (input.gpsFrozenAlertsEnabled !== undefined)
          candidate.gps_frozen_alerts_enabled = input.gpsFrozenAlertsEnabled;
        if (input.gpsFrozenThresholdMin !== undefined)
          candidate.gps_frozen_threshold_min = input.gpsFrozenThresholdMin;
        if (input.preferredLanguage !== undefined)
          candidate.preferred_language = input.preferredLanguage;

        // Étape 3 : Ne garder que les colonnes qui existent dans le schéma
        const update: any = { updated_at: new Date().toISOString() };
        let skipped: string[] = [];
        Object.entries(candidate).forEach(([k, v]) => {
          if (existingCols.includes(k)) {
            update[k] = v;
          } else {
            skipped.push(k);
          }
        });

        if (skipped.length > 0) {
          console.warn("[useUserProfile] colonnes ignorées (inexistantes dans le schéma):", skipped.join(", "));
        }

        // Étape 4 : Si la row existe → update, sinon → insert
        if (existing) {
          const { error: updateErr } = await supabase
            .from("users")
            .update(update)
            .eq("id", user.id);
          if (updateErr) throw updateErr;
        } else {
          const insert = { id: user.id, ...update };
          const { error: insertErr } = await supabase.from("users").insert(insert);
          if (insertErr) throw insertErr;
        }

        await fetchProfile();
        return { success: true };
      } catch (err: any) {
        console.error("[useUserProfile] updateProfile erreur:", err);
        return { success: false, error: err.message ?? "Erreur lors de la mise à jour" };
      }
    },
    [supabase, fetchProfile]
  );

  return { profile, loading, error, refetch: fetchProfile, updateProfile };
}
