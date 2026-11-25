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


export function YazzStatCard({ label, value, delta, trend, icon }: StatCardProps) {
  const Icon = iconMap[icon];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  // Carte sobre : fond blanc, icône d'une seule couleur, libellé normal,
  // grand chiffre ; la tendance en petit texte (vert/rouge seulement si utile).
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-yazz-lg bg-yazz-surface p-5",
        "shadow-yazz-soft ring-1 ring-yazz-border-light/70 transition-shadow duration-200",
        "hover:shadow-yazz-medium",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-inter text-[13px] font-medium text-yazz-text-muted">{label}</p>
        <div className="grid h-9 w-9 place-items-center rounded-yazz-sm bg-yazz-accent">
          <Icon className="h-[18px] w-[18px] text-yazz-text-body" />
        </div>
      </div>

      <p className="font-outfit mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-yazz-text-dark tabular-nums">
        {value}
      </p>

      {delta && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 font-inter text-[12px] font-medium",
            trend === "up" && "text-yazz-success",
            trend === "down" && "text-yazz-error",
            trend === "flat" && "text-yazz-text-caption",
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {delta}
        </p>
      )}
    </div>
  );
}
