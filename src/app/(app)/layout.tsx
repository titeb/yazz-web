"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { YazzSidebar } from "@/components/yazz/yazz-sidebar";
import { YazzTopbar } from "@/components/yazz/yazz-topbar";
import { YazzSosVigileListener } from "@/components/yazz/yazz-sos-vigile-listener";
import { X } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Téléphone / tablette : le menu se referme dès qu'une page est ouverte
  // (sinon il restait par-dessus la nouvelle page).
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState(pathname);
  if (pathname !== menuPath) {
    setMenuPath(pathname);
    setMobileSidebarOpen(false);
  }

  // Navigateurs sans 100dvh : hauteur visible mesurée en JS (sinon le bas de
  // l'app, dont le bouton de l'assistant, passe sous la barre du navigateur).
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh")) return;
    const apply = () =>
      document.documentElement.style.setProperty("--yazz-vh", `${window.innerHeight}px`);
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  return (
    <div className="flex h-[var(--yazz-vh)] w-full overflow-hidden bg-yazz-background">
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

      {/* SOS vigile listener — affiche un toast quand une alerte SOS arrive */}
      <YazzSosVigileListener />
    </div>
  );
}
