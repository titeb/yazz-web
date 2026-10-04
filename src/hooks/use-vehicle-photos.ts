"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClientSafe, isSupabaseConfigured } from "@/lib/supabase/client";

export type VehiclePhoto = {
  id: string;
  deviceId: string;
  url: string;
  position: number;
  createdAt: string | null;
};

export type UseVehiclePhotosResult = {
  photos: VehiclePhoto[];
  loading: boolean;
  error: string | null;
  addPhoto: (url: string) => Promise<{ success: boolean; error?: string }>;
  removePhoto: (id: string) => Promise<{ success: boolean; error?: string }>;
};

const MAX_PHOTOS = 5;

// Compteur global pour des noms de channel Realtime uniques
let vehiclePhotosChannelCounter = 0;

/**
 * Hook pour gérer les photos multiples d'un véhicule (max 5).
 *
 * Realtime optimisé : le payload est appliqué directement au state local
 * (pas de re-SELECT sur chaque event). Latence ~50-100ms.
 *
 * @param deviceId L'ID du device (IMEI). Si null, le hook ne fait rien.
 */
export function useVehiclePhotos(deviceId: string | null): UseVehiclePhotosResult {
  const supabase = createClientSafe();
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelNameRef = useRef<string | null>(null);

  if (!channelNameRef.current) {
    channelNameRef.current = `yazz-vehicle-photos-${++vehiclePhotosChannelCounter}`;
  }

  const fetchPhotos = useCallback(
    async (silent = false) => {
      if (!supabase || !isSupabaseConfigured() || !deviceId) return;

      try {
        if (!silent) setLoading(true);
        const { data, error: fetchErr } = await supabase
          .from("vehicle_photos")
          .select("*")
          .eq("device_id", deviceId)
          .order("position", { ascending: true });

        if (fetchErr) throw fetchErr;

        const photosData: VehiclePhoto[] = (data || []).map((p: any) => ({
          id: p.id,
          deviceId: p.device_id,
          url: p.url,
          position: p.position,
          createdAt: p.created_at ?? null,
        }));

        setPhotos(photosData);
        setError(null);
      } catch (err: any) {
        console.error("[useVehiclePhotos] erreur:", err);
        setError(err.message ?? "Erreur");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [supabase, deviceId]
  );

  useEffect(() => {
    if (!supabase || !deviceId || !channelNameRef.current) return;

    let channel: any = null;

    const mapRow = (r: any): VehiclePhoto => ({
      id: r.id,
      deviceId: r.device_id,
      url: r.url,
      position: r.position,
      createdAt: r.created_at ?? null,
    });

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch initial
      fetchPhotos();

      // Realtime optimisé — payload appliqué directement au state
      channel = supabase
        .channel(channelNameRef.current)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "vehicle_photos",
            filter: `device_id=eq.${deviceId}`,
          },
          (payload: any) => {
            const eventType: string = payload.eventType;
            const newRow = payload.new as any;
            const oldRow = payload.old as any;

            setPhotos((prev) => {
              if (eventType === "DELETE") {
                return prev.filter((p) => p.id !== oldRow?.id);
              }

              // INSERT ou UPDATE
              const idx = prev.findIndex((p) => p.id === newRow.id);
              const mapped = mapRow(newRow);

              if (idx === -1) {
                // Nouvelle photo — insérer à la bonne position
                const updated = [...prev, mapped];
                updated.sort((a, b) => a.position - b.position);
                return updated;
              }

              // Photo existante — remplacer
              const updated = [...prev];
              updated[idx] = mapped;
              updated.sort((a, b) => a.position - b.position);
              return updated;
            });
          }
        )
        .subscribe();
    };

    init();

    // Safety net : re-fetch silencieux toutes les 30s
    const safetyInterval = setInterval(() => {
      fetchPhotos(true);
    }, 30000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(safetyInterval);
    };
  }, [fetchPhotos, supabase, deviceId]);

  const addPhoto = useCallback(
    async (url: string) => {
      if (!supabase || !deviceId) {
        return { success: false, error: "Device ID requis" };
      }

      try {
        // Vérifier le nombre de photos existantes (max 5)
        const currentCount = photos.length;
        if (currentCount >= MAX_PHOTOS) {
          return {
            success: false,
            error: `Maximum ${MAX_PHOTOS} photos atteint`,
          };
        }

        const { error: insertErr } = await supabase
          .from("vehicle_photos")
          .insert({
            device_id: deviceId,
            url,
            position: currentCount, // Position = index actuel (à la fin)
          });

        if (insertErr) throw insertErr;

        // Le state sera mis à jour par Realtime, mais on peut forcer un re-fetch
        // pour être sûr (le Realtime peut avoir un délai)
        return { success: true };
      } catch (err: any) {
        console.error("[useVehiclePhotos] addPhoto erreur:", err);
        return {
          success: false,
          error: err.message ?? "Erreur lors de l'ajout",
        };
      }
    },
    [supabase, deviceId, photos.length]
  );

  const removePhoto = useCallback(
    async (id: string) => {
      if (!supabase) return { success: false, error: "Supabase non configuré" };

      try {
        const { error: deleteErr } = await supabase
          .from("vehicle_photos")
          .delete()
          .eq("id", id);

        if (deleteErr) throw deleteErr;

        // Le state sera mis à jour par Realtime
        return { success: true };
      } catch (err: any) {
        console.error("[useVehiclePhotos] removePhoto erreur:", err);
        return {
          success: false,
          error: err.message ?? "Erreur lors de la suppression",
        };
      }
    },
    [supabase]
  );

  return {
    photos,
    loading,
    error,
    addPhoto,
    removePhoto,
  };
}
