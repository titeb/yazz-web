import { cn } from "@/lib/utils";

type YazzLogoProps = {
  className?: string;
  variant?: "full" | "mark";
  showText?: boolean;
};

/**
 * YAZZ logo — monogramme "Y" stylisé dans un carré arrondi
 * Couleurs officielles : gradient Bleu Électrique → Bleu Nuit
 */
export function YazzLogo({ className, variant = "full", showText = true }: YazzLogoProps) {
  if (variant === "mark" || !showText) {
    return (
      <div className={cn("relative inline-flex items-center justify-center", className)}>
        <svg viewBox="0 0 48 48" fill="none" className="h-full w-full">
          <defs>
            <linearGradient id="yazz-logo-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2B44EE" />
              <stop offset="1" stopColor="#333984" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="14" fill="url(#yazz-logo-grad)" />
          <path
            d="M14 14 L24 24 L34 14 M24 24 L24 34"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="34" r="2.5" fill="white" />
        </svg>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9">
        <defs>
          <linearGradient id="yazz-logo-grad-full" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2B44EE" />
            <stop offset="1" stopColor="#333984" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#yazz-logo-grad-full)" />
        <path
          d="M14 14 L24 24 L34 14 M24 24 L24 34"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="34" r="2.5" fill="white" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-[18px] font-extrabold tracking-tight text-yazz-text-dark">
          YAZZ
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-yazz-text-muted">
          GPS Tracking
        </span>
      </div>
    </div>
  );
}
