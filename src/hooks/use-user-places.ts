"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  cleanPlaceName,
  findSameName,
  haversineM,
  placeLabel,
  rowToPlace,
  typeOfName,
  type UserPlace,
} from "@/lib/yazz/places";

/** Zone d'alerte (géofence cercle) — pour savoir qui est prévenu à un lieu. */
export type PlaceZone = {
  id: string;
  deviceId: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  active: boolean;
  onEnter: boolean;
};

export type SavePlaceInput = {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  radiusM?: number;
  via?: "manual" | "map_pick";
};

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** « C'est ta maison ? » proposé par le serveur (où un véhicule passe ses nuits). */
export type PlaceSuggestion = {
  id: string;
  deviceId: string;
  lat: number;
  lng: number;
  address: string | null;
  nights: number;
};

/** Distance sous laquelle une zone est « au même endroit » qu'un lieu (comme l'assistant). */
const SAME_SPOT_M = 100;

/**
 * Lieux de l'utilisateur (table user_locations, partagée avec l'assistant)
 * et zones d'alerte, avec les actions de la page « Mes lieux ».
 */
export function useUserPlaces() {
  const isReady = isSupabaseConfigured();
  // Client sans types générés : les types de la base du projet sont incomplets
  // (insert / update typés « never »), les colonnes sont vérifiées ici.
  const supabase = createClientSafe() as unknown as SupabaseClient | null;
  const [places, setPlaces] = useState<UserPlace[]>([]);
  const [zones, setZones] = useState<PlaceZone[]>([]);
  const [suggestion, setSuggestion] = useState<PlaceSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Lit les lieux et les zones (sans toucher à l'état). */
  const load = useCallback(async (): Promise<
    { places: UserPlace[]; zones: PlaceZone[]; suggestion: PlaceSuggestion | null; error: string | null } | null
  > => {
    if (!supabase) return null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { places: [], zones: [], suggestion: null, error: "Session expirée : reconnecte-toi." };
      const [{ data: rows, error: pErr }, { data: gf }] = await Promise.all([
        supabase
          .from("user_locations")
          .select("id, name, type, lat, lng, address, radius_m, created_via, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("geofences")
          .select("id, device_id, name, center_lat, center_lng, radius_m, is_active, alert_on_enter")
          .eq("user_id", user.id),
      ]);
      if (pErr) throw pErr;
      // Suggestion en attente (table absente ou erreur : simplement aucune)
      let suggestion: PlaceSuggestion | null = null;
      const { data: sug } = await supabase
        .from("place_suggestions")
        .select("id, device_id, lat, lng, address, nights")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      const s0 = sug?.[0];
      if (s0 && Number.isFinite(Number(s0.lat)) && Number.isFinite(Number(s0.lng))) {
        suggestion = {
          id: s0.id,
          deviceId: s0.device_id,
          lat: Number(s0.lat),
          lng: Number(s0.lng),
          address: s0.address ?? null,
          nights: Number(s0.nights) || 0,
        };
      }
      return {
        suggestion,
        places: (rows ?? []).map(rowToPlace).filter((p): p is UserPlace => p !== null),
        zones: (gf ?? [])
          .map((z: any) => ({
            id: z.id,
            deviceId: z.device_id,
            name: z.name,
            lat: Number(z.center_lat),
            lng: Number(z.center_lng),
            radiusM: Number(z.radius_m) || 200,
            active: z.is_active !== false,
            onEnter: z.alert_on_enter !== false,
          }))
          .filter((z: PlaceZone) => Number.isFinite(z.lat) && Number.isFinite(z.lng)),
        error: null,
      };
    } catch (err: any) {
      console.error("[places] lecture:", err);
      return null;
    }
  }, [supabase]);

  const apply = useCallback(
    (r: Awaited<ReturnType<typeof load>>) => {
      if (r) {
        setPlaces(r.places);
        setZones(r.zones);
        setSuggestion(r.suggestion);
        setError(r.error);
      } else if (supabase) {
        setError("Impossible de charger tes lieux. Vérifie ta connexion.");
      }
      setLoading(false);
    },
    [supabase],
  );

  const refresh = useCallback(async () => apply(await load()), [apply, load]);

  // Premier chargement
  useEffect(() => {
    let alive = true;
    load().then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, [load, apply]);

  // Changements faits ailleurs (assistant, application mobile, autre onglet)
  useEffect(() => {
    if (!supabase || !isReady) return;
    const channel = supabase
      .channel("places-page-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_locations" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "geofences" }, () => refresh())
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [supabase, isReady, refresh]);

  /** Ajoute ou modifie un lieu. */
  const savePlace = useCallback(
    async (input: SavePlaceInput): Promise<Result> => {
      if (!supabase) return { ok: false, error: "Service indisponible." };
      const name = cleanPlaceName(input.name);
      if (!name) return { ok: false, error: "Donne un nom à ce lieu (ex. Maison, École)." };
      if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
        return { ok: false, error: "Choisis l'emplacement du lieu." };
      }
      const same = findSameName(places, name, input.id);
      if (same) return { ok: false, error: `« ${placeLabel(same.name)} » existe déjà. Choisis un autre nom.` };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Session expirée : reconnecte-toi." };

      const row = {
        name: name.toLowerCase(),
        type: typeOfName(name),
        lat: input.lat,
        lng: input.lng,
        address: input.address,
        radius_m: Math.min(1000, Math.max(50, Math.round(input.radiusM ?? 150))),
      };
      const { error: err } = input.id
        ? await supabase.from("user_locations").update(row).eq("id", input.id).eq("user_id", user.id)
        : await supabase
            .from("user_locations")
            .insert({ ...row, user_id: user.id, created_via: input.via ?? "manual" });
      if (err) {
        if ((err as any).code === "23505") {
          return { ok: false, error: `« ${placeLabel(name)} » existe déjà. Choisis un autre nom.` };
        }
        console.error("[places] enregistrement:", err);
        return { ok: false, error: "Enregistrement impossible. Réessaie." };
      }
      await refresh();
      return { ok: true };
    },
    [supabase, places, refresh],
  );

  const deletePlace = useCallback(
    async (id: string): Promise<Result> => {
      if (!supabase) return { ok: false, error: "Service indisponible." };
      const { error: err } = await supabase.from("user_locations").delete().eq("id", id);
      if (err) return { ok: false, error: "Suppression impossible. Réessaie." };
      await refresh();
      return { ok: true };
    },
    [supabase, refresh],
  );

  /** Zones actives qui préviennent à l'arrivée sur ce lieu (au même endroit). */
  const alertsAt = useCallback(
    (place: UserPlace) =>
      zones.filter(
        (z) => z.active && z.onEnter && haversineM(z.lat, z.lng, place.lat, place.lng) < SAME_SPOT_M,
      ),
    [zones],
  );

  /**
   * « Préviens-moi quand ce véhicule arrive à ce lieu » : crée la même zone
   * que l'assistant (cercle de 200 m, alerte à l'entrée), sauf si elle
   * existe déjà.
   */
  const addArrivalAlert = useCallback(
    async (place: UserPlace, vehicle: { deviceId: string; name: string }): Promise<Result> => {
      if (!supabase) return { ok: false, error: "Service indisponible." };
      if (alertsAt(place).some((z) => z.deviceId === vehicle.deviceId)) {
        return { ok: true, message: `C'est déjà en place pour ${vehicle.name}.` };
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Session expirée : reconnecte-toi." };
      const { error: err } = await supabase.from("geofences").insert({
        user_id: user.id,
        device_id: vehicle.deviceId,
        name: placeLabel(place.name),
        type: "circle",
        center_lat: place.lat,
        center_lng: place.lng,
        radius_m: 200,
        color: "#2B44EE",
        is_active: true,
        alert_on_enter: true,
        alert_on_exit: false,
      });
      if (err) {
        console.error("[places] alerte:", err);
        return { ok: false, error: "Impossible de créer l'alerte pour ce véhicule." };
      }
      await refresh();
      return { ok: true, message: `Tu seras prévenu quand ${vehicle.name} arrive à « ${placeLabel(place.name)} ».` };
    },
    [supabase, alertsAt, refresh],
  );

  /** Arrêter d'être prévenu (supprime la zone d'arrivée). */
  const removeArrivalAlert = useCallback(
    async (zoneId: string): Promise<Result> => {
      if (!supabase) return { ok: false, error: "Service indisponible." };
      const { error: err } = await supabase.from("geofences").delete().eq("id", zoneId);
      if (err) return { ok: false, error: "Impossible d'arrêter cette alerte." };
      await refresh();
      return { ok: true };
    },
    [supabase, refresh],
  );

  /** Réponse à « C'est ta maison ? » : Oui → lieu « Maison » ; Non → plus jamais ici. */
  const answerSuggestion = useCallback(
    async (s: PlaceSuggestion, yes: boolean): Promise<Result> => {
      if (!supabase) return { ok: false, error: "Service indisponible." };
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { ok: false, error: "Session expirée : reconnecte-toi." };
      if (yes) {
        const home = findSameName(places, "maison");
        if (home) return { ok: false, error: "Tu as déjà une « Maison ». Modifie-la si elle a changé." };
        const { error: err } = await supabase.from("user_locations").insert({
          user_id: user.id,
          name: "maison",
          type: "home",
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          radius_m: 150,
          created_via: "manual",
        });
        if (err) return { ok: false, error: "Enregistrement impossible. Réessaie." };
      }
      await supabase
        .from("place_suggestions")
        .update({ status: yes ? "accepted" : "dismissed", decided_at: new Date().toISOString() })
        .eq("id", s.id)
        .eq("user_id", user.id);
      await refresh();
      return {
        ok: true,
        message: yes ? "« Maison » est enregistrée." : "D'accord, on ne te le demandera plus pour cet endroit.",
      };
    },
    [supabase, places, refresh],
  );

  return {
    isReady,
    places,
    zones,
    suggestion,
    answerSuggestion,
    loading,
    error,
    refresh,
    savePlace,
    deletePlace,
    alertsAt,
    addArrivalAlert,
    removeArrivalAlert,
  };
}
