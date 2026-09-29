"use client";

import { Search, Bell, Sun, Moon, Menu, Plus, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type YazzTopbarProps = {
  onMobileMenu: () => void;
};

export function YazzTopbar({ onMobileMenu }: YazzTopbarProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
          className={cn(
            "h-10 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background pl-10 pr-3 text-sm",
            "text-yazz-text-dark placeholder:text-yazz-text-caption",
            "transition-all focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20",
          )}
        />
      </div>

      <div className="flex-1" />

      {/* Quick actions */}
      <div className="flex items-center gap-1.5">
        <button
          className="hidden h-10 items-center gap-2 rounded-yazz-sm bg-yazz-primary px-4 text-sm font-semibold text-white shadow-yazz-medium transition-all hover:bg-yazz-primary/90 hover:shadow-yazz-elevated active:scale-[0.98] md:inline-flex"
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
        <button
          aria-label="Notifications"
          className="relative grid h-9 w-9 place-items-center rounded-yazz-sm text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-yazz-error/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-yazz-error" />
          </span>
        </button>

        {/* User */}
        <button className="flex items-center gap-2 rounded-yazz-sm p-1 pr-2 transition-colors hover:bg-yazz-accent">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-yazz-gradient-primary text-xs font-bold text-white">
            HT
          </div>
          <div className="hidden flex-col items-start leading-none md:flex">
            <span className="text-[13px] font-semibold text-yazz-text-dark">Henock T.</span>
            <span className="text-[10px] font-medium text-yazz-text-caption">Propriétaire</span>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-yazz-text-caption md:block" />
        </button>
      </div>
    </header>
  );
}
