"use client";

import { useState } from "react";
import { YazzSidebar } from "@/components/yazz/yazz-sidebar";
import { YazzTopbar } from "@/components/yazz/yazz-topbar";
import { YazzStatCard } from "@/components/yazz/yazz-stat-card";
import { YazzMapPanel } from "@/components/yazz/yazz-map-panel";
import { YazzVehicleList } from "@/components/yazz/yazz-vehicle-list";
import { YazzAlertsFeed } from "@/components/yazz/yazz-alerts-feed";
import { YazzVehicleDetail } from "@/components/yazz/yazz-vehicle-detail";
import { vehicles, alerts, stats } from "@/lib/yazz/mock-data";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export default function Home() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>("v1");

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
        </main>
      </div>
    </div>
  );
}
