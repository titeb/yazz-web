"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { YazzSidebar } from "@/components/yazz/yazz-sidebar";
import { YazzTopbar } from "@/components/yazz/yazz-topbar";
import { GlobalLoading, useGlobalLoading } from "@/components/yazz/yazz-global-loading";
import { YazzSosVigileListener } from "@/components/yazz/yazz-sos-vigile-listener";
import { YazzAssistantFab } from "@/components/yazz/yazz-assistant-fab";
import { X } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { loading, showLoading, hideLoading } = useGlobalLoading();

  // Show loading on route change
  useEffect(() => {
    showLoading("Chargement...");
    const timer = setTimeout(() => hideLoading(), 500);
    return () => clearTimeout(timer);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen w-full overflow-hidden bg-yazz-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <YazzSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
          <div
            className="absolute left-0 top-0 h-full yazz-animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-full">
              <YazzSidebar
                collapsed={false}
                onToggle={() => setMobileSidebarOpen(false)}
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
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <YazzTopbar onMobileMenu={() => setMobileSidebarOpen(true)} />
        <main className="relative flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Global loading overlay */}
      <GlobalLoading state={loading} />

      {/* SOS vigile listener — affiche un toast quand une alerte SOS arrive */}
      <YazzSosVigileListener />

      {/* AI Assistant FAB — visible si feature flag voice_assistant_enabled = true */}
      <YazzAssistantFab enabled={true} />
    </div>
  );
}
