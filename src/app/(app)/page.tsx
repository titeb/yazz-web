"use client";

import { useState, useMemo } from "react";
import { YazzMapbox } from "@/components/yazz/mapbox/yazz-mapbox";
import { YazzVehicleDetail } from "@/components/yazz/yazz-vehicle-detail";
import { YazzVehicleCard } from "@/components/yazz/yazz-vehicle-card";
import { useUserVehicles, type VehicleWithPosition } from "@/hooks/use-user-vehicles";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Database } from "lucide-react";
import { YazzAssistantFab } from "@/components/yazz/yazz-assistant-fab";

// Véhicules mockés — utilisés en fallback si Supabase n'est pas configuré
import { vehicles as mockVehicles } from "@/lib/yazz/mock-data";

function toMockVehicle(v: VehicleWithPosition) {
  return {
    id: v.id,
    imei: v.deviceId,
    name: v.name,
    plate: v.plate || "—",
    driver: undefined,
    status: v.status,
    speed: v.speed,
    battery: v.battery ?? 0,
    lastUpdate: v.lastUpdate,
    position: v.position,
    lat: v.lat,
    lng: v.lng,
    heading: v.heading,
    address: v.address,
    todayDistanceKm: v.todayDistanceKm,
    urlImage: v.urlImage,
    accOn: v.accOn,
    engineCutState: v.engineCutState,
    alerts: [],
  };
}

export default function DashboardPage() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined);

  const isSupabaseReady = isSupabaseConfigured();
  const { vehicles: realVehicles } = useUserVehicles();

  // ── Choix : vraies données Supabase ou mockées ──────────────────
  const useMockData = !isSupabaseReady;
  const vehicles = useMemo(() => {
    if (useMockData) return mockVehicles;
    return realVehicles.map(toMockVehicle);
  }, [realVehicles, useMockData]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Bannière si Supabase pas configuré (mode démo) */}
      {!isSupabaseReady && (
        <div className="absolute left-4 right-4 top-4 z-30 rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-3 backdrop-blur-sm md:left-6">
          <div className="flex items-start gap-2.5">
            <Database className="h-4 w-4 shrink-0 text-yazz-warning" />
            <div>
              <p className="font-outfit text-[12px] font-bold text-yazz-text-dark">Mode démo</p>
              <p className="font-inter text-[11px] text-yazz-text-muted">
                Données fictives — configurez <code className="font-mono">.env.local</code> pour les vraies données.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Carte plein écran (100% du viewport restant) */}
      <YazzMapbox
        vehicles={vehicles}
        selectedId={selectedVehicleId}
        onSelect={setSelectedVehicleId}
      />

      {/* Carte flottante "Mes véhicules" en haut à droite */}
      {!selectedVehicle && (
        <div className="absolute right-4 top-4 z-20 md:right-6">
          <YazzVehicleCard
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            onSelect={setSelectedVehicleId}
          />
        </div>
      )}

      {/* Panneau détail en overlay à droite quand un véhicule est sélectionné */}
      {selectedVehicle && (
        <div className="absolute right-4 top-4 z-20 max-h-[calc(100vh-120px)] w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-yazz-xl border border-yazz-border-light bg-yazz-surface yazz-shadow-high yazz-animate-slide-in-right md:right-6">
          <YazzVehicleDetail
            vehicle={selectedVehicle}
            onClose={() => setSelectedVehicleId(undefined)}
          />
        </div>
      )}

      {/* AI Assistant FAB — superposé sur la carte, en bas à gauche, visible uniquement sur le dashboard */}
      <YazzAssistantFab enabled={true} />
    </div>
  );
}
