"use client";

import { Search, Bell, Sun, Moon, Menu, Plus, User, LogOut, Settings, ChevronDown, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClientSafe } from "@/lib/supabase/client";
import { useUserAlerts } from "@/hooks/use-user-alerts";

type YazzTopbarProps = {
  onMobileMenu: () => void;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

export function YazzTopbar({ onMobileMenu }: YazzTopbarProps) {
  const router = useRouter();
  const supabase = createClientSafe();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Notifications
  const { alerts, unreadCount } = useUserAlerts(5);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  // Fermer les dropdowns si on clique ailleurs
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Échap pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("[signOut] erreur:", err);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-yazz-border-light bg-yazz-surface/90 px-4 backdrop-blur-md yazz-glass md:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMobileMenu}
        aria-label="Ouvrir le menu"
        className="grid h-9 w-9 place-items-center rounded-yazz-sm text-yazz-text-body transition-colors hover:bg-yazz-accent lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-yazz-text-caption" />
        <input
          type="search"
          placeholder="Rechercher un véhicule, IMEI, plaque..."
          className="font-inter h-10 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background pl-10 pr-3 text-[13px] text-yazz-text-dark placeholder:text-yazz-text-caption transition-all focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
        />
      </div>

      <div className="flex-1" />

      {/* Quick actions */}
      <div className="flex items-center gap-1.5">
        {/* Ajouter un véhicule — navigue vers /vehicles et ouvre le modal */}
        <button
          onClick={() => router.push("/vehicles?add=1")}
          className="font-inter hidden h-10 items-center gap-2 rounded-yazz-sm yazz-gradient-primary text-white px-4 text-[13px] font-semibold shadow-yazz-medium transition-all hover:shadow-yazz-elevated active:scale-[0.98] md:inline-flex"
        >
          <Plus className="h-4 w-4" />
          Ajouter un véhicule
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label="Basculer le thème"
          className="grid h-9 w-9 place-items-center rounded-yazz-sm text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
        >
          {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            className="relative grid h-9 w-9 place-items-center rounded-yazz-sm text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yazz-error px-1 text-[9px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown notifications */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-yazz-xl border border-yazz-border-light bg-yazz-surface yazz-shadow-high yazz-animate-fade-in-up">
              <div className="flex items-center justify-between border-b border-yazz-border-light px-4 py-3">
                <p className="font-outfit text-[14px] font-bold tracking-[-0.01em] text-yazz-text-dark">
                  Notifications
                </p>
                {unreadCount > 0 && (
                  <button
                    onClick={() => router.push("/alerts")}
                    className="font-inter text-[11px] font-semibold text-yazz-primary hover:underline"
                  >
                    Tout voir
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="grid place-items-center py-8 text-center">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-yazz-success/10">
                      <Bell className="h-4 w-4 text-yazz-success" />
                    </div>
                    <p className="font-outfit mt-2 text-[13px] font-semibold text-yazz-text-dark">Aucune notification</p>
                  </div>
                ) : (
                  <ul>
                    {alerts.map((a) => (
                      <li key={a.id}>
                        <button
                          onClick={() => {
                            setNotifOpen(false);
                            router.push("/alerts");
                          }}
                          className={cn(
                            "font-inter flex w-full items-start gap-3 border-b border-yazz-border-light px-4 py-3 text-left transition-colors hover:bg-yazz-accent",
                            !a.isRead && "bg-yazz-primary/5"
                          )}
                        >
                          <div className={cn(
                            "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                            a.severity === "critical" ? "bg-yazz-error" :
                            a.severity === "warning" ? "bg-yazz-warning" :
                            "bg-yazz-info"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="font-outfit truncate text-[12px] font-semibold text-yazz-text-dark">
                              {a.title}
                            </p>
                            <p className="font-inter mt-0.5 line-clamp-2 text-[11px] text-yazz-text-muted">
                              {a.message}
                            </p>
                            <p className="font-inter mt-1 text-[10px] text-yazz-text-caption">
                              {timeAgo(a.createdAt)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen(!userOpen)}
            aria-label="Menu utilisateur"
            aria-expanded={userOpen}
            className="flex items-center gap-2 rounded-yazz-sm p-1 pr-2 transition-colors hover:bg-yazz-accent"
          >
            <div className="font-outfit grid h-8 w-8 place-items-center rounded-full yazz-gradient-primary text-[11px] font-bold text-white">
              HT
            </div>
            <div className="hidden flex-col items-start leading-none md:flex">
              <span className="font-outfit text-[13px] font-semibold text-yazz-text-dark">Henock T.</span>
              <span className="font-inter text-[10px] font-medium text-yazz-text-caption">Propriétaire</span>
            </div>
            <ChevronDown className={cn("hidden h-4 w-4 text-yazz-text-caption transition-transform md:block", userOpen && "rotate-180")} />
          </button>

          {/* Dropdown user */}
          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-[260px] overflow-hidden rounded-yazz-xl border border-yazz-border-light bg-yazz-surface yazz-shadow-high yazz-animate-fade-in-up">
              {/* Header du dropdown */}
              <div className="border-b border-yazz-border-light p-4">
                <div className="flex items-center gap-3">
                  <div className="font-outfit grid h-10 w-10 place-items-center rounded-full yazz-gradient-primary text-[12px] font-bold text-white">
                    HT
                  </div>
                  <div className="min-w-0">
                    <p className="font-outfit truncate text-[13px] font-semibold text-yazz-text-dark">Henock Titebe</p>
                    <p className="font-inter truncate text-[11px] text-yazz-text-muted">Propriétaire</p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <ul className="p-2">
                <li>
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      router.push("/stats");
                    }}
                    className="font-inter flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 text-[13px] font-medium text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
                  >
                    <Settings className="h-[18px] w-[18px]" />
                    Statistiques
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      router.push("/settings");
                    }}
                    className="font-inter flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 text-[13px] font-medium text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
                  >
                    <User className="h-[18px] w-[18px]" />
                    Mon profil
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      router.push("/help");
                    }}
                    className="font-inter flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 text-[13px] font-medium text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
                  >
                    <Settings className="h-[18px] w-[18px]" />
                    Aide & support
                  </button>
                </li>
              </ul>

              {/* Logout */}
              <div className="border-t border-yazz-border-light p-2">
                <button
                  onClick={() => {
                    setUserOpen(false);
                    handleSignOut();
                  }}
                  className="font-inter flex w-full items-center gap-3 rounded-yazz-sm px-3 py-2.5 text-[13px] font-medium text-yazz-error/80 transition-colors hover:bg-yazz-error/10 hover:text-yazz-error"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
