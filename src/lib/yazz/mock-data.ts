// ============================================================
// YAZZ — Données mockées pour la démo
// À remplacer par les vrais appels Supabase en production.
// ============================================================

export type VehicleStatus = "moving" | "idle" | "offline" | "alert";

export type Vehicle = {
  id: string;
  imei: string;
  name: string;
  plate: string;
  driver?: string;
  status: VehicleStatus;
  speed: number; // km/h
  battery: number; // %
  lastUpdate: string; // ISO
  position: { x: number; y: number }; // % position on map
  heading: number; // deg
  address: string;
  todayDistanceKm: number;
  alerts?: { type: "geofence" | "speed" | "battery" | "parking" | "sos"; label: string; ts: string }[];
};

export const vehicles: Vehicle[] = [
  {
    id: "v1",
    imei: "861234501820394",
    name: "Toyota Hilux — Service",
    plate: "CG-8821-AB",
    driver: "Henock T.",
    status: "moving",
    speed: 42,
    battery: 88,
    lastUpdate: "2026-09-29T07:21:00Z",
    position: { x: 38, y: 42 },
    heading: 65,
    address: "Boulevard du 30 Juin, Kinshasa",
    todayDistanceKm: 18.4,
  },
  {
    id: "v2",
    imei: "861234501820395",
    name: "Ford Ranger — Livraison",
    plate: "CG-7742-CD",
    driver: "Patrick M.",
    status: "moving",
    speed: 28,
    battery: 64,
    lastUpdate: "2026-09-29T07:20:00Z",
    position: { x: 56, y: 36 },
    heading: 120,
    address: "Av. Kasa-Vubu, Gombe",
    todayDistanceKm: 32.1,
    alerts: [{ type: "speed", label: "Excès de vitesse 65 km/h", ts: "2026-09-29T07:18:00Z" }],
  },
  {
    id: "v3",
    imei: "861234501820396",
    name: "Toyota Corolla — Personnel",
    plate: "CG-1247-EF",
    driver: "Sarah K.",
    status: "idle",
    speed: 0,
    battery: 42,
    lastUpdate: "2026-09-29T07:15:00Z",
    position: { x: 48, y: 58 },
    heading: 0,
    address: "Av. de la Libération, Lemba",
    todayDistanceKm: 12.8,
  },
  {
    id: "v4",
    imei: "861234501820397",
    name: "Suzuki Vitara — Commercial",
    plate: "CG-9983-GH",
    driver: "Joseph L.",
    status: "alert",
    speed: 0,
    battery: 18,
    lastUpdate: "2026-09-29T07:19:00Z",
    position: { x: 68, y: 48 },
    heading: 0,
    address: "Route Matadi, Mont-Ngafula",
    todayDistanceKm: 5.6,
    alerts: [
      { type: "parking", label: "Mode parking activé — bip sonore", ts: "2026-09-29T07:10:00Z" },
      { type: "battery", label: "Batterie faible (18%)", ts: "2026-09-29T07:19:00Z" },
    ],
  },
  {
    id: "v5",
    imei: "861234501820398",
    name: "Moto Yamaha — Livraison",
    plate: "CG-4451-IJ",
    driver: "Eric N.",
    status: "moving",
    speed: 35,
    battery: 76,
    lastUpdate: "2026-09-29T07:21:00Z",
    position: { x: 30, y: 62 },
    heading: 200,
    address: "Av. Kasa-Vubu, Kalamu",
    todayDistanceKm: 24.9,
  },
  {
    id: "v6",
    imei: "861234501820399",
    name: "Hino Truck — Citerne",
    plate: "CG-2233-KL",
    driver: "Marc D.",
    status: "offline",
    speed: 0,
    battery: 0,
    lastUpdate: "2026-09-29T06:42:00Z",
    position: { x: 72, y: 68 },
    heading: 0,
    address: "Route de Matadi, Kintambo",
    todayDistanceKm: 0,
  },
  {
    id: "v7",
    imei: "861234501820400",
    name: "Honda Civic — Domicile",
    plate: "CG-3344-MN",
    driver: "Alice B.",
    status: "idle",
    speed: 0,
    battery: 91,
    lastUpdate: "2026-09-29T07:18:00Z",
    position: { x: 22, y: 48 },
    heading: 0,
    address: "Av. Tombalbaye, Gombe",
    todayDistanceKm: 9.2,
  },
  {
    id: "v8",
    imei: "861234501820401",
    name: "Toyota RAV4 — Personnel",
    plate: "CG-5566-OP",
    driver: "Daniel K.",
    status: "moving",
    speed: 52,
    battery: 80,
    lastUpdate: "2026-09-29T07:21:00Z",
    position: { x: 60, y: 22 },
    heading: 90,
    address: "Boulevard Sendwe, Limete",
    todayDistanceKm: 41.7,
    alerts: [{ type: "geofence", label: "Sortie de zone Kinshasa", ts: "2026-09-29T07:05:00Z" }],
  },
];

