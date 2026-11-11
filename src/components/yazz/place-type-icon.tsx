import { Briefcase, Church, GraduationCap, House, MapPin, Wrench, type LucideIcon } from "lucide-react";
import type { PlaceType } from "@/lib/yazz/places";

/** Icône de chaque type de lieu (mêmes dessins dans l'app téléphone). */
export const PLACE_TYPE_ICON: Record<PlaceType, LucideIcon> = {
  home: House,
  work: Briefcase,
  school: GraduationCap,
  church: Church,
  garage: Wrench,
  custom: MapPin,
};

/** Icône d'un lieu, d'une seule couleur (celle du texte autour). */
export function PlaceTypeIcon({ type, className }: { type: PlaceType; className?: string }) {
  const Icon = PLACE_TYPE_ICON[type] ?? MapPin;
  return <Icon className={className} strokeWidth={2} aria-hidden="true" />;
}
