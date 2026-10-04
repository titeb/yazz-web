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
import { cn } from "@/lib/utils";

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
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

export default function HistoryPage() {
  const isReady = isSupabaseConfigured();
  const { vehicles } = useUserVehicles();
  const supabase = createClientSafe();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  // Auto-sélectionner le 1er véhicule
  useEffect(() => {
    if (!selectedDeviceId && vehicles.length > 0) {
      setSelectedDeviceId(vehicles[0].deviceId);
    }
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

  const navigateDay = (delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + delta);
    setSelectedDate(newDate);
  };

  const isToday = isSameDay(selectedDate, new Date());
  const isFuture = selectedDate > new Date();

  // Stats du jour
  const totalDistance = trips.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0);
  const totalDurationMin = trips.reduce((sum, t) => {
    if (!t.endedAt) return sum;
    return sum + (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 60000;
  }, 0);
  const maxSpeed = trips.reduce((max, t) => Math.max(max, t.summary?.max_speed ?? 0), 0);

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
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background px-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
                >
                  {vehicles.length === 0 ? (
                    <option value="">Aucun véhicule</option>
                  ) : (
                    vehicles.map((v) => (
                      <option key={v.deviceId} value={v.deviceId}>
                        {v.name}
                      </option>
                    ))
                  )}
                </select>
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

            {/* Stats du jour */}
            {trips.length > 0 && (
              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBox icon={Route} label="Trajets" value={String(trips.length)} color="text-yazz-primary" bg="bg-yazz-primary/10" />
                <StatBox icon={MapPin} label="Distance" value={`${totalDistance.toFixed(2)} km`} color="text-yazz-success" bg="bg-yazz-success/10" />
                <StatBox icon={Clock} label="Durée totale" value={formatDuration(totalDurationMin)} color="text-yazz-info" bg="bg-yazz-info/10" />
                <StatBox icon={Gauge} label="Vitesse max" value={`${maxSpeed} km/h`} color="text-yazz-crawling" bg="bg-yazz-crawling/10" />
              </div>
            )}

            {/* Erreur */}
            {error && (
              <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
                <p className="font-inter text-[12px] text-yazz-error">{error}</p>
              </div>
            )}

            {/* Empty state */}
            {trips.length === 0 && !error && (
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

            {/* Liste des trajets */}
            {trips.length > 0 && (
              <ul className="space-y-2">
                {trips.map((trip, idx) => {
                  const duration = trip.endedAt
                    ? (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 60000
                    : 0;
                  return (
                    <li key={trip.id}>
                      <button
                        onClick={() => setSelectedTrip(trip)}
                        className="w-full rounded-yazz-xl border border-yazz-border-light bg-yazz-surface p-4 text-left yazz-shadow-soft transition-all hover:yazz-shadow-elevated hover:border-yazz-border-medium"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-yazz-lg yazz-gradient-primary text-white">
                              <Route className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-outfit text-[14px] font-semibold text-yazz-text-dark">
                                Trajet #{idx + 1}
                              </p>
                              <p className="font-inter mt-0.5 text-[11px] text-yazz-text-muted">
                                {new Date(trip.startedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                {trip.endedAt && (
                                  <>
                                    {" → "}
                                    {new Date(trip.endedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                  </>
                                )}
                              </p>
                              {trip.startAddress && (
                                <p className="font-inter mt-1 truncate text-[10px] text-yazz-text-caption">
                                  📍 {trip.startAddress}
                                  {trip.endAddress && ` → ${trip.endAddress}`}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-outfit text-[16px] font-bold text-yazz-primary">
                              {(trip.distanceKm ?? 0).toFixed(2)}
                              <span className="ml-0.5 text-[10px] font-normal text-yazz-text-caption">km</span>
                            </p>
                            <p className="font-inter text-[10px] text-yazz-text-caption">
                              {formatDuration(duration)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {trip.summary?.max_speed !== undefined && (
                            <span className="font-inter rounded-full bg-yazz-accent px-2 py-0.5 text-[9px] font-semibold text-yazz-text-body">
                              Max {trip.summary.max_speed} km/h
                            </span>
                          )}
                          {trip.summary?.avg_speed !== undefined && (
                            <span className="font-inter rounded-full bg-yazz-accent px-2 py-0.5 text-[9px] font-semibold text-yazz-text-body">
                              Moy {trip.summary.avg_speed} km/h
                            </span>
                          )}
                          {trip.stops && trip.stops.length > 0 && (
                            <span className="font-inter rounded-full bg-yazz-warning/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-warning">
                              {trip.stops.length} arrêt{trip.stops.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {trip.polyline && (
                            <span className="font-inter rounded-full bg-yazz-info/10 px-2 py-0.5 text-[9px] font-semibold text-yazz-info">
                              {trip.polyline.length} points
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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

function TripDetailModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const duration = trip.endedAt
    ? (new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 60000
    : 0;

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
          <StatBox icon={MapPin} label="Distance" value={`${(trip.distanceKm ?? 0).toFixed(2)} km`} color="text-yazz-success" bg="bg-yazz-success/10" />
          <StatBox icon={Clock} label="Durée" value={formatDuration(duration)} color="text-yazz-info" bg="bg-yazz-info/10" />
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

        {/* Polyline preview */}
        {trip.polyline && trip.polyline.length > 0 && (
          <div>
            <p className="font-inter mb-2 text-[11px] font-medium text-yazz-text-body">
              Tracé du trajet ({trip.polyline.length} points)
            </p>
            <div className="relative h-[300px] overflow-hidden rounded-yazz-md yazz-map-grid">
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 100 100">
                {(() => {
                  const points = trip.polyline;
                  if (points.length < 2) return null;
                  const lats = points.map((p) => p.lat);
                  const lngs = points.map((p) => p.lng);
                  const minLat = Math.min(...lats);
                  const maxLat = Math.max(...lats);
                  const minLng = Math.min(...lngs);
                  const maxLng = Math.max(...lngs);
                  const latRange = maxLat - minLat || 0.01;
                  const lngRange = maxLng - minLng || 0.01;
                  const padding = 5;

                  const path = points
                    .map((p, i) => {
                      const x = padding + ((p.lng - minLng) / lngRange) * (100 - 2 * padding);
                      const y = padding + (1 - (p.lat - minLat) / latRange) * (100 - 2 * padding);
                      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                    })
                    .join(" ");

                  return (
                    <>
                      <path d={path} stroke="#2B44EE" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      <circle
                        cx={padding + ((points[0].lng - minLng) / lngRange) * (100 - 2 * padding)}
                        cy={padding + (1 - (points[0].lat - minLat) / latRange) * (100 - 2 * padding)}
                        r="1.5"
                        fill="#38A169"
                      />
                      <circle
                        cx={padding + ((points[points.length - 1].lng - minLng) / lngRange) * (100 - 2 * padding)}
                        cy={padding + (1 - (points[points.length - 1].lat - minLat) / latRange) * (100 - 2 * padding)}
                        r="1.5"
                        fill="#E53E3E"
                      />
                    </>
                  );
                })()}
              </svg>
            </div>
            <p className="font-inter mt-1.5 text-[10px] text-yazz-text-caption">
              🟢 Départ → 🔴 Arrivée
            </p>
          </div>
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
                      {new Date(stop.startedAt || stop.started_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
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
