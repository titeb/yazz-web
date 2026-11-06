"use client";

import { useState, useEffect, useCallback } from "react";
import { useUserVehicles } from "@/hooks/use-user-vehicles";
import { isSupabaseConfigured, createClientSafe } from "@/lib/supabase/client";
import {
  Route,
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  MapPin,
  AlertTriangle,
  Play,
  X,
} from "lucide-react";
import { cn, formatDistance } from "@/lib/utils";
import { motion } from "framer-motion";
import { TripPolylineMap } from "@/components/yazz/mapbox/trip-polyline-map";
import { computeDrivingTimeMin } from "@/lib/yazz/snap-polyline";

type Trip = {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number | null;
  polyline: any[] | null;
  summary: any;
  stops?: any[];
  startAddress?: string | null;
  endAddress?: string | null;
};

function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", timeZone: "Africa/Kinshasa" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

// FIX 2026-11-02 : timeline basée sur des ÉVÉNEMENTS (pas des trajets).
// Comme la référence : Départ → Arrêt détecté → Reprise → ... → Stationnement actuel.
type TimelineEvent = {
  type: 'departure' | 'stop' | 'resume' | 'parking' | 'parking_past';
  time: string;
  timeLabel: string;
  address?: string;
  durationMin?: number;
  cumulativeKm: number;
  tripIndex?: number;
  trip?: Trip;
};

