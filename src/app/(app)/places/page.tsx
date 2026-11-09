"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Car,
  Check,
  Loader2,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPlaces, type PlaceZone } from "@/hooks/use-user-places";
import { useUserVehicles, type VehicleWithPosition } from "@/hooks/use-user-vehicles";
import { PlacesMap, PlacePickerMap } from "@/components/yazz/mapbox/places-map";
import {
  addressAt,
  findSameName,
  PLACE_SUGGESTIONS,
  PLACE_TYPE_EMOJI,
  PLACE_TYPE_LABEL,
  placeLabel,
  searchAddress,
  typeOfName,
  type GeocodeResult,
  type UserPlace,
} from "@/lib/yazz/places";

type Feedback = { type: "success" | "error"; message: string } | null;

/** Véhicules dont la position est connue (pour « là où est garé… »). */
function located(vehicles: VehicleWithPosition[]) {
  return vehicles.filter(
    (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng) && !(v.lat === 0 && v.lng === 0),
  );
}

export default function PlacesPage() {
  const {
    isReady,
    places,
    loading,
    error,
    savePlace,
    deletePlace,
    alertsAt,
    addArrivalAlert,
    removeArrivalAlert,
    suggestion,
    answerSuggestion,
  } = useUserPlaces();
  const [answering, setAnswering] = useState<"yes" | "no" | null>(null);
  const { vehicles } = useUserVehicles();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserPlace | "new" | null>(null);
  const [deleting, setDeleting] = useState<UserPlace | null>(null);
  const [alerting, setAlerting] = useState<UserPlace | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const withPosition = useMemo(() => located(vehicles), [vehicles]);
  const vehicleName = (deviceId: string) => vehicles.find((v) => v.deviceId === deviceId)?.name ?? "Véhicule";

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="yazz-stagger mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {/* En-tête */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-outfit text-[24px] font-bold tracking-[-0.02em] text-yazz-text-dark">Mes lieux</h1>
            <p className="font-inter mt-1 text-[13px] text-yazz-text-muted">
              Maison, école, garage… Tes lieux, connus aussi de l&apos;assistant Yazz.
            </p>
          </div>
          {isReady && (
            <button
              onClick={() => setEditing("new")}
              className="font-inter flex h-10 shrink-0 items-center gap-2 rounded-yazz-sm yazz-gradient-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Ajouter un lieu</span>
              <span className="sm:hidden">Ajouter</span>
            </button>
          )}
        </div>

        {!isReady && (
          <div className="rounded-yazz-md border-l-4 border-l-yazz-warning bg-yazz-warning/10 p-4">
            <p className="font-inter text-[12px] text-yazz-text-muted">
              Configurez Supabase dans <code className="font-mono">.env.local</code>.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-yazz-md border-l-4 border-l-yazz-error bg-yazz-error/10 p-3">
            <p className="font-inter text-[12px] text-yazz-error">{error}</p>
          </div>
        )}

        {feedback && (
          <div
            className={cn(
              "mb-4 rounded-yazz-md border-l-4 p-3 yazz-animate-fade-in-up",
              feedback.type === "success"
                ? "border-l-yazz-success bg-yazz-success/10"
                : "border-l-yazz-error bg-yazz-error/10",
            )}
          >
            <p
              className={cn(
                "font-inter text-[12px] font-semibold",
                feedback.type === "success" ? "text-yazz-success" : "text-yazz-error",
              )}
            >
              {feedback.message}
            </p>
          </div>
        )}

        {/* « C'est ta maison ? » (endroit où un véhicule passe ses nuits) */}
        {isReady && suggestion && (
          <div className="mb-6 flex flex-col gap-4 rounded-yazz-xl border border-yazz-primary/25 bg-yazz-primary/5 p-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg bg-yazz-surface text-[22px] yazz-shadow-soft">
                🏠
              </div>
              <div className="min-w-0">
                <p className="font-outfit text-[15px] font-bold text-yazz-text-dark">C&apos;est ta maison ?</p>
                <p className="font-inter mt-0.5 text-[13px] text-yazz-text-muted">
                  {vehicleName(suggestion.deviceId)} passe ses nuits ici
                  {suggestion.address ? ` : ${suggestion.address}` : ""}.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                disabled={answering !== null}
                onClick={async () => {
                  setAnswering("no");
                  const r = await answerSuggestion(suggestion, false);
                  setAnswering(null);
                  setFeedback(r.ok ? { type: "success", message: r.message ?? "" } : { type: "error", message: r.error });
                }}
                className="font-inter h-10 flex-1 rounded-yazz-sm border border-yazz-border-light bg-yazz-surface px-4 text-[13px] font-semibold text-yazz-text-body hover:bg-yazz-accent disabled:opacity-50 sm:flex-none"
              >
                {answering === "no" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Non"}
              </button>
              <button
                disabled={answering !== null}
                onClick={async () => {
                  setAnswering("yes");
                  const r = await answerSuggestion(suggestion, true);
                  setAnswering(null);
                  setFeedback(r.ok ? { type: "success", message: r.message ?? "" } : { type: "error", message: r.error });
                }}
                className="font-inter flex h-10 flex-1 items-center justify-center gap-2 rounded-yazz-sm yazz-gradient-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium disabled:opacity-50 sm:flex-none"
              >
                {answering === "yes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span className="sm:hidden">Oui</span>
                <span className="hidden sm:inline">Oui, c&apos;est ma maison</span>
              </button>
            </div>
          </div>
        )}

        {/* Carte */}
        {isReady && (
          <div className="mb-6 h-[260px] overflow-hidden rounded-yazz-xl border border-yazz-border-light bg-yazz-accent yazz-shadow-soft md:h-[340px]">
            <PlacesMap
              places={places}
              selectedId={selectedId}
              onSelect={setSelectedId}
              fallbackCenter={withPosition[0] ? { lat: withPosition[0].lat, lng: withPosition[0].lng } : null}
            />
          </div>
        )}

        {isReady && loading && places.length === 0 && (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-yazz-primary" />
          </div>
        )}

        {/* Aucun lieu */}
        {isReady && !loading && places.length === 0 && !error && (
          <div className="grid place-items-center py-8 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-yazz-accent">
              <MapPinned className="h-6 w-6 text-yazz-text-muted" />
            </div>
            <p className="font-outfit mt-3 text-[15px] font-semibold text-yazz-text-dark">Aucun lieu enregistré</p>
            <p className="font-inter mt-1 max-w-sm text-[12px] text-yazz-text-muted">
              Ajoute ta maison, ton bureau ou l&apos;école des enfants pour être prévenu quand un véhicule y arrive.
            </p>
            <button
              onClick={() => setEditing("new")}
              className="font-inter mt-4 flex h-10 items-center gap-2 rounded-yazz-sm yazz-gradient-primary px-4 text-[13px] font-semibold text-white shadow-yazz-medium"
            >
              <Plus className="h-4 w-4" />
              Ajouter un lieu
            </button>
          </div>
        )}

        {/* Liste */}
        {isReady && places.length > 0 && (
          <div className="yazz-stagger-group grid gap-3 md:grid-cols-2">
            {places.map((p) => {
              const alerts = alertsAt(p);
              const selected = p.id === selectedId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "cursor-pointer rounded-yazz-xl border bg-yazz-surface p-4 yazz-shadow-soft transition-all hover:yazz-shadow-elevated",
                    selected ? "border-yazz-primary ring-2 ring-yazz-primary/15" : "border-yazz-border-light",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-yazz-lg bg-yazz-primary/10 text-[20px]">
                      {PLACE_TYPE_EMOJI[p.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-outfit truncate text-[15px] font-semibold text-yazz-text-dark">
                          {placeLabel(p.name)}
                        </p>
                        <span className="font-inter shrink-0 rounded-full bg-yazz-accent px-2 py-0.5 text-[9px] font-semibold uppercase text-yazz-text-caption">
                          {PLACE_TYPE_LABEL[p.type]}
                        </span>
                      </div>
                      <p className="font-inter mt-0.5 line-clamp-2 text-[12px] text-yazz-text-muted">
                        {p.address || "Adresse inconnue"}
                      </p>
                      {alerts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {alerts.map((z) => (
                            <span
                              key={z.id}
                              className="font-inter flex items-center gap-1 rounded-full bg-yazz-success/10 px-2 py-0.5 text-[10px] font-semibold text-yazz-success"
                            >
                              <Bell className="h-3 w-3" />
                              {vehicleName(z.deviceId)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 border-t border-yazz-border-light pt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAlerting(p);
                      }}
                      className="font-inter flex h-8 flex-1 items-center justify-center gap-1.5 rounded-yazz-sm bg-yazz-primary/10 text-[12px] font-semibold text-yazz-primary transition-colors hover:bg-yazz-primary/15"
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Me prévenir
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                      aria-label={`Modifier ${placeLabel(p.name)}`}
                      className="grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted transition-colors hover:bg-yazz-accent hover:text-yazz-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(p);
                      }}
                      aria-label={`Supprimer ${placeLabel(p.name)}`}
                      className="grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-error/70 transition-colors hover:bg-yazz-error/10 hover:text-yazz-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Astuce assistant */}
        {isReady && (
          <div className="mt-6 flex items-start gap-3 rounded-yazz-md bg-yazz-primary/5 p-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-yazz-primary" />
            <p className="font-inter text-[12px] text-yazz-text-muted">
              Tu peux aussi le dire à l&apos;assistant : « Retiens que là où est garée la voiture, c&apos;est ma maison »,
              puis « Préviens-moi quand elle arrive à la maison ».
            </p>
          </div>
        )}
      </div>

      {editing && (
        <PlaceEditorModal
          place={editing === "new" ? null : editing}
          places={places}
          vehicles={withPosition}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const r = await savePlace(input);
            if (r.ok) {
              setEditing(null);
              setFeedback({
                type: "success",
                message: input.id ? "Lieu modifié." : `« ${placeLabel(input.name)} » est enregistré.`,
              });
            }
            return r;
          }}
        />
      )}

      {deleting && (
        <DeletePlaceModal
          place={deleting}
          alerts={alertsAt(deleting)}
          onClose={() => setDeleting(null)}
          onConfirm={async (alsoAlerts) => {
            const r = await deletePlace(deleting.id);
            if (r.ok && alsoAlerts) {
              for (const z of alertsAt(deleting)) await removeArrivalAlert(z.id);
            }
            setFeedback(
              r.ok
                ? { type: "success", message: `« ${placeLabel(deleting.name)} » est supprimé.` }
                : { type: "error", message: r.error },
            );
            if (r.ok && selectedId === deleting.id) setSelectedId(null);
            setDeleting(null);
          }}
        />
      )}

      {alerting && (
        <ArrivalAlertModal
          place={alerting}
          vehicles={vehicles}
          alerts={alertsAt(alerting)}
          onClose={() => setAlerting(null)}
          onAdd={async (v) => {
            const r = await addArrivalAlert(alerting, { deviceId: v.deviceId, name: v.name });
            setFeedback(r.ok ? { type: "success", message: r.message ?? "Alerte créée." } : { type: "error", message: r.error });
          }}
          onRemove={async (z) => {
            const r = await removeArrivalAlert(z.id);
            if (!r.ok) setFeedback({ type: "error", message: r.error });
          }}
        />
      )}
    </div>
  );
}

// ─── Fenêtre : ajouter / modifier un lieu ───────────────────────────────

function PlaceEditorModal({
  place,
  places,
  vehicles,
  onClose,
  onSave,
}: {
  place: UserPlace | null;
  places: UserPlace[];
  vehicles: VehicleWithPosition[];
  onClose: () => void;
  onSave: (input: {
    id?: string;
    name: string;
    lat: number;
    lng: number;
    address: string | null;
    radiusM?: number;
    via?: "manual" | "map_pick";
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [name, setName] = useState(place ? placeLabel(place.name) : "");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    place ? { lat: place.lat, lng: place.lng } : null,
  );
  const [address, setAddress] = useState<string | null>(place?.address ?? null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reverseAbort = useRef<AbortController | null>(null);

  const type = typeOfName(name);
  const near = vehicles[0] ? { lat: vehicles[0].lat, lng: vehicles[0].lng } : null;
  const taken = name.trim() ? findSameName(places, name, place?.id) : null;

  // Recherche d'adresse (pendant la frappe, avec un court délai)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchAddress(q, near, ctrl.signal).catch(() => []);
      if (!ctrl.signal.aborted) {
        setResults(r);
        setSearching(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // near : position de départ, inutile de relancer la recherche s'il bouge
  }, [query]);

  /** Point choisi sur la carte ou position d'un véhicule : on cherche l'adresse. */
  const placeAt = async (p: { lat: number; lng: number }) => {
    setPoint(p);
    setErr(null);
    reverseAbort.current?.abort();
    const ctrl = new AbortController();
    reverseAbort.current = ctrl;
    setAddressLoading(true);
    const a = await addressAt(p.lat, p.lng, ctrl.signal);
    if (!ctrl.signal.aborted) {
      setAddress(a);
      setAddressLoading(false);
    }
  };

  const pickResult = (r: GeocodeResult) => {
    reverseAbort.current?.abort();
    setPoint({ lat: r.lat, lng: r.lng });
    setAddress(r.label);
    setAddressLoading(false);
    setQuery("");
    setResults([]);
    setErr(null);
  };

  const submit = async () => {
    if (!point) {
      setErr("Choisis l'emplacement : cherche une adresse, choisis un véhicule ou touche la carte.");
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await onSave({
      id: place?.id,
      name,
      lat: point.lat,
      lng: point.lng,
      address,
      radiusM: place?.radiusM,
      via: "map_pick",
    });
    setSaving(false);
    if (!r.ok) setErr(r.error);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-yazz-xl bg-yazz-surface yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-yazz-border-light px-5 py-4">
          <h2 className="font-outfit text-[16px] font-bold text-yazz-text-dark">
            {place ? `Modifier « ${placeLabel(place.name)} »` : "Ajouter un lieu"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* Nom */}
          <div>
            <label htmlFor="place-name" className="font-inter mb-1.5 block text-[11px] font-medium text-yazz-text-body">
              Nom du lieu
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px]">{PLACE_TYPE_EMOJI[type]}</span>
              <input
                id="place-name"
                type="text"
                value={name}
                maxLength={50}
                onChange={(e) => {
                  setName(e.target.value);
                  setErr(null);
                }}
                placeholder="ex. Maison, École des enfants, Chez maman"
                className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background pl-10 pr-3 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
              />
            </div>
            {!place && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACE_SUGGESTIONS.filter((s) => !findSameName(places, s.name)).map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setName(s.name)}
                    className={cn(
                      "font-inter rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      name === s.name
                        ? "border-yazz-primary bg-yazz-primary/10 text-yazz-primary"
                        : "border-yazz-border-light text-yazz-text-body hover:border-yazz-primary/40",
                    )}
                  >
                    {PLACE_TYPE_EMOJI[s.type]} {s.name}
                  </button>
                ))}
              </div>
            )}
            {taken && (
              <p className="font-inter mt-1.5 text-[11px] text-yazz-error">
                « {placeLabel(taken.name)} » existe déjà. Choisis un autre nom.
              </p>
            )}
          </div>

          {/* Emplacement */}
          <div>
            <p className="font-inter mb-1.5 text-[11px] font-medium text-yazz-text-body">Où est ce lieu ?</p>

            {/* Recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yazz-text-caption" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  if (v.trim().length < 3) {
                    setResults([]);
                    setSearching(false);
                  }
                }}
                placeholder="Chercher une adresse, un quartier…"
                aria-label="Chercher une adresse"
                className="font-inter h-11 w-full rounded-yazz-sm border border-yazz-border-light bg-yazz-background pl-9 pr-9 text-[13px] text-yazz-text-dark focus:border-yazz-primary focus:outline-none focus:ring-2 focus:ring-yazz-primary/20"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-yazz-primary" />
              )}
            </div>
            {query.trim().length >= 3 && !searching && results.length === 0 && (
              <p className="font-inter mt-1.5 text-[11px] text-yazz-text-caption">
                Aucun résultat. Précise le quartier ou la commune, ou touche la carte.
              </p>
            )}
            {results.length > 0 && (
              <ul className="mt-1.5 overflow-hidden rounded-yazz-sm border border-yazz-border-light">
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      onClick={() => pickResult(r)}
                      className="font-inter flex w-full items-start gap-2 px-3 py-2 text-left text-[12px] text-yazz-text-dark hover:bg-yazz-accent"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yazz-primary" />
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Véhicules */}
            {vehicles.length > 0 && (
              <div className="mt-2.5">
                <p className="font-inter mb-1.5 text-[11px] text-yazz-text-caption">Ou là où est garé un véhicule :</p>
                <div className="flex flex-wrap gap-1.5">
                  {vehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => placeAt({ lat: v.lat, lng: v.lng })}
                      className="font-inter flex items-center gap-1.5 rounded-full border border-yazz-border-light px-2.5 py-1 text-[11px] font-semibold text-yazz-text-body transition-colors hover:border-yazz-primary/40 hover:text-yazz-primary"
                    >
                      <Car className="h-3.5 w-3.5" />
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Carte */}
            <div className="mt-3 h-[220px] overflow-hidden rounded-yazz-md border border-yazz-border-light bg-yazz-accent">
              <PlacePickerMap value={point} center={near} emoji={PLACE_TYPE_EMOJI[type]} onChange={placeAt} />
            </div>
            <p className="font-inter mt-1.5 text-[11px] text-yazz-text-caption">
              Touche la carte pour placer l&apos;épingle, ou fais-la glisser.
            </p>

            {point && (
              <div className="mt-2 flex items-start gap-2 rounded-yazz-sm bg-yazz-primary/5 p-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-yazz-primary" />
                <p className="font-inter text-[12px] text-yazz-text-dark">
                  {addressLoading ? "Recherche de l'adresse…" : address || "Emplacement choisi sur la carte"}
                </p>
              </div>
            )}
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-yazz-sm bg-yazz-error/5 p-2.5">
              <p className="font-inter text-[12px] text-yazz-error">{err}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-yazz-border-light px-5 py-4">
          <button
            onClick={onClose}
            className="font-inter h-11 flex-1 rounded-yazz-sm border border-yazz-border-light text-[13px] font-semibold text-yazz-text-body hover:bg-yazz-accent"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !point || !!taken}
            className="font-inter flex h-11 flex-1 items-center justify-center gap-2 rounded-yazz-sm yazz-gradient-primary text-[13px] font-semibold text-white shadow-yazz-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fenêtre : supprimer un lieu ────────────────────────────────────────

function DeletePlaceModal({
  place,
  alerts,
  onClose,
  onConfirm,
}: {
  place: UserPlace;
  alerts: PlaceZone[];
  onClose: () => void;
  onConfirm: (alsoAlerts: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [alsoAlerts, setAlsoAlerts] = useState(false);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-yazz-error/10">
          <Trash2 className="h-5 w-5 text-yazz-error" />
        </div>
        <h2 className="font-outfit text-[16px] font-bold text-yazz-text-dark">Supprimer « {placeLabel(place.name)} » ?</h2>
        <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
          L&apos;assistant ne connaîtra plus ce lieu. Tu pourras le rajouter quand tu veux.
        </p>
        {alerts.length > 0 && (
          <label className="font-inter mt-3 flex cursor-pointer items-start gap-2 rounded-yazz-sm bg-yazz-accent p-2.5 text-[12px] text-yazz-text-dark">
            <input
              type="checkbox"
              checked={alsoAlerts}
              onChange={(e) => setAlsoAlerts(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-yazz-primary"
            />
            Arrêter aussi {alerts.length > 1 ? `les ${alerts.length} alertes` : "l'alerte"} d&apos;arrivée à ce lieu
          </label>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="font-inter h-10 flex-1 rounded-yazz-sm border border-yazz-border-light text-[13px] font-semibold text-yazz-text-body hover:bg-yazz-accent"
          >
            Annuler
          </button>
          <button
            onClick={async () => {
              setBusy(true);
              await onConfirm(alsoAlerts);
            }}
            disabled={busy}
            className="font-inter flex h-10 flex-1 items-center justify-center gap-2 rounded-yazz-sm bg-yazz-error text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fenêtre : être prévenu à l'arrivée ─────────────────────────────────

function ArrivalAlertModal({
  place,
  vehicles,
  alerts,
  onClose,
  onAdd,
  onRemove,
}: {
  place: UserPlace;
  vehicles: VehicleWithPosition[];
  alerts: PlaceZone[];
  onClose: () => void;
  onAdd: (v: VehicleWithPosition) => Promise<void>;
  onRemove: (z: PlaceZone) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-yazz-text-dark/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-yazz-xl bg-yazz-surface p-5 yazz-shadow-high yazz-animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-yazz-sm text-yazz-text-muted hover:bg-yazz-accent"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-yazz-primary/10 text-[20px]">
          {PLACE_TYPE_EMOJI[place.type]}
        </div>
        <h2 className="font-outfit pr-8 text-[16px] font-bold text-yazz-text-dark">
          Me prévenir à l&apos;arrivée à « {placeLabel(place.name)} »
        </h2>
        <p className="font-inter mt-1 text-[12px] text-yazz-text-muted">
          Tu reçois une notification quand le véhicule arrive à moins de 200 m de ce lieu.
        </p>

        {vehicles.length === 0 ? (
          <p className="font-inter mt-4 text-[12px] text-yazz-text-caption">Aucun véhicule dans ton compte.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {vehicles.map((v) => {
              const zone = alerts.find((z) => z.deviceId === v.deviceId);
              const working = busy === v.deviceId;
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-yazz-md border border-yazz-border-light p-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-yazz-lg bg-yazz-accent">
                      <Car className="h-4 w-4 text-yazz-text-muted" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-outfit truncate text-[13px] font-semibold text-yazz-text-dark">{v.name}</p>
                      <p className={cn("font-inter text-[11px]", zone ? "text-yazz-success" : "text-yazz-text-caption")}>
                        {zone ? "Tu es prévenu à son arrivée" : "Pas d'alerte"}
                      </p>
                    </div>
                  </div>
                  {zone ? (
                    <button
                      onClick={async () => {
                        setBusy(v.deviceId);
                        await onRemove(zone);
                        setBusy(null);
                      }}
                      disabled={working}
                      className="font-inter flex h-8 shrink-0 items-center gap-1.5 rounded-yazz-sm border border-yazz-border-light px-2.5 text-[12px] font-semibold text-yazz-text-body hover:bg-yazz-accent disabled:opacity-50"
                    >
                      {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
                      Arrêter
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        setBusy(v.deviceId);
                        await onAdd(v);
                        setBusy(null);
                      }}
                      disabled={working}
                      className="font-inter flex h-8 shrink-0 items-center gap-1.5 rounded-yazz-sm yazz-gradient-primary px-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                      Me prévenir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
