"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Car,
  Route,
  MapPin,
  Bell,
  Wallet,
  Share2,
  Settings,
  ChevronLeft,
  LifeBuoy,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { YazzLogo } from "./yazz-logo";
import { cn } from "@/lib/utils";
import { createClientSafe } from "@/lib/supabase/client";

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, href: "/" },
  { id: "vehicles", label: "Mes véhicules", icon: Car, href: "/vehicles" },
  { id: "history", label: "Historique trajets", icon: Route, href: "/history" },
  { id: "geofences", label: "Géofences", icon: MapPin, href: "/geofences" },
  { id: "alerts", label: "Alertes", icon: Bell, href: "/alerts" },
  { id: "payments", label: "Paiements", icon: Wallet, href: "/payments" },
  { id: "sharing", label: "Partages", icon: Share2, href: "/sharing" },
  { id: "settings", label: "Paramètres", icon: Settings, href: "/settings" },
];

type YazzSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  active?: string; // pour compat (utilisé si href ne match pas)
};

export function YazzSidebar({ collapsed, onToggle, active }: YazzSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClientSafe();
  const [signingOut, setSigningOut] = useState(false);

  // Détermine l'item actif par pathname
  const getIsActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleNav = (href: string) => {
    router.push(href);
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("[signOut] erreur:", err);
      setSigningOut(false);
    }
  };

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col bg-yazz-surface transition-all duration-300 ease-out",
        "border-r border-yazz-border-light",
        collapsed ? "w-[78px]" : "w-[260px]"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-4 py-5">
        {collapsed ? <YazzLogo variant="mark" size={36} /> : <YazzLogo />}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted transition-colors",
            "hover:bg-yazz-accent hover:text-yazz-primary",
            collapsed && "absolute -right-3 top-6 z-20 h-6 w-6 rounded-full border border-yazz-border-light bg-yazz-surface shadow-yazz-medium"
          )}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 no-scrollbar">
        {!collapsed && (
          <p className="font-inter px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-yazz-text-caption">
            Navigation
          </p>
        )}
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = getIsActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNav(item.href)}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 font-inter text-[13px] font-medium transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yazz-primary/30",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-yazz-primary text-white shadow-yazz-medium"
                      : "text-yazz-text-body hover:bg-yazz-accent hover:text-yazz-primary"
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-white")} />
                  {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isActive ? "bg-white/20 text-white" : "bg-yazz-crawling/15 text-yazz-crawling"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.badge && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-yazz-crawling" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-yazz-border-light p-3">
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => router.push("/help")}
              className={cn(
                "group flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 font-inter text-[13px] font-medium text-yazz-text-body transition-colors",
                "hover:bg-yazz-accent hover:text-yazz-primary",
                collapsed && "justify-center"
              )}
              title={collapsed ? "Support" : undefined}
            >
              <LifeBuoy className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>Aide & support</span>}
            </button>
          </li>
          <li>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className={cn(
                "group flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 font-inter text-[13px] font-medium text-yazz-error/80 transition-colors",
                "hover:bg-yazz-error/10 hover:text-yazz-error disabled:opacity-50",
                collapsed && "justify-center"
              )}
              title={collapsed ? "Déconnexion" : undefined}
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{signingOut ? "Déconnexion…" : "Déconnexion"}</span>}
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
