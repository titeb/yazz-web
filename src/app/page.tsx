"use client";

import { useState, useMemo } from "react";
import { YazzSidebar } from "@/components/yazz/yazz-sidebar";
import { YazzTopbar } from "@/components/yazz/yazz-topbar";
import { YazzStatCard } from "@/components/yazz/yazz-stat-card";
import { YazzMapbox } from "@/components/yazz/mapbox/yazz-mapbox";
import { YazzVehicleList } from "@/components/yazz/yazz-vehicle-list";
import { YazzAlertsFeed } from "@/components/yazz/yazz-alerts-feed";
import { YazzVehicleDetail } from "@/components/yazz/yazz-vehicle-detail";
import { useUserVehicles, type VehicleWithPosition } from "@/hooks/use-user-vehicles";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { YazzLogo } from "@/components/yazz/yazz-logo";

// Véhicules mockés — utilisés en fallback si Supabase n'est pas configuré
import { vehicles as mockVehicles, alerts, stats } from "@/lib/yazz/mock-data";

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

export default function Home() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined);

  // Hook pour les vraies données Supabase
  const { vehicles: realVehicles, loading, error } = useUserVehicles();

  // Si Supabase n'est pas configuré, on utilise les données mockées
  const isSupabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "your_anon_key_here";

  const vehicles = useMemo(() => {
    if (!isSupabaseConfigured || loading) return mockVehicles;
    if (realVehicles.length === 0) return mockVehicles;
    return realVehicles.map(toMockVehicle);
  }, [realVehicles, loading, isSupabaseConfigured]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-yazz-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <YazzSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          active={activeNav}
          onSelect={setActiveNav}
        />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
          <div
            className="absolute left-0 top-0 h-full yazz-animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-full">
              <YazzSidebar
                collapsed={false}
                onToggle={() => setMobileSidebarOpen(false)}
                active={activeNav}
                onSelect={(id) => {
                  setActiveNav(id);
                  setMobileSidebarOpen(false);
                }}
              />
              <button
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Fermer le menu"
                className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent lg:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <YazzTopbar onMobileMenu={() => setMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            {/* Bannière si Supabase pas configuré */}
            {!isSupabaseConfigured && (
              <div className="mx-4 mt-4 rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4 md:mx-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-yazz-warning" />
                  <div>
                    <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
                      Mode démo — Supabase non configuré
                    </p>
                    <p className="font-inter mt-0.5 text-[12px] text-yazz-text-muted">
                      Les données affichées sont fictives. Pour brancher la vraie DB, copie
                      <code className="mx-1 rounded bg-yazz-surface px-1.5 py-0.5 text-[11px] font-mono">.env.example</code>
                      en <code className="mx-1 rounded bg-yazz-surface px-1.5 py-0.5 text-[11px] font-mono">.env.local</code>
                      et remplis tes credentials Supabase + Mapbox.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Bannière d'erreur */}
            {error && (
              <div className="mx-4 mt-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-4 md:mx-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-yazz-error" />
                  <div>
                    <p className="font-outfit text-[13px] font-bold text-yazz-text-dark">
                      Erreur de chargement
                    </p>
                    <p className="font-inter mt-0.5 text-[12px] text-yazz-error">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {isSupabaseConfigured && loading && (
              <div className="flex items-center justify-center px-4 pt-4 md:px-6">
                <div className="flex items-center gap-3 rounded-yazz-md bg-yazz-surface px-4 py-3 yazz-shadow-soft">
                  <Loader2 className="h-4 w-4 animate-spin text-yazz-primary" />
                  <span className="font-inter text-[12px] font-medium text-yazz-text-muted">
                    Chargement de vos véhicules…
                  </span>
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

            {/* Main dashboard grid */}
            <div className="grid h-[calc(100vh-260px)] grid-cols-1 gap-3 p-4 md:px-6 md:pb-6 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
              {/* Map area */}
              <div className="relative h-[500px] min-h-0 lg:h-auto">
                <YazzMapbox
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
        </main>
      </div>
    </div>
  );
}
