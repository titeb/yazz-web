import {
  Car,
  Navigation,
  Bell,
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon: "car" | "moving" | "alert" | "credit";
  accent: "primary" | "success" | "warning" | "info";
};

const iconMap: Record<StatCardProps["icon"], LucideIcon> = {
  car: Car,
  moving: Navigation,
  alert: Bell,
  credit: Wallet,
};

const accentMap = {
  primary: {
    bg: "bg-yazz-primary/10",
    fg: "text-yazz-primary",
    bar: "bg-yazz-primary",
  },
  success: {
    bg: "bg-yazz-success/10",
    fg: "text-yazz-success",
    bar: "bg-yazz-success",
  },
  warning: {
    bg: "bg-yazz-warning/10",
    fg: "text-yazz-warning",
    bar: "bg-yazz-warning",
  },
  info: {
    bg: "bg-yazz-info/10",
    fg: "text-yazz-info",
    bar: "bg-yazz-info",
  },
} as const;

export function YazzStatCard({ label, value, delta, trend, icon, accent }: StatCardProps) {
  const Icon = iconMap[icon];
  const accentClasses = accentMap[accent];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-yazz-md bg-yazz-surface p-5 transition-all duration-300",
        "border border-yazz-border-light yazz-shadow-soft",
        "hover:-translate-y-0.5 hover:yazz-shadow-elevated hover:border-yazz-border-medium",
      )}
    >
      {/* Top accent bar */}
      <div className={cn("absolute left-0 top-0 h-full w-1", accentClasses.bar)} />

      <div className="flex items-start justify-between">
        <div className={cn("grid h-11 w-11 place-items-center rounded-yazz-lg", accentClasses.bg)}>
          <Icon className={cn("h-[22px] w-[22px]", accentClasses.fg)} />
        </div>

        {delta && (
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
              trend === "up" && "bg-yazz-success/10 text-yazz-success",
              trend === "down" && "bg-yazz-error/10 text-yazz-error",
              trend === "flat" && "bg-yazz-accent text-yazz-text-muted",
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {delta}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="font-inter text-[11px] font-medium uppercase tracking-[0.08em] text-yazz-text-caption">
          {label}
        </p>
        <p className="font-outfit mt-1 text-[26px] font-bold leading-tight tracking-[-0.02em] text-yazz-text-dark">
          {value}
        </p>
      </div>

      {/* Hover glow effect */}
      <div className={cn(
        "pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500",
        "group-hover:opacity-30",
        accentClasses.bg,
      )} />
    </div>
  );
}
