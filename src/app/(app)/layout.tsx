"use client";

import { useState } from "react";
import { YazzSidebar } from "@/components/yazz/yazz-sidebar";
import { YazzTopbar } from "@/components/yazz/yazz-topbar";
import { X } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
      <div className="flex flex-1 flex-col min-w-0">
        <YazzTopbar onMobileMenu={() => setMobileSidebarOpen(true)} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
