"use client";

import { useState, useMemo } from "react";
import { YazzStatCard } from "@/components/yazz/yazz-stat-card";
import { YazzMapPanel } from "@/components/yazz/yazz-map-panel";
import { YazzVehicleList } from "@/components/yazz/yazz-vehicle-list";
import { YazzAlertsFeed } from "@/components/yazz/yazz-alerts-feed";
import { YazzVehicleDetail } from "@/components/yazz/yazz-vehicle-detail";
import { useUserVehicles, type VehicleWithPosition } from "@/hooks/use-user-vehicles";
import { useUserStats } from "@/hooks/use-user-stats";
import { useUserAlerts } from "@/hooks/use-user-alerts";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Loader2, AlertTriangle, Database } from "lucide-react";

// Véhicules mockés — utilisés en fallback si Supabase n'est pas configuré
import { vehicles as mockVehicles, alerts as mockAlerts, stats as mockStats } from "@/lib/yazz/mock-data";

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
    heading: v.heading,
    address: v.address,
    todayDistanceKm: v.todayDistanceKm,
    alerts: [],
  };
}

export default function DashboardPage() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined);

  const isSupabaseReady = isSupabaseConfigured();
  const { vehicles: realVehicles, loading: vehiclesLoading, error: vehiclesError } = useUserVehicles();
  const { stats: realStats, loading: statsLoading } = useUserStats();
  const { alerts: realAlerts, loading: alertsLoading } = useUserAlerts(5);

  // ── Choix : vraies données Supabase ou mockées ──────────────────
  const useMockData = !isSupabaseReady;
  const vehicles = useMemo(() => {
    if (useMockData) return mockVehicles;
    return realVehicles.map(toMockVehicle);
  }, [realVehicles, useMockData]);

  const stats = useMemo(() => {
    if (useMockData) return mockStats;
    return [
      {
        id: "s1",
        label: "Total véhicules",
        value: String(realStats.totalVehicles),
        delta: realStats.totalVehicles > 0 ? `${realStats.totalVehicles} actif${realStats.totalVehicles > 1 ? "s" : ""}` : undefined,
        trend: "up" as const,
        icon: "car" as const,
        accent: "primary" as const,
      },
      {
        id: "s2",
        label: "En mouvement",
        value: String(realStats.movingVehicles),
        delta:
          realStats.totalVehicles > 0
            ? `${Math.round((realStats.movingVehicles / Math.max(realStats.totalVehicles, 1)) * 100)}% actif`
            : undefined,
        trend: "up" as const,
        icon: "moving" as const,
        accent: "success" as const,
      },
      {
        id: "s3",
        label: "Alertes actives",
        value: String(realStats.activeAlerts),
        delta: realStats.activeAlerts > 0 ? "non lues" : "rien à signaler",
        trend: realStats.activeAlerts > 0 ? ("up" as const) : ("flat" as const),
        icon: "alert" as const,
        accent: realStats.activeAlerts > 0 ? ("warning" as const) : ("success" as const),
      },
      {
        id: "s4",
        label: "Crédit solde",
        value: realStats.creditIsActive
          ? `${realStats.creditBalance.toLocaleString("fr-FR")} ${realStats.creditCurrency}`
          : "Inactif",
        delta: realStats.daysUntilExpiry !== null ? `${realStats.daysUntilExpiry}j restants` : undefined,
        trend: realStats.daysUntilExpiry !== null && realStats.daysUntilExpiry < 3 ? ("down" as const) : ("flat" as const),
        icon: "credit" as const,
        accent: realStats.daysUntilExpiry !== null && realStats.daysUntilExpiry < 3 ? ("warning" as const) : ("info" as const),
      },
    ];
  }, [realStats, useMockData]);

  const alerts = useMemo(() => {
    if (useMockData) return mockAlerts;
    return realAlerts.map((a) => ({
      id: a.id,
      vehicleId: a.vehicleId ?? "",
      vehicleName: a.vehicleName,
      plate: a.plate ?? "",
      type: (a.type as "geofence" | "speed" | "battery" | "parking" | "sos") ?? "parking",
      label: a.message || a.title,
      ts: a.createdAt,
      severity: a.severity ?? "info",
    }));
  }, [realAlerts, useMockData]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  return (
    <div className="h-full overflow-y-auto">
      {/* Bannière si Supabase pas configuré */}
      {!isSupabaseReady && (
        <div className="mx-4 mt-4 rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4 md:mx-6">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 shrink-0 text-yazz-warning" />
            <div>
              <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">Mode démo — Supabase non configuré</p>
              <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                Les données affichées sont fictives. Configure <code className="mx-1 rounded bg-yazz-surface px-1.5 py-0.5 text-[11px] font-mono">.env.local</code> avec les credentials Supabase pour activer les vraies données.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Erreur véhicules */}
      {vehiclesError && (
        <div className="mx-4 mt-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-4 md:mx-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-yazz-error" />
            <div>
              <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">Erreur de chargement des véhicules</p>
              <p className="font-inter mt-0.5 text-[12px] text-yazz-error">{vehiclesError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="px-4 pt-4 md:px-6">
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <YazzStatCard key={s.id} {...s} />
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isSupabaseReady && (vehiclesLoading || statsLoading) && (
        <div className="flex items-center justify-center px-4 pt-4 md:px-6">
          <div className="flex items-center gap-3 rounded-yazz-md bg-yazz-surface px-4 py-3 yazz-shadow-soft">
            <Loader2 className="h-4 w-4 animate-spin text-yazz-primary" />
            <span className="font-inter text-[12px] font-medium text-yazz-text-muted">
              Chargement de vos véhicules…
            </span>
          </div>
        </div>
      )}

      {/* Main dashboard grid */}
      <div className="grid h-[calc(100vh-260px)] grid-cols-1 gap-3 p-4 md:px-6 md:pb-6 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
        {/* Map area */}
        <div className="relative h-[500px] min-h-0 lg:h-auto">
          <YazzMapPanel
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            onSelect={setSelectedVehicleId}
          />
        </div>

        {/* Right side: vehicle list + alerts OR vehicle detail */}
        <div className="flex h-[500px] min-h-0 flex-col gap-3 lg:h-auto">
          {selectedVehicle ? (
            <div className="flex-1 min-h-0 overflow-hidden rounded-yazz-xl border border-yazz-border-light yazz-shadow-soft">
              <YazzVehicleDetail
                vehicle={selectedVehicle}
                onClose={() => setSelectedVehicleId(undefined)}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden rounded-yazz-xl border border-yazz-border-light yazz-shadow-soft">
              <YazzVehicleList
                vehicles={vehicles}
                selectedId={selectedVehicleId}
                onSelect={setSelectedVehicleId}
              />
            </div>
          )}

          <div className="h-48 min-h-0 overflow-hidden rounded-yazz-xl border border-yazz-border-light yazz-shadow-soft">
            <YazzAlertsFeed alerts={alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