export type AlertItem = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  plate: string;
  type: "geofence" | "speed" | "battery" | "parking" | "sos";
  label: string;
  ts: string;
  severity: "info" | "warning" | "critical";
};

export const alerts: AlertItem[] = [
  {
    id: "a1",
    vehicleId: "v4",
    vehicleName: "Suzuki Vitara — Commercial",
    plate: "CG-9983-GH",
    type: "parking",
    label: "Mode parking activé — intrusion détectée",
    ts: "2026-09-29T07:10:00Z",
    severity: "critical",
  },
  {
    id: "a2",
    vehicleId: "v2",
    vehicleName: "Ford Ranger — Livraison",
    plate: "CG-7742-CD",
    type: "speed",
    label: "Excès de vitesse — 65 km/h dans une zone 50",
    ts: "2026-09-29T07:18:00Z",
    severity: "warning",
  },
  {
    id: "a3",
    vehicleId: "v4",
    vehicleName: "Suzuki Vitara — Commercial",
    plate: "CG-9983-GH",
    type: "battery",
    label: "Batterie faible (18%)",
    ts: "2026-09-29T07:19:00Z",
    severity: "warning",
  },
  {
    id: "a4",
    vehicleId: "v8",
    vehicleName: "Toyota RAV4 — Personnel",
    plate: "CG-5566-OP",
    type: "geofence",
    label: "Sortie de géofence « Kinshasa »",
    ts: "2026-09-29T07:05:00Z",
    severity: "info",
  },
];

export type TripItem = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  plate: string;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  durationMin: number;
  maxSpeed: number;
  avgSpeed: number;
};

export const recentTrips: TripItem[] = [
  {
    id: "t1",
    vehicleId: "v1",
    vehicleName: "Toyota Hilux",
    plate: "CG-8821-AB",
    startedAt: "2026-09-29T06:42:00Z",
    endedAt: "2026-09-29T07:21:00Z",
    distanceKm: 18.4,
    durationMin: 39,
    maxSpeed: 64,
    avgSpeed: 28,
  },
  {
    id: "t2",
    vehicleId: "v2",
    vehicleName: "Ford Ranger",
    plate: "CG-7742-CD",
    startedAt: "2026-09-29T05:30:00Z",
    endedAt: "2026-09-29T06:55:00Z",
    distanceKm: 24.2,
    durationMin: 85,
    maxSpeed: 71,
    avgSpeed: 17,
  },
  {
    id: "t3",
    vehicleId: "v8",
    vehicleName: "Toyota RAV4",
    plate: "CG-5566-OP",
    startedAt: "2026-09-29T06:10:00Z",
    endedAt: "2026-09-29T07:05:00Z",
    distanceKm: 41.7,
    durationMin: 55,
    maxSpeed: 82,
    avgSpeed: 45,
  },
];

export type StatCard = {
  id: string;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon: "car" | "moving" | "alert" | "credit";
  accent: "primary" | "success" | "warning" | "info";
};

export const stats: StatCard[] = [
  {
    id: "s1",
    label: "Total véhicules",
    value: "8",
    delta: "+2 ce mois",
    trend: "up",
    icon: "car",
    accent: "primary",
  },
  {
    id: "s2",
    label: "En mouvement",
    value: "4",
    delta: "+1 vs hier",
    trend: "up",
    icon: "moving",
    accent: "success",
  },
  {
    id: "s3",
    label: "Alertes actives",
    value: "3",
    delta: "+1 critique",
    trend: "up",
    icon: "alert",
    accent: "warning",
  },
  {
    id: "s4",
    label: "Crédit solde",
    value: "12 480 CDF",
    delta: "5 jours restants",
    trend: "down",
    icon: "credit",
    accent: "info",
  },
];

export const navItems = [
  { id: "dashboard", label: "Tableau de bord", icon: "layout-dashboard" },
  { id: "vehicles", label: "Mes véhicules", icon: "car", badge: "8" },
  { id: "history", label: "Historique trajets", icon: "route" },
  { id: "geofences", label: "Géofences", icon: "map-pin" },
  { id: "alerts", label: "Alertes", icon: "bell", badge: "3" },
  { id: "payments", label: "Paiements", icon: "wallet" },
  { id: "sharing", label: "Partages", icon: "share-2" },
  { id: "settings", label: "Paramètres", icon: "settings" },
] as const;
