# YAZZ Web

Version web de **yazz user** — l'application mobile Flutter de suivi GPS YAZZ.
Construite avec Next.js 16 + TypeScript + Tailwind 4 + Mapbox GL JS + Supabase.

## 🚀 Stack technique

- **Framework** : Next.js 16 (App Router) + TypeScript 5
- **Styling** : Tailwind CSS 4 + shadcn/ui (New York)
- **Polices** : Outfit (titres) + Inter (corps) — polices officielles YAZZ
- **Backend** : Supabase (auth, DB PostgreSQL, Realtime, Storage, Edge Functions)
- **Carte** : Mapbox GL JS v3
- **Déploiement** : Vercel

## 📦 Prérequis

- Node.js 20+ (ou Bun)
- Un projet Supabase (le projet YAZZ officiel)
- Un token Mapbox public
- Variables d'environnement (voir `.env.example`)

## 🔧 Configuration locale

### 1. Cloner et installer

```bash
git clone https://github.com/titeb/yazz-web.git
cd yazz-web
bun install  # ou npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env.local
```

Édite `.env.local` avec tes credentials :

| Variable | Description | Où la trouver |
|----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique (safe côté client) | Supabase Dashboard → Project Settings → API → Project API keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secrète (server-side uniquement) | Supabase Dashboard → Project Settings → API → service_role |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Token public Mapbox | https://account.mapbox.com/access-tokens |
| `NEXT_PUBLIC_MAPBOX_STYLE_URL` | Style Mapbox YAZZ | Config Flutter yazz → `mapbox_config.dart` |
| `NEXT_PUBLIC_YAZZ_BACKEND_URL` | URL du backend Node.js | `https://api.zipbox.online` |

### 3. Lancer en local

```bash
bun run dev  # ou npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## 🔐 Authentification

L'app utilise Supabase Auth avec 2 méthodes :

1. **SMS OTP** (par défaut) — l'utilisateur entre son numéro, reçoit un code OTP par SMS, et se connecte.
2. **Email + password** — option alternative.

Le middleware (`src/middleware.ts`) protège toutes les routes sauf `/login` et `/api/auth/*`.

## 🗺️ Carte Mapbox

Le composant `YazzMapbox` utilise Mapbox GL JS v3 avec :
- Le style officiel YAZZ (`mapbox://styles/devzak/cmkwzy0w5001b01qx7653fjne`)
- Marqueurs animés (pulse rings, bounce, blink pour alertes)
- Popups au survol avec détails véhicule
- Filtres par statut (Tous / Mouvement / Arrêt / Alerte / Hors-ligne)
- Navigation controls (zoom, pitch, bearing)
- Centrage automatique sur le véhicule sélectionné

## 📊 Données temps réel

- **Hook** `useUserVehicles()` : récupère les devices de l'utilisateur + leurs dernières positions
- **Realtime** : subscription aux changements sur `last_known_positions` et `user_devices`
- **Calcul du statut** :
  - `moving` : speed > 0
  - `idle` : speed = 0 et dernière maj < 10 min
  - `offline` : dernière maj > 10 min
  - `alert` : engine_cut actif OU batterie < 20%

## 🎨 Design system

Le design system officiel YAZZ est intégré (cf. Flutter `lib/ui/utils/constants/colors.dart`) :

- **Primary** : `#2B44EE` (Bleu Électrique)
- **Secondary** : `#333984` (Bleu Nuit)
- **Background** : `#FAFAFA` (Blanc Cassé)
- **Surface** : `#FFFFFF` (Blanc Pur)
- **Success** : `#38A169` (Vert)
- **Error** : `#E53E3E` (Rouge)
- **Warning** : `#D69E2E` (Jaune)
- **Crawling** : `#ED8936` (Orange ralentissement)

Radius YAZZ : 9 / 14 / 18 / 22 px.

## 📁 Structure du projet

```
src/
├── app/
│   ├── layout.tsx           # Root layout (Outfit + Inter fonts)
│   ├── page.tsx             # Dashboard principal
│   ├── login/page.tsx       # Page de connexion (phone OTP / email)
│   └── globals.css          # Design system YAZZ (couleurs, animations)
├── components/
│   ├── ui/                  # shadcn/ui (New York)
│   └── yazz/
│       ├── yazz-logo.tsx          # Logo YAZZ officiel
│       ├── yazz-sidebar.tsx       # Navigation latérale
│       ├── yazz-topbar.tsx        # Barre du haut
│       ├── yazz-stat-card.tsx     # Cartes statistiques
│       ├── yazz-vehicle-list.tsx  # Liste des véhicules
│       ├── yazz-alerts-feed.tsx   # Feed d'alertes
│       ├── yazz-vehicle-detail.tsx # Panneau détail véhicule
│       └── mapbox/
│           └── yazz-mapbox.tsx    # Carte Mapbox GL JS
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Client browser
│   │   ├── server.ts        # Client serveur + admin
│   │   └── middleware.ts    # Refresh session + protection routes
│   └── yazz/
│       ├── types/database.ts # Types Supabase (calqués migrations)
│       └── mock-data.ts      # Données mockées pour démo
├── hooks/
│   └── use-user-vehicles.ts # Hook Realtime véhicules
└── middleware.ts             # Middleware Next.js (auth gate)
```

## 🚢 Déploiement Vercel

1. Push le repo sur GitHub (`titeb/yazz-web`)
2. Connecter le repo à Vercel : https://vercel.com/new
3. Configurer les variables d'environnement (mêmes que `.env.local`)
4. Déployer

Vercel détectera automatiquement Next.js et appliquera la configuration optimale.

## 🔒 Sécurité

- ✅ Middleware protège toutes les routes (sauf /login)
- ✅ Anon key Supabase uniquement côté client (RLS appliquée côté DB)
- ✅ Service role key réservée au server-side (`src/lib/supabase/server.ts`)
- ✅ Aucun secret en dur dans le code
- ✅ `.env.local` exclu du git

## 📝 État du projet

- ✅ Authentification (phone OTP + email/password)
- ✅ Dashboard temps réel avec Mapbox
- ✅ Liste véhicules + filtres
- ✅ Panneau détail véhicule
- ✅ Feed d'alertes
- ✅ Design system YAZZ complet
- ✅ Responsive (mobile drawer + grid adaptatif)

### TODO prochaines itérations

- [ ] Page Historique trajets (polyline sur carte + stats)
- [ ] Page Géofences (création interactive sur carte)
- [ ] Page Paiements (recharge Mobile Money via Shwary/PawaPay)
- [ ] Page Partages (invitations)
- [ ] Web Push notifications (Service Worker + VAPID)
- [ ] PWA installable
- [ ] Mode offline (Service Worker cache)
- [ ] Dark mode toggle fonctionnel

## 📄 License

Propriétaire — YAZZ GPS Tracking © 2026