function buildTimelineEvents(
  trips: Trip[],
  addresses?: Map<string, { start?: string; end?: string }>,
  currentAddress?: string,
  isToday?: boolean
): TimelineEvent[] {
  // Pas de trip → pas d'événement (l'empty state "Aucun trajet" s'affiche)
  if (trips.length === 0) return [];

  // Fusionner les trips avec gap < 25 min
  // FIX 2026-11-06 : on retient l'id du DERNIER trajet de chaque segment fusionné.
  // Les adresses résolues (Nominatim) sont indexées par trajet d'origine : la fin
  // d'un segment fusionné est la fin de son dernier trajet, pas celle du premier.
  // Avant : l'arrêt qui suivait 2 trajets fusionnés affichait l'adresse où le
  // véhicule s'était arrêté APRÈS LE 1er trajet (ex: le resto) au lieu de
  // l'endroit où il s'est vraiment arrêté (ex: Limete).
  const mergedTrips: Trip[] = [];
  const lastTripIds: string[] = [];
  for (const trip of trips) {
    const lastMerged = mergedTrips[mergedTrips.length - 1];
    if (lastMerged && lastMerged.endedAt && trip.startedAt) {
      const gapMin = (new Date(trip.startedAt).getTime() - new Date(lastMerged.endedAt).getTime()) / 60000;
      if (gapMin < 25) {
        // Fusionner : cumuler distance + prendre endedAt du suivant
        lastMerged.distanceKm = (lastMerged.distanceKm ?? 0) + (trip.distanceKm ?? 0);
        lastMerged.endedAt = trip.endedAt;
        // L'arrivée du segment est celle du trajet ajouté (jamais celle du 1er)
        lastMerged.endAddress = trip.endAddress ?? null;
        lastTripIds[lastTripIds.length - 1] = trip.id;
        if (trip.polyline && lastMerged.polyline) {
          lastMerged.polyline = [...lastMerged.polyline, ...trip.polyline];
        } else if (trip.polyline) {
          lastMerged.polyline = trip.polyline;
        }
        if (trip.summary && lastMerged.summary) {
          lastMerged.summary = {
            max_speed: Math.max(lastMerged.summary.max_speed ?? 0, trip.summary.max_speed ?? 0),
            avg_speed: lastMerged.summary.avg_speed,
            point_count: (lastMerged.summary.point_count ?? 0) + (trip.summary.point_count ?? 0),
          };
        }
        continue;
      }
    }
    // Pas de fusion → ajouter tel quel
    mergedTrips.push({ ...trip });
    lastTripIds.push(trip.id);
  }

  // Adresse d'arrivée d'un segment : adresse en DB, sinon adresse résolue
  // du DERNIER trajet du segment.
  const endAddressOf = (i: number): string | undefined =>
    mergedTrips[i].endAddress ?? addresses?.get(lastTripIds[i])?.end ?? undefined;

  // Construire les événements à partir des trips fusionnés
  const events: TimelineEvent[] = [];
  let cumulativeKm = 0;

  for (let i = 0; i < mergedTrips.length; i++) {
    const trip = mergedTrips[i];

    // Départ (premier segment) ou Reprise (segments suivants — uniquement après un arrêt)
    events.push({
      type: i === 0 ? 'departure' : 'resume',
      time: trip.startedAt,
      timeLabel: new Date(trip.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kinshasa" }),
      address: trip.startAddress ?? addresses?.get(trip.id)?.start ?? undefined,
      cumulativeKm,
      tripIndex: i,
      trip,
    });

    cumulativeKm += trip.distanceKm ?? 0;

    // Arrêt entre ce segment et le suivant (si gap > 25 min)
    if (trip.endedAt && i < mergedTrips.length - 1) {
      const nextTrip = mergedTrips[i + 1];
      const gapMin = (new Date(nextTrip.startedAt).getTime() - new Date(trip.endedAt).getTime()) / 60000;
      if (gapMin > 25) {
        events.push({
          type: 'stop',
          time: trip.endedAt,
          timeLabel: new Date(trip.endedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kinshasa" }),
          address: endAddressOf(i),
          durationMin: gapMin,
          cumulativeKm,
        });
      }
    }

    // Stationnement (dernier segment terminé + véhicule arrêté > 25 min)
    // FIX 2026-11-04 : si jour passé → "parking_past" au lieu de "parking"
    // pour différencier "Stationnement actuel" (aujourd'hui) vs "Stationnement" (jour passé)
    if (i === mergedTrips.length - 1 && trip.endedAt) {
      const parkedMin = (Date.now() - new Date(trip.endedAt).getTime()) / 60000;
      if (parkedMin > 25) {
        events.push({
          type: isToday ? 'parking' : 'parking_past',
          time: trip.endedAt,
          timeLabel: new Date(trip.endedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kinshasa" }),
          // FIX 2026-11-06 : aujourd'hui → position actuelle du véhicule ;
          // jour passé → là où il s'est garé ce jour-là (avant : la position
          // actuelle s'affichait aussi pour les jours passés).
          address: isToday ? (currentAddress ?? endAddressOf(i)) : endAddressOf(i),
          durationMin: parkedMin,
          cumulativeKm,
        });
      }
    }
  }

  return events;
}

export default function HistoryPage() {
  const isReady = isSupabaseConfigured();
  const { vehicles, loading: vehiclesLoading } = useUserVehicles();
  const supabase = createClientSafe();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  // FIX 2026-11-02 : résolution d'adresses via Nominatim (comme Flutter TripAddressResolver).
  // Les trips en DB ont start_address/end_address = null. On résout côté client
  // à partir des coordonnées du polyline (premier + dernier point).
  const [tripAddresses, setTripAddresses] = useState<Map<string, { start?: string; end?: string }>>(new Map());
  // FIX 2026-11-04 : adresse de la position ACTUELLE du véhicule (pour "Stationnement actuel")
  // Utilise last_known_positions → même adresse que le dashboard.
  const [currentAddress, setCurrentAddress] = useState<string | undefined>(undefined);
  // FIX 2026-11-03 : état de chargement des adresses pour shimmer loading
  const [addressesLoading, setAddressesLoading] = useState(false);

  // Auto-sélectionner le 1er véhicule
  useEffect(() => {
    if (!selectedDeviceId && vehicles.length > 0) {
      setSelectedDeviceId(vehicles[0].deviceId);
    }
  }, [vehicles, selectedDeviceId]);

  // FIX 2026-11-04 : résoudre l'adresse de la position ACTUELLE du véhicule sélectionné.
  // Utilise last_known_positions (même source que le dashboard) → adresse identique.
  useEffect(() => {
    const vehicle = vehicles.find((v) => v.deviceId === selectedDeviceId);
    if (!vehicle || !vehicle.lat || !vehicle.lng) {
      setCurrentAddress(undefined);
      return;
    }
    let cancelled = false;
    // Vérifier le cache localStorage d'abord
    const cacheKey = `geo:${vehicle.lat.toFixed(4)},${vehicle.lng.toFixed(4)}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setCurrentAddress(cached); return; }
    } catch {}

    // Sinon, résoudre via Nominatim
    fetch(`/api/geocode/reverse?lat=${vehicle.lat}&lng=${vehicle.lng}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.fullAddress) return;
        setCurrentAddress(data.fullAddress);
        try { localStorage.setItem(cacheKey, data.fullAddress); } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [vehicles, selectedDeviceId]);

  const fetchTrips = useCallback(async () => {
    if (!supabase || !isReady || !selectedDeviceId) return;

    try {
      setLoading(true);
      setError(null);

      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error: tripsErr } = await supabase
        .from("trips")
        .select("*")
        .eq("device_id", selectedDeviceId)
        .gte("started_at", startOfDay.toISOString())
        .lte("started_at", endOfDay.toISOString())
        .order("started_at", { ascending: true });

      if (tripsErr) throw tripsErr;

      const tripsData: Trip[] = (data ?? []).map((t: any) => ({
        id: t.id,
        deviceId: t.device_id,
        startedAt: t.started_at,
        endedAt: t.ended_at,
        distanceKm: t.distance_km,
        polyline: Array.isArray(t.polyline) ? t.polyline : null,
        summary: t.summary,
        stops: t.stops,
        startAddress: t.start_address,
        endAddress: t.end_address,
      }));

      setTrips(tripsData);
    } catch (err: any) {
      console.error("[history] erreur:", err);
      setError(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }, [supabase, isReady, selectedDeviceId, selectedDate]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  // FIX 2026-11-02 : résoudre les adresses des trips via Nominatim.
  // Comme Flutter TripAddressResolver — prend le premier et dernier point
  // du polyline et fait un reverse geocoding. Les adresses sont null en DB.
  useEffect(() => {
    if (trips.length === 0) return;
    let cancelled = false;

    const resolveAddresses = async () => {
      const addresses = new Map<string, { start?: string; end?: string }>();

      // FIX 2026-11-03 : cache localStorage pour éviter de re-appeler Nominatim
      // à chaque chargement de page. La 1ère fois = lent (Nominatim), ensuite = instantané.
      const getCacheKey = (lat: number, lng: number) => `geo:${lat.toFixed(4)},${lng.toFixed(4)}`;
      const getCached = (lat: number, lng: number): string | null => {
        try { return localStorage.getItem(getCacheKey(lat, lng)); } catch { return null; }
      };
      const setCached = (lat: number, lng: number, addr: string) => {
        try { localStorage.setItem(getCacheKey(lat, lng), addr); } catch {}
      };

      // FIX 2026-11-03 : résolution en PARALLÈLE (Promise.all) au lieu de
      // séquentiel. Avant : 6 appels × 800ms = 4.8s. Maintenant : ~0.8s.
      const promises: Promise<void>[] = [];

      for (const trip of trips) {
        if (cancelled) break;

        // Skip si déjà résolu (trip a déjà ses adresses en DB)
        if (trip.startAddress && trip.endAddress) {
          addresses.set(trip.id, { start: trip.startAddress, end: trip.endAddress });
          continue;
        }

        // Extraire les coordonnées du polyline
        if (!trip.polyline || !Array.isArray(trip.polyline) || trip.polyline.length === 0) continue;
        const firstPoint = trip.polyline[0];
        const lastPoint = trip.polyline[trip.polyline.length - 1];

        // Helper : résoudre 1 adresse (cache localStorage → Nominatim → cache)
        const resolveOne = async (lat?: number, lng?: number, dbAddr?: string | null): Promise<string | undefined> => {
          if (dbAddr) return dbAddr;
          if (!lat || !lng) return undefined;
          // 1. Vérifier le cache localStorage (instantané)
          const cached = getCached(lat, lng);
          if (cached) return cached;
          // 2. Appeler Nominatim (lent, mais seulement la 1ère fois)
          try {
            const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
            if (res.ok) {
              const data = await res.json();
              if (data.fullAddress) {
                setCached(lat, lng, data.fullAddress); // Sauver dans le cache
                return data.fullAddress;
              }
            }
          } catch { /* silencieux */ }
          return undefined;
        };

        // Créer les promises pour start + end en parallèle
        promises.push(
          Promise.all([
            resolveOne(firstPoint?.lat, firstPoint?.lng, trip.startAddress),
            resolveOne(lastPoint?.lat, lastPoint?.lng, trip.endAddress),
          ]).then(([startAddr, endAddr]) => {
            addresses.set(trip.id, { start: startAddr, end: endAddr });
          })
        );
      }

      // Attendre que toutes les adresses soient résolues en parallèle
      await Promise.all(promises);

      if (!cancelled) {
        setTripAddresses(addresses);
        setAddressesLoading(false);
      }
    };

    resolveAddresses();
    setAddressesLoading(true);

    return () => { cancelled = true; };
  }, [trips]);

  const navigateDay = (delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + delta);
    setSelectedDate(newDate);
  };

  const isToday = isSameDay(selectedDate, new Date());
  const isFuture = selectedDate > new Date();

  // Stats du jour
  // FIX 2026-11-04 : stats clarifiées pour l'utilisateur
  // 1. Temps de conduite = somme des durées de chaque trip (uniquement le temps à rouler)
  // 2. Distance parcourue = somme des distances
  // 3. Vitesse maximale = vitesse max atteinte dans la journée
  // 4. Temps d'arrêt = somme des gaps > 25 min entre les trips (+ stationnement actuel si > 25 min)
  const totalDistance = trips.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0);
  const totalDriveMin = trips.reduce((sum, t) => {
    if (!t.endedAt) return sum;
    return sum + (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 60000;
  }, 0);
  const maxSpeed = trips.reduce((max, t) => Math.max(max, t.summary?.max_speed ?? 0), 0);
  const totalStopMin = trips.reduce((sum, t, i) => {
    if (i === 0 || !trips[i - 1].endedAt) return sum;
    const gap = (new Date(t.startedAt).getTime() - new Date(trips[i - 1].endedAt!).getTime()) / 60000;
    return sum + (gap > 25 ? gap : 0);
  }, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">
            Historique trajets
          </h1>
          <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
            Consultez les trajets parcourus par vos véhicules.
          </p>
        </div>

        {!isReady ? (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <p className="font-inter text-[12px] text-yazz-text-muted">
              Configurez Supabase dans <code className="font-mono">.env.local</code> pour voir l'historique.
            </p>
          </div>
        ) : (
          <>
            {/* Sélecteur véhicule + date */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1 max-w-xs">
                <label className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
                  Véhicule
                </label>
                {/* Skeleton pendant chargement véhicules — évite "Aucun véhicule" trompeur */}
                {vehiclesLoading && vehicles.length === 0 ? (
                  <div className="yazz-skeleton h-11 w-full rounded-yazz-sm" />
                ) : vehicles.length === 0 ? (
                  <select
                    disabled
                    className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-caption"
                  >
                    <option value="">Aucun véhicule</option>
                  </select>
                ) : (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                  >
                    {vehicles.map((v) => (
                      <option key={v.deviceId} value={v.deviceId}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateDay(-1)}
                  className="font-inter grid h-11 w-11 place-items-center rounded-yazz-sm border border-yazz-border-light bg-yazz-background text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
                  aria-label="Jour précédent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2 rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-4 py-2.5">
                  <Calendar className="h-4 w-4 text-yazz-primary" />
                  <span className="font-outfit text-[13px] font-semibold capitalize text-yazz-text-dark">
                    {formatDate(selectedDate)}
                  </span>
                  {isToday && (
                    <span className="font-inter rounded-full bg-yazz-primary/10 px-2 py-0.5 text-[9px] font-bold text-yazz-primary">
                      Aujourd'hui
                    </span>
                  )}
                </div>

                <button
                  onClick={() => navigateDay(1)}
                  disabled={isFuture}
                  className="font-inter grid h-11 w-11 place-items-center rounded-yazz-sm border border-yazz-border-light bg-yazz-background text-yazz-text-body transition-colors hover:bg-yazz-accent hover:text-yazz-primary disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Jour suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stats du jour — skeleton pendant chargement, contenu si trips, rien sinon */}
            {trips.length > 0 ? (
              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBox icon={Clock} label="Temps de conduite" value={formatDuration(totalDriveMin)} color="text-yazz-info" bg="bg-yazz-info/10" />
                <StatBox icon={MapPin} label="Distance parcourue" value={formatDistance(totalDistance)} color="text-yazz-success" bg="bg-yazz-success/10" />
                <StatBox icon={Gauge} label="Vitesse maximale" value={`${maxSpeed} km/h`} color="text-yazz-crawling" bg="bg-yazz-crawling/10" />
                <StatBox icon={Clock} label="Temps d'arrêt" value={formatDuration(totalStopMin)} color="text-yazz-warning" bg="bg-yazz-warning/10" />
              </div>
            ) : (loading || vehiclesLoading) && !error ? (
              // FIX 2026-11-05 : skeleton stats grid pendant chargement
              // (avant : rien ne s'affichait → impression de "page vide")
              // Inclut vehiclesLoading pour couvrir la phase initiale où les
              // véhicules chargent mais selectedDeviceId n'est pas encore set.
              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBoxSkeleton />
                <StatBoxSkeleton />
                <StatBoxSkeleton />
                <StatBoxSkeleton />
              </div>
            ) : null}

            {/* Erreur */}
            {error && (
              <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
                <p className="font-inter text-[12px] text-yazz-error">{error}</p>
              </div>
            )}

            {/* Skeleton timeline pendant chargement — evite "Aucun trajet" trompeur */}
            {(loading || vehiclesLoading) && trips.length === 0 && !error && (
              <div className="space-y-2">
                <TimelineEventSkeleton />
                <TimelineEventSkeleton />
                <TimelineEventSkeleton />
              </div>
            )}

            {/* Empty state — seulement quand PLUS de chargement (sinon skeleton au-dessus) */}
            {trips.length === 0 && !loading && !vehiclesLoading && !error && (
              <div className="grid place-items-center py-12 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-accent">
                  <Route className="h-6 w-6 text-yazz-text-muted" />
                </div>
                <p className="font-outfit mt-3 text-[15px] font-semibold text-yazz-text-dark">
                  Aucun trajet
                </p>
                <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
                  Ce véhicule n'a pas enregistré de trajet ce jour-là.
                </p>
              </div>
            )}

            {/* Timeline des événements (Départ, Arrêt, Reprise, Stationnement) */}
            {(() => {
              const events = buildTimelineEvents(trips, tripAddresses, currentAddress, isToday);
              if (events.length === 0) return null;
              const eventConfig = {
                departure: { icon: Play, label: 'Départ', color: 'text-yazz-success', border: 'border-yazz-success', bg: 'bg-yazz-success/10' },
                stop: { icon: MapPin, label: 'Arrêt détecté', color: 'text-yazz-warning', border: 'border-yazz-warning', bg: 'bg-yazz-warning/10' },
                resume: { icon: Play, label: 'Reprise', color: 'text-yazz-primary', border: 'border-yazz-primary', bg: 'bg-yazz-primary/10' },
                parking: { icon: MapPin, label: 'Stationnement actuel', color: 'text-yazz-error', border: 'border-yazz-error', bg: 'bg-yazz-error/10' },
                parking_past: { icon: MapPin, label: 'Stationnement', color: 'text-yazz-text-muted', border: 'border-yazz-border-medium', bg: 'bg-yazz-accent' },
              };

              return (
                <div className="relative">
                  {/* Ligne verticale */}
                  <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-yazz-border-light" />

                  <div className="space-y-1">
                    {events.map((event, idx) => {
                      const cfg = eventConfig[event.type];
                      const Icon = cfg.icon;
                      const isClickable = event.type === 'departure' || event.type === 'resume';

                      const content = (
                        <>
                          {/* Dot + icône */}
                          <div className={cn(
                            "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-yazz-surface border-2 yazz-shadow-soft",
                            cfg.border
                          )}>
                            <Icon className={cn("h-4 w-4", cfg.color)} />
                          </div>

                          {/* Contenu de l'événement — format comme la référence */}
                          <div className="min-w-0 flex-1 pt-0.5">
                            {/* Ligne 1: Heure (grande) + Label + km à droite */}
                            {/* Si pas d'heure (véhicule n'a pas bougé) → juste le label */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {event.timeLabel && (
                                  <span className="font-outfit text-[15px] font-bold text-yazz-text-dark">
                                    {event.timeLabel.replace(":", "h")}
                                  </span>
                                )}
                                <span className={cn("font-inter text-[12px] font-semibold", cfg.color)}>
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="font-inter text-[11px] text-yazz-text-caption shrink-0">
                                {formatDistance(event.cumulativeKm)}
                              </p>
                            </div>

                            {/* Ligne 2: Adresse ou shimmer pendant le chargement */}
                            {event.address ? (
                              <p className="font-inter mt-1 text-[11px] text-yazz-text-muted">
                                {event.type === 'resume' ? `📍 Départ : ${event.address}` : `📍 ${event.address}`}
                              </p>
                            ) : addressesLoading && event.trip ? (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[11px]">📍</span>
                                <div className="h-[11px] w-48 rounded-yazz-sm bg-yazz-accent yazz-shimmer" />
                              </div>
                            ) : null}

                            {/* Ligne 3a: Texte pour Départ — adapté selon l'heure */}
                            {event.type === 'departure' && (() => {
                              // FIX 2026-11-04 : si Départ après 12h → "démarre son premier trajet"
                              // au lieu de "commence sa journée" (pas logique le soir)
                              const depHour = parseInt(event.timeLabel.split(":")[0], 10);
                              return (
                                <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                                  {depHour < 12
                                    ? "Le véhicule commence sa journée."
                                    : "Le véhicule démarre son premier trajet."}
                                </p>
                              );
                            })()}

                            {/* Ligne 3a-bis: Texte pour Reprise */}
                            {event.type === 'resume' && (
                              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                                Le véhicule reprend sa route.
                              </p>
                            )}

                            {/* Ligne 3b: Durée exacte avec icône (pour les arrêts entre trajets) */}
                            {event.type === 'stop' && event.durationMin !== undefined && (
                              <p className="font-inter mt-0.5 flex items-center gap-1 text-[10px] text-yazz-text-caption">
                                <Clock className="h-3 w-3" />
                                {formatDuration(event.durationMin)} à l'arrêt
                              </p>
                            )}

                            {/* Ligne 3c: Texte pour les arrêts entre trajets */}
                            {event.type === 'stop' && (
                              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                                Le véhicule est resté surplace depuis plus de 30 minutes.
                              </p>
                            )}

                            {/* Ligne 3d: Texte pour Stationnement actuel (aujourd'hui, en cours) */}
                            {event.type === 'parking' && event.durationMin !== undefined && (
                              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                                Le véhicule est resté surplace depuis {formatDuration(event.durationMin)}.
                              </p>
                            )}

                            {/* Ligne 3e: Texte pour Stationnement (jour passé, terminé) */}
                            {event.type === 'parking_past' && event.durationMin !== undefined && (
                              <p className="font-inter mt-0.5 text-[10px] text-yazz-text-caption">
                                Le véhicule est resté surplace pendant {formatDuration(event.durationMin)}.
                              </p>
                            )}
                          </div>
                        </>
                      );

                      if (isClickable && event.trip) {
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedTrip(event.trip!)}
                            className="relative flex w-full items-start gap-3 rounded-yazz-lg p-3 text-left transition-colors hover:bg-yazz-accent/40"
                          >
                            {content}
                          </button>
                        );
                      }

                      return (
                        <div
                          key={idx}
                          className="relative flex w-full items-start gap-3 rounded-yazz-lg p-3"
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Modal détail trajet */}
      {selectedTrip && (
        <TripDetailModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}
    </div>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-yazz-md border border-yazz-border-light bg-yazz-surface p-3 yazz-shadow-soft">
      <div className="flex items-center gap-2">
        <div className={cn("grid h-8 w-8 place-items-center rounded-yazz-lg", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <div className="min-w-0">
          <p className="font-inter text-[10px] uppercase tracking-wide text-yazz-text-caption">{label}</p>
          <p className="font-outfit text-[14px] font-bold text-yazz-text-dark">{value}</p>
        </div>
      </div>
    </div>
  );
}

// FIX 2026-11-05 : skeleton StatBox pendant le chargement.
// Mêmes dimensions que StatBox pour transition fluide.
function StatBoxSkeleton() {
  return (
    <div className="rounded-yazz-md border border-yazz-border-light bg-yazz-surface p-3">
      <div className="flex items-center gap-2">
        <div className="yazz-skeleton h-8 w-8 rounded-yazz-lg" />
        <div className="flex-1 space-y-1.5">
          <div className="yazz-skeleton yazz-skeleton-line-sm" />
          <div className="yazz-skeleton yazz-skeleton-line w-3/4" />
        </div>
      </div>
    </div>
  );
}

// FIX 2026-11-05 : skeleton timeline event pendant le chargement.
// Imite la structure d'un événement (heure + label + adresse).
function TimelineEventSkeleton() {
  return (
    <div className="rounded-yazz-xl border border-yazz-border-light bg-yazz-surface p-4 yazz-shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="yazz-skeleton h-4 w-12 rounded" />
          <div className="yazz-skeleton h-3 w-16 rounded" />
        </div>
        <div className="yazz-skeleton h-3 w-10 rounded" />
      </div>
      <div className="yazz-skeleton yazz-skeleton-line mt-2 w-2/3" />
      <div className="yazz-skeleton yazz-skeleton-line-sm mt-1.5" />
    </div>
  );
}

function TripDetailModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  // FIX 2026-11-05 : calcul du temps réel de conduite (label reste "Durée")
  // Avant : duration = (endedAt - startedAt) → inclut les arrêts < 25 min
  //         (feux rouges, embouteillages, pauses courtes), ce qui donnait des
  //         durées absurdes (1h47 pour 2.21 km, vitesse moy 0.3 km/h).
  // Maintenant : computeDrivingTimeMin() somme uniquement les intervalles
  //         entre points GPS où le véhicule a réellement bougé (> 10m),
  //         excluant donc les arrêts intra-trip < 25 min.
  // Le label reste "Durée" (plus naturel dans un modal de détail trajet).
  // Fallback : si pas de polyline (ou pas de timestamps), on retombe sur la
  //         durée brute endedAt - startedAt.
  const drivingTimeMin = (() => {
    const computed = computeDrivingTimeMin(trip.polyline);
    if (computed > 0) return computed;
    // Fallback : durée brute si pas de timestamps dans la polyline
    return trip.endedAt
      ? (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 60000
      : 0;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent hover:text-yazz-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-outfit mb-1 text-[18px] font-bold tracking-[-0.01em] text-yazz-text-dark">
          Détail du trajet
        </h2>
        <p className="font-inter mb-4 text-[12px] text-yazz-text-muted">
          {new Date(trip.startedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
        </p>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox icon={MapPin} label="Distance" value={formatDistance(trip.distanceKm)} color="text-yazz-success" bg="bg-yazz-success/10" />
          <StatBox icon={Clock} label="Durée" value={formatDuration(drivingTimeMin)} color="text-yazz-info" bg="bg-yazz-info/10" />
          <StatBox icon={Gauge} label="V. max" value={`${trip.summary?.max_speed ?? 0} km/h`} color="text-yazz-crawling" bg="bg-yazz-crawling/10" />
          <StatBox icon={Gauge} label="V. moy" value={`${trip.summary?.avg_speed ?? 0} km/h`} color="text-yazz-primary" bg="bg-yazz-primary/10" />
        </div>

        {/* Adresses */}
        {(trip.startAddress || trip.endAddress) && (
          <div className="mb-4 space-y-2 rounded-yazz-md bg-yazz-background/60 p-3">
            {trip.startAddress && (
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-yazz-success" />
                <div>
                  <p className="font-inter text-[10px] uppercase text-yazz-text-caption">Départ</p>
                  <p className="font-inter text-[12px] text-yazz-text-dark">{trip.startAddress}</p>
                </div>
              </div>
            )}
            {trip.endAddress && (
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-yazz-error" />
                <div>
                  <p className="font-inter text-[10px] uppercase text-yazz-text-caption">Arrivée</p>
                  <p className="font-inter text-[12px] text-yazz-text-dark">{trip.endAddress}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Polyline preview — carte Mapbox réelle avec ligne animée */}
        {trip.polyline && trip.polyline.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <p className="font-inter mb-2 flex items-center gap-1.5 text-[11px] font-medium text-yazz-text-body">
              <Route className="h-3 w-3 text-yazz-primary" />
              Tracé du trajet
              <span className="font-normal text-yazz-text-caption">({trip.polyline.length} points)</span>
            </p>
            <div className="relative h-[300px] overflow-hidden rounded-yazz-md border border-yazz-border-light">
              <TripPolylineMap polyline={trip.polyline} tripId={trip.id} />
            </div>
            <p className="font-inter mt-1.5 flex items-center gap-3 text-[10px] text-yazz-text-caption">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-yazz-success" /> Départ
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-yazz-primary" /> Trajet
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-yazz-error" /> Arrivée
              </span>
            </p>
          </motion.div>
        )}

        {/* Stops */}
        {trip.stops && trip.stops.length > 0 && (
          <div className="mt-4">
            <p className="font-inter mb-2 text-[11px] font-medium text-yazz-text-body">
              Arrêts ({trip.stops.length})
            </p>
            <ul className="space-y-1.5">
              {trip.stops.map((stop: any, idx: number) => (
                <li key={idx} className="flex items-center justify-between rounded-yazz-sm bg-yazz-background/60 p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-yazz-warning" />
                    <span className="font-inter text-[11px] text-yazz-text-body">
                      {new Date(stop.startedAt || stop.started_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kinshasa" })}
                    </span>
                  </div>
                  <span className="font-inter text-[11px] font-semibold text-yazz-text-muted">
                    {formatDuration((stop.durationSeconds || stop.duration_seconds || 0) / 60)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
