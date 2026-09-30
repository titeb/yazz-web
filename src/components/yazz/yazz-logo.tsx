import { cn } from "@/lib/utils";

type YazzLogoProps = {
  className?: string;
  variant?: "full" | "mark";
  size?: number;
};

/**
 * YAZZ logo officiel — utilise le PNG du projet Flutter yazz user.
 * - `variant="full"` : logo complet (horizontal, avec texte)
 * - `variant="mark"` : icône carrée uniquement
 *
 * Asset source : yazz/assets/images/yazz_logo*.png
 */
export function YazzLogo({ className, variant = "full", size = 40 }: YazzLogoProps) {
  if (variant === "mark") {
    return (
      <div
        className={cn("relative inline-flex items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        <img
          src="/yazz-logo-square.png"
          alt="YAZZ"
          className="h-full w-full object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/yazz-logo-square.png"
        alt="YAZZ"
        style={{ width: size, height: size }}
        className="shrink-0 object-contain"
        draggable={false}
      />
      <div className="flex flex-col leading-none">
        <span className="font-outfit text-[20px] font-bold tracking-[-0.02em] text-yazz-text-dark">
          YAZZ
        </span>
        <span className="font-inter text-[10px] font-medium uppercase tracking-[0.18em] text-yazz-text-muted">
          GPS Tracking
        </span>
      </div>
    </div>
  );
}
