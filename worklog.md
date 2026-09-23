---

# Task ID: AUDIT-YAZZ-BACKEND
**Agent:** Explore
**Task:** Audit Node.js backend yazz_backend
**Date:** 2026-09-22
**Repo:** `/home/z/my-project/audit/yazz_backend` (git: `github.com/titeb/yazz_backend.git`)
**Commit audité:** `259162d` (HEAD, branche `main`)

---

## 0. SYNTHÈSE EXÉCUTIVE

Backend Node.js (Express 5) monolithique combinant :
- **Serveur TCP** (port 5001) recevant les frames de 3 protocoles GPS trackers : ST-901 (texte), Concox/GT06N (binaire), iStartek (texte `$$`/`&&`).
- **API REST** (port 3000) pour management, payments, navigation, parking, commandes tracker.
- Intégration Supabase (Postgres + Realtime + Auth + Edge Functions) via **service_role key**.
- Intégrations tiers : Firebase FCM, Infobip (WhatsApp/SMS), Twilio (fallback), HTTPSMS, Shwary + PawaPay (Mobile Money DRC), Mapbox Directions, Sentry.

**Maturité globale** : moyenne-haute pour la fonctionnalité (38 migrations SQL, 30+ alert types, RLS présente partout, RPCs atomiques `SECURITY DEFINER` avec check `service_role`), **mais défauts de sécurité critiques** (secret DB hardcodé, secrets OTP, CORS `*`, surface d'attaque API large).

**Score sécurité** : 🔴 5/10 (à corriger urgemment).
**Score architecture** : 🟡 7/10 (modulaire mais JS pur, pas de TS, pas de tests).
**Score ops** : 🟢 8/10 (Docker multi-stage non-root, healthcheck, graceful shutdown, watchdog TCP).

### Vulnérabilités critiques (P0) — à traiter immédiatement

| # | Issue | Fichier | Ligne |
|---|-------|---------|-------|
| P0-1 | **Mot de passe DB Supabase hardcodé** dans la CI GitHub Actions : `process.env.SUPABASE_DB_PASSWORD \|\| 'titebe1234DEV@'` | `.github/workflows/deploy.yml` | 45 |
| P0-2 | **Code OTP test stocké en mémoire + endpoint non protégé** : 13 numéros test (`243810000001`…`243986842924`) bypassent l'envoi SMS. Le endpoint `GET /api/auth/test-code?phone=...&key=yazz-test-2026` retourne le code OTP. Clé `TEST_CODE_SECRET='yazz-test-2026'` hardcodée. | `src/api/authRoutes.js` | 44-56, 414-452 |
| P0-3 | **CORS `*` par défaut** en production si `CORS_ORIGINS` non setté. Le warning existe mais aucune sécurisation forcée. | `src/utils/config.js` | 89, 167-169 |
| P0-4 | **`API_KEY` non requis en dev** → si quelqu'un lance en prod avec `NODE_ENV!=production` (typo, oubli), l'API REST est totalement ouverte. Fail-open design. | `src/middleware/auth.js` | 23-33 |
| P0-5 | **Service role key utilisée pour TOUS les appels Supabase** (incluant le `supabaseAuth.getUser(token)` de validation JWT). Le client unique bypass RLS sur toutes les tables. | `src/services/supabaseService.js` | 12 |
| P0-6 | **`exec_sql` RPC** appelée pour auto-migration (`ALTER TABLE … ADD COLUMN`) — fonction non définie dans les migrations du repo, accepte un paramètre `query` → potentielle SQL injection si la RPC est exposée par défaut. | `src/services/supabaseService.js` | 525-549 |

---

## 1. ARCHITECTURE & STRUCTURE

### 1.1 Arborescence principale

```
yazz_backend/
├── index.js                 (41 lignes) — entrypoint, init Sentry + start YazzServer
├── package.json             — Express 5, supabase-js 2.105, firebase-admin 13.9, twilio 6, winston 3
├── Dockerfile               — multi-stage node:20-alpine, USER non-root 1001, dumb-init, healthcheck
├── docker-compose.yml        — yazz-backend + redis:7-alpine (1 CPU / 512 Mo limit), env_file=.env
├── .env.example             — 30 vars (mais MAPBOX_ACCESS_TOKEN et PAWAPAY_* MANQUANTS)
├── update-https.sh          — git pull + rebuild + restart, .github-token dans /opt
├── .github/workflows/deploy.yml — CI SSH VPS + apply migrations via node+pg
├── src/
│   ├── server.js            (673 lignes) — classe YazzServer : setup Express + TCP + cleanup + shutdown
│   ├── utils/{config.js, logger.js}
│   ├── middleware/{auth.js, supabaseAuth.js}
│   ├── api/
│   │   ├── routes.js        (740 lignes) — health/stats/devices/positions/history/geofences/credits/pricing/trackers/commands
│   │   ├── authRoutes.js    (454 lignes) — OTP webhook (Svix signature + Bearer)
│   │   ├── paymentRoutes.js (305 lignes) — Shwary initiate/status/history
│   │   ├── webhookRoutes.js (459 lignes) — Shwary + PawaPay callbacks (idempotent + round-trip verify)
│   │   ├── engineCutRoutes.js (233 lignes) — coupure moteur iStartek (cmd 900)
│   │   ├── navigationRoutes.js (205 lignes) — proxy Mapbox + compteur quota
│   │   └── parkingRoutes.js (232 lignes) — activate/deactivate parking
│   ├── services/
│   │   ├── supabaseService.js (570) — singleton client + helpers DB + protection GPS coords (LBS vs GPS)
│   │   ├── positionHandler.js (739) — orchestrateur GPS + caches + Realtime listeners
│   │   ├── alertEngine.js (1873) — moteur alertes v1 "patched v2" avec cooldown + multi-protocol
│   │   ├── notificationService.js (773) — FCM + multi-provider SMS/WA + anti-spam cooldown
│   │   ├── creditService.js (601) — balance/deduction/pricing (RPC atomique `adjust_user_credits_atomic`)
│   │   ├── parkingAlertLoop.js (271) — boucle 30s alerte parking critique
│   │   ├── shwaryService.js (188) — Shwary Mobile Money
│   │   ├── pawaPayProvider.js (340) — PawaPay depositId + Content-Digest webhook
│   │   └── providers/{notificationProvider.js, infobipProvider.js, twilioProvider.js, httpsmsProvider.js}
│   └── tcp/
│       ├── tcpServer.js     (958) — multi-protocol + watchdog TCP freeze auto-restart
│       ├── st901Parser.js   (291)
│       ├── concroxParser.js (859)
│       └── istartekParser.js (786)
├── migrations/              — 37 fichiers SQL (3062 lignes) — voir §7
├── deploy/                  — hetzner-setup.sh + 3 scripts SQL Realtime
├── scripts/                 — deploy_lbs_fix.sh, run-migration-006.js, test-simulator.js
└── supabase/.temp/          — ⚠️ fichiers Supabase CLI TRACKED DANS GIT (project-ref + linked-project.json)
```

### 1.2 Framework & paradigme

- **HTTP framework** : **Express 5.2.1** (dernière majeure). `app.set('trust proxy', 1)` correct.
- **Architecture** : **modulaire / layered-ish** (routes → services → supabaseService). Pas MVC strict, pas d'hexagonal. Classes singleton (`getXxxService()`).
- **CommonJS** (`"type": "commonjs"`), JS pur **sans TypeScript**.
- Couplage important : `positionHandler` importe `alertEngine` + `notificationService` + `supabaseService` ; `alertEngine` importe `parkingAlertLoop` ; `creditService` lazy-importe `notificationService` et `positionHandler` (évit circulaire).

---

## 2. STACK & DÉPENDANCES

### 2.1 Versions (`package.json`)

| Catégorie | Dépendance | Version déclarée | Version installée |
|-----------|-----------|------------------|-------------------|
| Runtime | node | `>=18` (engines) | image `node:20-alpine` |
| HTTP | `express` | `^5.2.1` | 5.2.1 |
| Supabase | `@supabase/supabase-js` | `^2.105.4` | 2.75.5 |
| Notifications | `firebase-admin` | `^13.9.0` | 13.9.0 |
|  | `twilio` | `^6.0.2` | 6.9.0 |
|  | `ws` | `^8.18.0` | **8.20.0** ⚠️ |
| Sécurité | `helmet` | `^8.1.0` | 8.1.0 |
|  | `cors` | `^2.8.6` | 2.8.5 |
|  | `express-rate-limit` | `^8.5.1` | 8.5.1 |
| Logs | `winston` | `^3.19.0` | 3.17.0 |
|  | `morgan` | `^1.10.1` | 1.10.1 |
| Perf | `compression` | `^1.8.1` | 1.8.0 |
| Erreurs | `@sentry/node` | `^9.0.0` | 9.40.0 |
| Cache | `redis` | `^4.7.0` | 4.7.0 |
| Env | `dotenv` | `^17.4.2` | 17.4.2 |
| Dev | `jest` | `^30.4.2` | — |
|  | `nodemon` | `^3.1.14` | — |

⚠️ **Pas de `zod` / `joi` / `express-validator`** : validation ad-hoc par regex/slice manuelle dans chaque route (parfois insuffisante — voir §4).

⚠️ **Pas d'ESLint/Prettier** dans `devDependencies` → aucun standard de code enforced.

### 2.2 `npm audit` (production, installé)

```
35 vulnerabilities (1 low, 26 moderate, 7 high, 1 critical)
```

**Critique (1)** :
- `websocket-driver <=0.7.4` (transitive via `firebase-admin` → `@firebase/database-compat` → `faye-websocket@0.11.4`) — **GHSA-xv26-6w52-cph6** (CWE-130, message corruption via protocol length headers) + GHSA-mp7j-qc5w-4988 (resource limit bypass via compression). Fix available → MAJ `firebase-admin@14.4.0` (semver-major).

**High (7)** :
- `ws 8.0.0 - 8.20.1` (dépendance directe) — 2 advisories : uninitialized memory disclosure (modéré) + memory exhaustion DoS (high, CVSS 7.5). Fix: bump `ws` à `>=8.21.0` (mettre `^8.21.0` dans `package.json`).
- `@grpc/grpc-js 1.14.0 - 1.14.3` — 2 crash serveur/client via message compressé malformé.
- `axios 1.0.0 - 1.17.0` (transitive) — 6 advisories (prototype pollution, SSRF, DoS, bypass `maxBodyLength`).

**Modéré (26)** : `@babel/core` (arbitrary file read via sourceMappingURL), `@opentelemetry/*` (unbounded memory allocation baggage, transitif via `@sentry/node`), `cookie`/`tough-cookie`/`request`/`uuid@<=10`/etc.

Recommandation : `npm audit fix` pour les non-breaking, puis MAJ manuelle `ws` (direct) et `firebase-admin` (semver-major).

---

## 3. INTÉGRATION SUPABASE

### 3.1 Initialisation (`src/services/supabaseService.js` lignes 6-31)

```js
this.client = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
  realtime: { transport: ws },
  global: { headers: { 'x-application': 'yazz-backend' } },
});
```

**Client unique singleton** utilisé pour :
- Toutes les lectures/écritures DB (bypass total de RLS via service_role)
- Validation des JWT utilisateurs via `client.auth.getUser(token)` dans `supabaseAuth` middleware (ligne 26)
- Subscription Realtime (notifications, alert_configs, users, geofences, user_credits, user_devices.is_active)

### 3.2 Variables d'environnement attendues

- `SUPABASE_URL` (required, throw au démarrage si manquant)
- `SUPABASE_SERVICE_KEY` (required — **service_role key**, bypass RLS)

`.env.example` lignes 9-10 documentent ces vars. ❌ Pas de `SUPABASE_ANON_KEY` (jamais utilisée).

### 3.3 Usage de la service_role key — ⚠️ Risque P0-5

La `service_role` key donne accès à **toutes les tables en bypass RLS**. Le client singleton fait tous les appels avec cette clé, ce qui signifie :
- N'importe quelle route backend qui fait `supabase.client.from('users').select('*')` accède à tous les users (et c'est ce que fait `getAllDevices`, `getAllLastPositions`, etc.).
- Si une route est mal protégée (par ex. `apiKeyAuth` désactivé en dev et oublié), fuite massive de données.
- Le `validateConfig()` ne vérifie que la présence de `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`, pas que ces valeurs sont cohérentes avec le projet attendu.

**Bonne pratique non suivie** : utiliser un client `anon` pour les requêtes user-scoped (avec RLS activée) et un client `service_role` seulement pour les opérations serveur-à-serveur (cron, webhooks).

### 3.4 Appels directs vs RPC SQL

Mélange :
- **Appels directs Supabase** (`from().select().eq()`) partout dans routes/services — pas de RPC dédiées pour les opérations métier courantes.
- **RPC atomiques** pour les opérations sensibles : `adjust_user_credits_atomic`, `delete_user_cascade`, `delete_device_cascade`, `ensure_notification_fee_log` (toutes `SECURITY DEFINER` + check `service_role`, voir `migrations/014_secure_rpcs.sql`).
- **RPC `exec_sql`** (lignes 525-549) pour auto-migration : appelle `this.client.rpc('exec_sql', { query: 'ALTER TABLE ...' })`. Cette RPC n'est **pas définie dans les migrations du repo** → non versionnée, potentiellement créée à la main dans le dashboard Supabase. Risque P0-6 si elle est exposée par défaut à un rôle autre que `service_role`.

### 3.5 Stratégie d'auth — JWT

- **API REST générique** (`/api/devices`, `/api/positions`, `/api/geofences`, `/api/credits`, etc.) : auth par `X-API-Key` header (timing-safe compare), optionnel en dev. ❌ Pas de JWT Supabase → un user avec l'API key peut lire/modifier les devices de n'importe quel user (pas de scoping par user_id). Exception : `?userId=xxx` en query param déclenche un `userOwnsDevice` check, mais ce n'est pas systématique.
- **Routes user-scoped** (`/api/payments`, `/api/devices/:id/engine-cut`, `/api/navigation`, `/api/parking`, `/api/auth`) : auth par `supabaseAuth` middleware qui valide le JWT Supabase via `supabase.client.auth.getUser(token)`. ✅ Bon design (pas de vérification locale du JWT, délègue à Supabase).
- **Admin endpoints** (`/api/stats`, `/api/devices` (list all), `/api/positions` (list all), `/api/credits/recharge`, `/api/pricing` (PUT), `/api/commands/:imei`, `/api/alerts/test`, `/api/notification-provider/status`) : `adminAuth` middleware qui vérifie `X-Admin-Key` header séparé.

---

## 4. SÉCURITÉ (CRITIQUE)

### 4.1 Secrets hardcoded

| Fichier | Ligne | Secret | Niveau |
|---------|-------|--------|--------|
| `.github/workflows/deploy.yml` | 45 | `password: process.env.SUPABASE_DB_PASSWORD \|\| 'titebe1234DEV@'` — **fallback mot de passe DB hardcodé**. CI sur repo public `github.com/titeb/yazz_backend.git`. Permet à quiconque de se connecter en `postgres` à `db.twkdvsuefjewykxsnrwu.supabase.co` si la var n'est pas settée (et même si elle l'est, le mdp `titebe1234DEV@` est peut-être encore valide en prod). | 🔴 **P0-1** |
| `src/api/authRoutes.js` | 56 | `const TEST_CODE_SECRET = 'yazz-test-2026';` — clé statique pour endpoint `/api/auth/test-code`. | 🔴 **P0-2** |
| `src/api/authRoutes.js` | 44-49 | `TEST_PHONES = Set{243810000001…243810000012, 243986842924}` — 13 numéros bypassent SMS OTP. Le code est stocké en mémoire et récupérable via `GET /api/auth/test-code?phone=...&key=yazz-test-2026`. Si déployé en prod, n'importe qui peut se logger comme `243986842924` (numéro owner Henock Titebe). | 🔴 **P0-2** |
| `docker-compose.yml` | 49 | `redis-server --requirepass ${REDIS_PASSWORD:-yazz_redis_2026}` — mot de passe Redis fallback hardcodé. | 🟠 P1 |
| `scripts/deploy_lbs_fix.sh` | 7 | `ssh root@178.105.130.178` — IP VPS hardcodée + connexion root directe. | 🟡 P2 |
| `scripts/deploy_lbs_fix.sh` | 52-53 | `git remote set-url origin https://x-access-token:[REDACTED:github_token]@github.com/...` — placeholder `[REDACTED:github_token]` (probablement un vrai token GitHub a existé ici, puis scrubbed). Le script est cassé en l'état. | 🟠 P1 |
| `supabase/.temp/linked-project.json` (TRACKED GIT) | — | `{"ref":"twkdvsuefjewykxsnrwu","name":"yazz","organization_id":"ofrlqbttwznmjqzwhlaj",...}` — metadata projet Supabase exposée (org ID + project ref). Pas critique mais fuite d'info. | 🟡 P2 |
| `migrations/016_multi_provider_abstraction.sql` | 103-124 | JSON de config Shwary (noms d'env vars uniquement, pas de valeurs) — OK. | ✅ |
| `.env.example` | 23-26 | `INFOBIP_API_KEY=` (vide), `INFOBIP_BASE_URL=https://yxwgxp.api.infobip.com` — URL Infobip réelle exposée (subdomain unique `yxwgxp`). | 🟡 P2 |

**Aucune** clé `eyJ...` (JWT Supabase), `ghp_`, `sb_`, `pk_live`, `sk_live` trouvée dans le code source ou le git history.

### 4.2 CORS

`src/utils/config.js` ligne 89 : `corsOrigins: process.env.CORS_ORIGINS || '*'`
`src/server.js` lignes 158-160 :
```js
this.app.use(cors({
  origin: config.corsOrigins === '*' ? true : config.corsOrigins.split(','),
}));
```
`.env.example` ligne 50 : `CORS_ORIGINS=*`

**Problème** : défaut `*` accepte toutes les origines. `validateConfig()` ligne 167-169 émet un warning en prod mais ne bloque pas. → **P0-3**. Devrait forcer `CORS_ORIGINS` explicite en prod (throw au démarrage si `*`).

### 4.3 Helmet — ✅ Présent

`src/server.js` ligne 157 : `this.app.use(helmet())` avec config par défaut (HSTS, CSP, no-sniff, frameguard, etc.). ✅ Bon.

### 4.4 Rate limiting — ✅ Présent mais incomplet

`src/server.js` lignes 173-191 :
- `/api/*` : 30 req/min/IP (sauf `/api/health` skip)
- `/webhooks/*` : 10 req/min/IP
- `/api/auth/*` : 10 req/min/IP (OTP webhook)

⚠️ **Manque** :
- Rate limit per-user (sur JWT) pour les routes auth — un attaquant avec un JWT valide peut spammer.
- Rate limit différencié pour `/api/payments/initiate` (sensible financier).
- Rate limit sur `/api/commands/:imei` (admin-only mais pas de rate limit dédié).
- Headers `X-RateLimit-*` activés (`standardHeaders: true`), `legacyHeaders: false` ✅.
- `trust proxy: 1` ✅ — nécessaire derrière Nginx.

### 4.5 JWT validation middleware

`src/middleware/supabaseAuth.js` : appelle `supabase.client.auth.getUser(token)` qui valide le JWT via la clé publique JWKS Supabase. ✅ Bonne approche (pas de validation locale → pas de bug d'algo).

⚠️ Une seule authentification JWT → `req.user = data.user`. Pas de check de rôle (`is_admin`, `is_active` côté `public.users`). Le check `is_active` se fait plus loin dans certaines routes mais pas systématiquement.

### 4.6 Validation des inputs

❌ **Aucune lib de validation** (pas de zod/joi/express-validator). Chaque route fait sa validation manuelle :
- `routes.js` ligne 146 : `if (!id || !/^\d{5,20}$/.test(id))` — ✅ regex IMEI.
- `routes.js` ligne 151-153 : `name.trim().slice(0, 100)` — ✅ sanitize length.
- `paymentRoutes.js` ligne 39 : `if (!phone || !/^\+243\d{9}$/.test(phone))` — ✅ regex.
- `parkingRoutes.js` ligne 42-43 : `validSensitivities.includes(sensitivity)` — ✅ whitelist.
- `engineCutRoutes.js` ligne 39 : `!['cut', 'restore'].includes(action)` — ✅ whitelist.
- `routes.js` ligne 621-631 : `ALLOWED_COMMANDS = ['RESET#', 'RESTART#', ...]` whitelist pour commandes TCP tracker. ✅ Très bien.
- `routes.js` ligne 368-378 : PUT `/geofences/:id` whitelist `allowedFields`. ✅ Anti-mass-assignment.
- `routes.js` ligne 515-525 : PUT `/pricing` whitelist. ✅.

⚠️ **Manque** : validation des coordonnées GPS (lat ∈ [-90, 90], lng ∈ [-180, 180]) dans `parkingRoutes` et `geofences` POST. Les `center_lat` / `center_lng` ne sont pas range-checked. Risque faible (la DB les stocke en DOUBLE PRECISION).

### 4.7 SQL injection via `$queryRaw` ou concaténation

❌ Pas de `$queryRaw` (pas de Prisma / Knex). Le client Supabase-js utilise PostgREST (parameters bindés automatiquement). ✅ Pas de surface d'injection SQL côté Node.

⚠️ **Côté SQL migrations** : les RPC `SECURITY DEFINER` (`adjust_user_credits_atomic`, `delete_user_cascade`, `delete_device_cascade`) utilisent toutes des `RAISE EXCEPTION 'Access denied: service_role required'` si `current_setting('request.jwt.claims')::json->>'role' != 'service_role'`. ✅ Bonne pratique (voir `migrations/014_secure_rpcs.sql`).

⚠️ La RPC `exec_sql` (non versionnée dans le repo) — si elle existe côté Supabase et accepte un paramètre `query: text`, c'est une porte d'entrée SQL injection massive (n'importe qui avec la service_role key peut exécuter du SQL arbitraire). À vérifier côté dashboard.

### 4.8 Body parser limits

`src/server.js` lignes 163-167 :
```js
this.app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));
this.app.use(express.urlencoded({ extended: true }));
```
- ✅ Limite JSON à 1 Mo (suffisant pour les payloads de l'app).
- ✅ `verify` callback capture `req.rawBody` pour vérification signatures webhooks (Shwary HMAC-SHA256, PawaPay Content-Digest, Svix Standard Webhooks).
- ❌ `express.urlencoded` sans limite explicite → défaut Express 100kb (OK mais incohérent).
- ❌ Pas de protection spécifique pour `text/plain` ou `multipart/form-data` — pas nécessaire ici car pas d'upload.

### 4.9 File upload handling

❌ Pas d'upload dans le backend Node. Les photos véhicules (`vehicle_photo`) sont vraisemblablement uploadées directement via Supabase Storage depuis Flutter. ✅.

### 4.10 Logging des secrets

Recherche `console.log(req.body)`, `console.log(token)`, `logger.info(token)`, etc. :
- ✅ **Aucun** logging direct de `req.body`, `password`, `secret`, `token` (sauf FCM tokens en mode debug pour dédoublonnage — `notificationService.js` ligne 281, 357, 561 — acceptable car token FCM n'est pas un secret user).
- ⚠️ `authRoutes.js` ligne 324 : `logger.info('  Retrieve via: GET /api/auth/test-code?phone=' + normalizedPhone + '&key=' + TEST_CODE_SECRET)` — **la clé `yazz-test-2026` est loggée à chaque appel OTP test**. En prod si un test phone est utilisé, la clé est dans les logs. → P0-2 (confirmé).
- ⚠️ `authRoutes.js` lignes 320-325, 345-351 : le code OTP à 6 chiffres est loggé en clair en mode `DRY_RUN=true` (par design, mais risqué en prod si quelqu'un oublie de passer à `false`).

### 4.11 Endpoints debug exposés

| Endpoint | Auth | Expose |
|----------|------|--------|
| `GET /api/health` | ❌ aucune | status DB + TCP + memory + uptime + positionHandler metrics |
| `GET /api/stats` | `adminAuth` | positionHandler metrics + TCP stats + memory |
| `GET /api/notification-provider/status` | `adminAuth` | provider configs (sans clés) |
| `GET /api/auth/health` | ❌ aucune | dryRun + rateLimitPerHour + senderName + svixEnabled + bearerEnabled |
| `GET /api/auth/svix-test?body=...` | ❌ aucune | préfixe du secret Svix (15 chars) + note de debug |
| `GET /webhooks/shwary/health` | ❌ aucune | callback_url + configured |
| `GET /webhooks/pawa-pay/health` | ❌ aucune | mode + base_url + default_provider |
| `GET /api/auth/test-code?phone=...&key=...` | `TEST_CODE_SECRET` (hardcodé) | **code OTP test** — P0-2 |
| `GET /` (root) | ❌ aucune | name + version + endpoints list |

`/api/health` est intentionallement non auth (Docker healthcheck + uptime monitoring), mais expose le status DB + TCP + memory. À restreindre si possible (IP allowlist).

`/api/auth/svix-test` expose le préfixe du secret Svix (15 chars). Risque faible mais fuite d'info.

---

## 5. API ENDPOINTS

### 5.1 Liste exhaustive des routes HTTP

| Méthode | Path | Auth | Notes |
|---------|------|------|-------|
| GET | `/` | — | Banner + endpoints list |
| GET | `/api/health` | — | DB+TCP+memory+metrics |
| GET | `/api/stats` | admin | TCP stats + positionHandler metrics + memory |
| GET | `/api/devices` | admin | Liste tous devices |
| GET | `/api/devices/:imei` | apiKey (+optional userId check) | Détail device |
| POST | `/api/devices` | apiKey | Register device (regex IMEI) |
| GET | `/api/users/:userId/devices` | apiKey | Devices d'un user |
| GET | `/api/positions/:imei` | apiKey (+optional userId) | Last position |
| GET | `/api/positions` | admin | Toutes positions |
| GET | `/api/users/:userId/positions` | apiKey | Positions d'un user |
| GET | `/api/history/:imei` | apiKey (+optional userId) | Historique paginé |
| GET | `/api/geofences/:imei` | apiKey (+optional userId) | Géofences device |
| POST | `/api/geofences` | apiKey | Crée géofence (mass-assignment pas protégé sur user_id) |
| PUT | `/api/geofences/:id` | apiKey | Update (whitelist) |
| DELETE | `/api/geofences/:id` | apiKey | Delete |
| GET | `/api/credits/:userId` | apiKey | Credit summary |
| POST | `/api/credits/recharge` | admin | Recharge credits |
| GET | `/api/credits/:userId/transactions` | apiKey | Transactions |
| GET | `/api/pricing` | apiKey | Pricing config |
| PUT | `/api/pricing` | admin | Update pricing |
| POST | `/api/trackers/:deviceId/activate` | apiKey | Activate tracker |
| POST | `/api/trackers/:deviceId/deactivate` | apiKey | Deactivate tracker |
| POST | `/api/commands/:imei` | admin | Envoi commande TCP tracker (whitelist) |
| POST | `/api/commands/:imei/reconnect` | admin | Force reconnect TCP |
| POST | `/api/alerts/test` | admin | Test notif à un user |
| GET | `/api/notification-provider/status` | admin | Provider status |
| POST | `/api/payments/initiate` | **JWT** | Shwary initiate (min 3000 CDF) |
| GET | `/api/payments/:paymentId/status` | **JWT** | Statut + round-trip verify Shwary |
| GET | `/api/payments/history` | **JWT** | Historique payments |
| POST | `/api/devices/:deviceId/engine-cut` | **JWT** | Coupe/restore moteur (iStartek cmd 900, < 20 km/h) |
| POST | `/api/navigation/route` | **JWT** | Proxy Mapbox (quota 200/jour) |
| GET | `/api/navigation/quota` | **JWT** | Conso Mapbox mensuelle |
| POST | `/api/parking/activate` | **JWT** | Active mode parking |
| POST | `/api/parking/deactivate` | **JWT** | Désactive mode parking |
| POST | `/api/auth/sms-webhook` | Svix **ou** Bearer | Webhook OTP Supabase Auth |
| GET | `/api/auth/health` | — | Status OTP |
| GET | `/api/auth/svix-test` | — | Debug Svix |
| GET | `/api/auth/test-code` | `TEST_CODE_SECRET` | **Récupère code OTP test** |
| POST | `/webhooks/shwary` | HMAC-SHA256 signature + round-trip API | Callback paiement |
| POST | `/webhooks/pawa-pay` | Content-Digest SHA-256 + round-trip API | Callback paiement |
| GET | `/webhooks/shwary/health` | — | Status Shwary |
| GET | `/webhooks/pawa-pay/health` | — | Status PawaPay |

**Total** : ~42 routes HTTP.

### 5.2 Analyse de 5 endpoints clés

#### A. `POST /api/payments/initiate` (`paymentRoutes.js:14`)

- ✅ Auth JWT Supabase (`supabaseAuth` middleware appliqué au mount dans `server.js:203`)
- ✅ Validation `phone` regex `^\+243\d{9}$`
- ✅ Min amount lu depuis `app_settings.minimum_recharge_amount` (3000 CDF défaut)
- ✅ Crée record `payments` (status PENDING) avant appel Shwary
- ✅ Round-trip verification si `shwaryData.status === 'completed'`
- ⚠️ Si `verifyErr` (API Shwary down), **trust le sync response** (`isVerified = true`) — commentaire "HMAC protects webhooks" mais c'est la sync response, pas le webhook → risque de fausse validation.
- ⚠️ Pas de validation `amount` max (DDoS financier possible en demandant 1Md CDF).

#### B. `POST /api/devices/:deviceId/engine-cut` (`engineCutRoutes.js:33`)

- ✅ Auth JWT
- ✅ Vérifie `device.user_id === userId` (owner uniquement)
- ✅ Vérifie `!device.is_shared` (pas de cut sur partagé)
- ✅ Vérifie `device.is_active`
- ✅ Vérifie `protocol_type === 'istartek'` (commande 900 spécifique)
- ✅ Vérifie connexion TCP + vitesse < 20 km/h pour `cut`
- ✅ Vérifie état `engine_cut_state` (pas de double cut)
- ✅ ACK timeout 10s via `sendCommandWithAck`
- ⚠️ Pas de rate limit par user — un user peut spammer cut/restore → usure relais véhicule.
- ⚠️ Si `updateError` sur `engine_cut_state`, retourne `success: true` avec warning → état DB incohérent avec état réel du capteur.

#### C. `POST /api/auth/sms-webhook` (`authRoutes.js:282`)

- ✅ Double auth : Svix signature (HMAC-SHA256, timestamp ±5min anti-replay) **ou** Bearer secret (timing-safe compare)
- ✅ Capture raw body pour vérif Svix
- ✅ Rate limit 10 req/min/IP au mount + rate limit per-phone (3 req/h)
- ✅ Bypass test accounts (13 numéros) — mais P0-2 car récupérables via endpoint non protégé
- ⚠️ Si `OTP_DRY_RUN=true` en prod (oubli), tous les codes OTP sont loggés en clair → fuite massive.

#### D. `POST /webhooks/shwary` (`webhookRoutes.js:139`)

- ✅ Vérification HMAC-SHA256 via `verifyShwarySignature` (timing-safe compare après padding — ⚠️ le padding à `maxLen` avec `Buffer.alloc` + `timingSafeEqual` est inhabituel, il vaut mieux normaliser les longueurs avant. Mais fonctionne.)
- ✅ Round-trip API verification (`verifyWithShwaryApi`) — requête `GET /merchants/transactions/{txId}` pour confirmer status ET amount (tolérance 1 CDF)
- ✅ Idempotence : update avec `.in('status', ['PENDING', 'SUBMITTED'])` + check `already_processed`
- ✅ Fallback matching par phone + amount + recent PENDING (10 min)
- ⚠️ En dev sans `SHWARY_WEBHOOK_SECRET`, signature SKIPPÉE (ligne 26 : `return true` en dev). Risqué si quelqu'un lance en dev sur un host public.
- ⚠️ Si `verifyWithShwaryApi` échoue (network), le payment est marqué `FAILED` (safe-by-default ✅).

#### E. `POST /api/commands/:imei` (`routes.js:612`)

- ✅ Auth admin (`adminAuth`)
- ✅ Whitelist stricte `ALLOWED_COMMANDS = ['RESET#', 'RESTART#', 'WHERE#', 'GPS#', 'STATUS#', 'URL#', 'APN#', '888888#', 'CHECK#']`
- ✅ Normalize `command.toUpperCase()` + ensure `#` terminator
- ⚠️ Le check `ALLOWED_COMMANDS.includes(normalizedCmd)` ne valide pas les **paramètres** de la commande (ex: `APN#internet` ne match pas `APN#`). Du coup seules les commandes sans paramètre passent. C'est sécurisé par accident mais limitant.

---

## 6. DOCKER & DÉPLOIEMENT

### 6.1 Dockerfile (lignes 1-53)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine
LABEL maintainer="YAZZ GPS Tracking"
WORKDIR /app
RUN apk update && apk upgrade && apk add --no-cache dumb-init && rm -rf /var/cache/apk/*
RUN addgroup -g 1001 -S yazz && adduser -S yazz -u 1001 -G yazz
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p logs && chown -R yazz:yazz logs
ENV NODE_ENV=production
USER yazz                                    # ✅ non-root
EXPOSE 5001 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
```

✅ **Multi-stage build** (builder = install deps, prod = copie node_modules).
✅ **USER non-root** (uid 1001, groupe yazz).
✅ **dumb-init** pour propagation signaux → graceful shutdown correct.
✅ **`apk update && upgrade`** au build → patches OS à jour.
✅ **Healthcheck** via wget sur `/api/health`.
✅ **NODE_ENV=production** forcé.
⚠️ `COPY . .` copie tout (y compris `.env` si présent dans le contexte) — `.dockerignore` exclut `node_modules/`, `.env`, `*.log`, `logs/`, `firebase-service-account.json`, `.github-token`, `scripts/`, `deploy/`, `Dockerfile`, `docker-compose*.yml`. ✅ `.dockerignore` bien configuré.
⚠️ `EXPOSE 5001 3000` déclare les 2 ports (TCP + HTTP).
⚠️ Image de base `node:20-alpine` non pinée par digest → rebuild peut donner des versions différentes. À pinner en prod (e.g. `node:20.18.0-alpine3.20@sha256:...`).

### 6.2 docker-compose.yml

```yaml
services:
  yazz-backend:
    build: { context: ., dockerfile: Dockerfile }
    restart: unless-stopped
    ports:
      - "5001:5001"          # TCP trackers — exposé à 0.0.0.0 (Internet)
      - "127.0.0.1:3000:3000" # HTTP — limité à localhost (reverse proxy Nginx)
    environment:
      - NODE_ENV=production
      - TCP_PORT=5001
      - HTTP_PORT=3000
      - REDIS_URL=redis://redis:6379
    env_file: [.env]
    volumes: ["./logs:/app/logs"]
    deploy:
      resources:
        limits: { cpus: '1.0', memory: 512M }
        reservations: { cpus: '0.25', memory: 128M }
    healthcheck: { ... wget /api/health ... }
    logging: { driver: json-file, options: { max-size: "50m", max-file: "5" } }
    depends_on: { redis: { condition: service_healthy } }
    networks: [yazz-network]
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD:-yazz_redis_2026} ...
    volumes: [redis-data:/data]
    healthcheck: ...
    networks: [yazz-network]
volumes: { redis-data: { driver: local } }
networks: { yazz-network: { driver: bridge } }
```

✅ **Resource limits** (1 CPU / 512 Mo backend, 0.5 CPU / 192 Mo redis).
✅ **HTTP port bound à 127.0.0.1** (derrière Nginx). TCP port 5001 bind à 0.0.0.0 (nécessaire pour les trackers).
✅ **Redis password** + `maxmemory 128mb allkeys-lru` + `appendonly yes` (persistance).
✅ **Healthcheck** backend + redis.
✅ **Log rotation** 50 Mo × 5 fichiers.
✅ **depends_on redis avec condition service_healthy**.
⚠️ `REDIS_PASSWORD` fallback hardcodé `yazz_redis_2026` (P1).
⚠️ Pas de `read_only: true` sur le conteneur backend (pourrait être ajouté avec `tmpfs` pour `/tmp` et `logs/` en writable).
⚠️ Pas de `security_opt: [no-new-privileges:true]`.

### 6.3 deploy/hetzner-setup.sh

- ✅ Installe Docker + compose plugin via script officiel.
- ✅ Crée user `yazz` non-root avec accès docker.
- ✅ Clone repo, check migrations conflicts (duplicates `001_`, `002_`...).
- ✅ Valide vars requises `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `API_KEY`, `NODE_ENV`.
- ✅ Installe Nginx + config reverse proxy + security headers + rate limit zone `30r/m`.
- ✅ Firewall UFW (22, 80, 443, 5001).
- ✅ Certbot SSL optionnel.
- ⚠️ L.88 `git pull origin main || true` — ignore les erreurs (silencieux).
- ⚠️ L.120 `set -a; source .env; set +a` — source le `.env` dans le shell (risque d'injection si `.env` contient des caractères spéciaux).
- ⚠️ L.169 `docker compose build --no-cache` à chaque déploiement — lent, gaspille cache.

### 6.4 update-https.sh

- Lit token GitHub depuis `/opt/yazz-backend/.github-token` (fichier local, chmod 600 suggéré).
- `git remote set-url origin https://${GITHUB_TOKEN}@github.com/...` temporairement, puis reset après.
- Sauvegarde `.env` et `firebase-service-account.json` dans `/tmp` pendant le pull.
- Hard reset `origin/main` (destructif — perd les commits locaux).
- ⚠️ Le token est stocké en clair dans `/opt/yazz-backend/.github-token` (pas dans le conteneur, sur le VPS host). Acceptable mais sensible.
- ⚠️ `git diff HEAD@{1} HEAD` syntaxe old → sur certains git récents, `HEAD@{1}` est ambigu.

### 6.5 .github/workflows/deploy.yml — ⚠️ P0-1

CI GitHub Actions : SSH au VPS via secret + exécute un script qui :
1. `git pull origin main`
2. `source .env` (récupère `SUPABASE_URL`)
3. Si `SUPABASE_URL` set, installe `pg` npm et exécute un script Node qui :
   - Lit `migrations/*.sql` triés.
   - Se connecte à `db.{projectRef}.supabase.co:5432` en user `postgres`, **password fallback `'titebe1234DEV@'`** (P0-1).
   - Crée table `_applied_migrations` (tracking).
   - Apply chaque migration non-appliquée + insert dans `_applied_migrations`.
4. `docker compose build --no-cache && docker compose up -d`.
5. `sleep 15` + `curl /api/health`.

⚠️ **L.85 `process.exit(0)`** sur erreur de migration : la CI ne fail pas même si une migration plante. Danger (migrations silencieusement échouées).

### 6.6 Exposition de ports

- `5001/tcp` (TCP trackers GPS) → 0.0.0.0 (Internet, nécessaire).
- `3000/tcp` (HTTP API) → 127.0.0.1 uniquement (derrière Nginx).
- `6379/tcp` (Redis) → pas exposé sur host (seulement réseau `yazz-network`).
- `80/tcp`, `443/tcp`, `22/tcp` (Nginx + SSH).

---

## 7. MIGRATIONS SQL

### 7.1 Liste (37 fichiers, 3062 lignes)

```
001_users.sql                         — Table users + RLS + trigger update_updated_at
002_devices.sql                       — devices + user_devices + RLS
003_gps_positions.sql                 — gps_points + last_known_positions + pg_cron purge 30j + process_gps_trips
004_trips.sql                         — trips + process_gps_trips() (Haversine + idempotent ON CONFLICT)
005_geofences_notifications.sql       — geofences + notifications + shared_devices + RLS
006_credit_system.sql                 — pricing_config + user_credits + credit_transactions + pg_cron (daily fee + reminders)
007_admin_system.sql                  — yazz_admins + app_settings + audit_logs + admin policies
008_battery_voltage.sql               — colonnes battery_voltage
009_payments.sql                      — payments (Shwary)
010_share_invitations.sql             — share_invitations
011_device_alert_configs.sql          — device_alert_configs (per-device alert tuning)
012_parking_sessions.sql              — parking_sessions
013_daily_deduction_log.sql           — daily_deduction_log (audit trail)
014_secure_rpcs.sql                   — adjust_user_credits_atomic + delete_user_cascade + delete_device_cascade (SECURITY DEFINER + check service_role)
015_istartek_support.sql              — colonnes étendues GPS (sat_count, gsm_signal, hdop, odometer, altitude, alarm_code, alarm_type, protocol_type) + extension alert_type CHECK
016_multi_provider_abstraction.sql   — payment_providers + provider/provider_transaction_id sur payments
017_pawapay_provider.sql              — seed PawaPay provider
018_public_app_settings_rls.sql       — policy authenticated users sur app_settings (whitelist 3 clés publiques)
019_sos_alerts.sql                    — user_preferences (sos_vigil) + sos_alerts + sos_spottings + find_nearby_vigiles() + trigger increment spotted_count + expire_old_sos_alerts()
020_sos_vehicle_columns_and_vigile_rls.sql
021_notification_fee_log.sql          — notification_fee_log + RPC ensure_notification_fee_log (SECURITY DEFINER)
022_skip_deduction_no_position.sql    — fix deduct_daily_tracking_fees (skip si pas de position 24h)
023_fix_realtime_replica_identity.sql — ALTER TABLE ... REPLICA IDENTITY FULL (geofences, sos_alerts)
024_fix_alert_config_sharing_rls.sql
025_fix_alert_config_unique_index.sql
026_fix_shared_devices_rls.sql
027_fix_user_devices_shared_rls.sql
028_engine_cut_state.sql              — engine_cut_state sur user_devices
029_extend_alert_type_check.sql
030_backfill_jamming_alerts.sql
031_document_paid_columns.sql
032_add_gps_frozen_type.sql
033_add_jamming_to_users.sql
034_add_gps_frozen_alert_column.sql
035_default_vigile_true.sql           — handle_new_user() + backfill user_preferences (sos_vigil=true)
036_api_usage_counters.sql             — api_usage_counters (Mapbox quota)
2026_06_20_allow_phone_only_signup.sql — drop NOT NULL email + handle_new_user() phone-only
```

**Politique de nommage** : `NNN_description.sql` (3 digits) jusqu'à 036, puis `2026_06_20_*` pour la dernière (cassure de convention).

### 7.2 Schéma de données déduit

**Tables principales (25)** :

| Table | PK | Relations | RLS | Notes |
|-------|----|-----------|-----|-------|
| `users` | UUID (→ auth.users) | 1:N user_devices, payments, geofences, notifications, user_credits, user_preferences, sos_alerts, share_invitations | ✅ | Étend Supabase auth.users |
| `devices` | VARCHAR(20) IMEI | 1:1 user_devices, 1:N gps_points, last_known_positions, geofences | ✅ | Inventory trackers |
| `user_devices` | VARCHAR(20) IMEI | N:1 users (owner), 1:N geofences, parking_sessions | ✅ | Pairing user↔device (1:1 par (user_id, id)) |
| `gps_points` | BIGINT identity | N:1 devices | ✅ | Historique brut, expire_at 30 jours |
| `last_known_positions` | VARCHAR(20) device_id | 1:1 devices | ✅ | Upsert par device |
| `trips` | BIGINT identity | N:1 devices | ✅ | Consolidé par pg_cron |
| `geofences` | UUID | N:1 users, N:1 user_devices | ✅ | circle / polygon |
| `notifications` | UUID | N:1 users, N:1 devices | ✅ | type, channel, is_read |
| `shared_devices` | UUID | N:1 devices, N:1 users (owner), N:1 users (shared_with) | ✅ | view_only / view_and_alerts |
| `share_invitations` | UUID | N:1 shared_devices, N:1 users (inviter), N:1 users (invitee) | ✅ | pending/accepted/declined/expired |
| `pricing_config` | INT singleton (id=1) | — | ✅ | tracking_per_day, sms_fee, whatsapp_fee |
| `user_credits` | UUID user_id | 1:1 users | ✅ | balance, is_active, estimated_expiry |
| `credit_transactions` | UUID | N:1 users | ✅ | recharge/tracking_fee/sms_fee/whatsapp_fee/bonus/refund/adjustment |
| `daily_deduction_log` | — | N:1 users, N:1 user_devices | ✅ | Idempotence (user, device, date) UNIQUE |
| `notification_fee_log` | UUID | N:1 users, N:1 notifications | ✅ | Audit frais SMS/WA |
| `payments` | UUID | N:1 users | ✅ | PENDING/SUBMITTED/SUCCESS/FAILED/CANCELLED |
| `payment_providers` | UUID | — | ✅ | Config multi-provider |
| `yazz_admins` | UUID user_id | 1:1 users | ✅ | Liste admins |
| `app_settings` | TEXT key | — | ✅ | KV store config globale |
| `audit_logs` | UUID | N:1 users | ✅ | Action admin |
| `user_preferences` | UUID user_id | 1:1 users | ✅ | sos_vigil_enabled |
| `sos_alerts` | UUID | N:1 user_devices, N:1 users (declared_by) | ✅ | active/resolved/expired/false_alarm |
| `sos_spottings` | UUID | N:1 sos_alerts, N:1 users (spotter) | ✅ | UNIQUE(alert_id, spotter) |
| `device_alert_configs` | UUID | N:1 users, N:1 devices | ✅ | Per-device alert tuning + cooldown_seconds |
| `parking_sessions` | UUID | N:1 users, N:1 devices | ✅ | sensitivity low/medium/high |
| `api_usage_counters` | UUID | N:1 users | ✅ | Mapbox quota, UNIQUE(user_id, counter_date) |

### 7.3 RLS policies

✅ **Toutes les tables ont `ENABLE ROW LEVEL SECURITY`** (24 tables).
✅ Pattern systématique : policy "Users can read own X" `USING (user_id = auth.uid())` + policy "Service role full access" `USING (auth.role() = 'service_role')`.
✅ Policy admin via `EXISTS (SELECT 1 FROM public.yazz_admins ya WHERE ya.user_id = auth.uid())`.

⚠️ **Tables sans policy SELECT pour users authenticated** :
- `pricing_config` : policy "Anyone can read pricing_config" `USING (true)` — ouverte à tous (y compris anon). Acceptable (prix publics).
- `payment_providers` : policy "Anyone can read active providers" `USING (is_active = true)` — ouverte. Acceptable.
- `app_settings` : policy "Authenticated users can read public app_settings" whitelist 3 clés (`minimum_recharge_amount`, `whatsapp_support_number`, `whatsapp_order_number`). ✅ Bonne pratique.

### 7.4 Triggers / Functions SQL

**Triggers** (8) : `users_updated_at`, `user_devices_updated_at`, `user_credits_updated_at`, `trigger_auto_create_user_credits`, `geofences_updated_at`, `app_settings_updated_at`, `user_preferences_updated_at`, `trg_sos_spottings_increment`, `trg_api_usage_updated_at`.

⚠️ **`handle_new_user()` trigger sur `auth.users`** : la fonction est définie dans `migrations/2026_06_20_allow_phone_only_signup.sql` (l.25) puis `migrations/035_default_vigile_true.sql` (l.16), mais **le `CREATE TRIGGER ON auth.users` n'est nulle part dans les migrations** du repo. Il a probablement été créé à la main dans le dashboard Supabase. → **P1** : non reproductible, à ajouter dans une migration.

**Functions plpgsql** (12) :
- `update_updated_at()` — trigger générique timestamp
- `auto_create_user_credits()` — trigger after INSERT users
- `deduct_daily_tracking_fees()` — pg_cron 00:01 UTC, SECURITY DEFINER, check 24h activity
- `send_credit_reminders()` — pg_cron 08:00 UTC
- `process_gps_trips()` — pg_cron 30 min
- `expire_old_sos_alerts()` — 24h auto-expire
- `increment_sos_spotted_count()` — trigger
- `find_nearby_vigiles()` — Haversine SQL
- `handle_new_user()` — trigger auth.users (SECURITY DEFINER)
- `adjust_user_credits_atomic()` — RPC service_role only, atomic
- `delete_user_cascade()` — RPC service_role only
- `delete_device_cascade()` — RPC service_role only
- `ensure_notification_fee_log()` — self-healing table creation

**pg_cron jobs** (4) :
- `purge-expired-gps-points` — 03:00 UTC daily
- `process-gps-trips` — every 30 min
- `deduct-daily-tracking-fees` — 00:01 UTC daily
- `send-credit-reminders` — 08:00 UTC daily

### 7.5 `SECURITY DEFINER` functions — audit

8 fonctions `SECURITY DEFINER` :
- ✅ 6/8 ont un check `IF COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') != 'service_role' THEN RAISE EXCEPTION 'Access denied: service_role required'` (migrations/014, 021, 022, 035).
- ⚠️ `find_nearby_vigiles()` (019) : `LANGUAGE sql STABLE` sans `SECURITY DEFINER` (pas nécessaire, lit seulement). ✅.
- ⚠️ `handle_new_user()` (035) : `SECURITY DEFINER` mais **pas de check role** → exécutée par trigger sur `auth.users`, donc OK car trigger tourne avec les privilèges du user qui fire (insertion auth.users = Supabase Auth, role `authenticated`). Pas de bypass.

---

## 8. SCRIPTS & AUTOMATION

### 8.1 `scripts/`

- `deploy_lbs_fix.sh` — script one-shot pour déployer le fix LBS/GPS dégradé. SSH root direct à `178.105.130.178`, git pull, rebuild Docker, check fix. ⚠️ Placeholder `[REDACTED:github_token]` cassé.
- `run-migration-006.js` — affiche simplement le SQL de la migration 006 dans la console. Inutile en l'état (les migrations sont appliquées par CI).
- `test-simulator.js` — simulateur ST-901 qui envoie des frames TCP à `localhost:5001` avec route Kinshasa. ✅ Utile pour dev.

### 8.2 Cron jobs

- ✅ pg_cron côté Supabase (4 jobs, voir §7.4).
- ✅ Backend Node : `setInterval` 2 min pour cleanup alertEngine + stale connections (`server.js:494`).
- ✅ Backend Node : `setInterval` 60s pour refresh caches credit + device active (`positionHandler.js:45,63`).
- ✅ Backend Node : `setInterval` 30s pour parking alert loop (`parkingAlertLoop.js:84`).
- ✅ Backend Node : watchdog TCP 60s check (`tcpServer.js:117`).

### 8.3 Background workers

Pas de workers séparés — tout dans le process Express (TCP + HTTP + alertEngine + positionHandler + notificationService Realtime listener). ⚠️ Si le process crash, tout s'arrête (mitigation via `restart: unless-stopped` Docker).

---

## 9. QUALITÉ DU CODE

### 9.1 Tests

❌ **Aucun test**. Pas de dossier `__tests__/`, `tests/`, `spec/`. Aucun fichier `*.test.js` ou `*.spec.js`. `package.json` script `"test": "jest --coverage"` mais `jest` n'est pas installé en dev (`devDependencies` ne contient que `jest@^30.4.2` déclaré — mais en fait si, jest est dans devDeps).

Vérification : `devDependencies = { "jest": "^30.4.2", "nodemon": "^3.1.14" }`. Jest est installable mais aucun test n'existe. ❌ **0% coverage**.

### 9.2 TypeScript vs JavaScript pur

❌ **JavaScript pur** (CommonJS). Pas de `tsconfig.json`, pas de types. Commentaires JSDoc dans la plupart des services (✅ documentation) mais pas de type-check.

### 9.3 ESLint / Prettier

❌ **Aucun ESLint/Prettier configuré**. Pas de `.eslintrc`, pas de `.prettierrc`, pas de script `lint` dans `package.json`. Code quality enforced uniquement par review.

### 9.4 Logging

✅ **Winston** (`src/utils/logger.js`) avec :
- Console transport colorisée.
- File transport `logs/error.log` (5 Mo × 5 fichiers).
- File transport `logs/combined.log` (10 Mo × 10 fichiers).
- Format : `YYYY-MM-DD HH:mm:ss.SSS [LEVEL] message {meta}`.
- ✅ `format.errors({ stack: true })` capture stack traces.
- ✅ `defaultMeta: { service: 'yazz-backend' }`.
- ✅ Morgan HTTP logger (dev: `dev`, prod: `combined` → winston stream).
- ✅ 1 seul `console.log` dans `index.js` (Sentry init message) — tout le reste passe par winston.
- ⚠️ Pas de logging structuré JSON (juste string format). Pour ingestion Loki/ELK, ajouter `format.json()`.
- ⚠️ Pas de correlation IDs / request IDs.

### 9.5 Gestion des erreurs centralisée

✅ Error handler middleware global (`server.js:272-279`) :
```js
this.app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  if (config.sentry.dsn) Sentry.captureException(err);
  res.status(500).json({ error: 'Internal server error' });
});
```
✅ 404 handler explicite (ligne 267).
✅ Chaque route a son try/catch qui log + retourne 500 générique (pas de stack trace leak).
✅ `process.on('uncaughtException')` et `process.on('unhandledRejection')` → graceful shutdown (`server.js:661-669`).
⚠️ Les erreurs Supabase sont parfois loggées mais remontées en 500 générique sans code d'erreur métier (ex: PGRST116 = "row not found" devrait être 404).

### 9.6 Graceful shutdown

✅ `_setupShutdown()` (`server.js:608-670`) :
- Capture SIGTERM, SIGINT, SIGQUIT, uncaughtException, unhandledRejection.
- `_shuttingDown` flag anti-double.
- Clear cleanup interval + stop Realtime listener + stop ParkingAlertLoop.
- Stop TCP server (destroy all sockets).
- Close HTTP server (wait connexions en cours).
- Force exit after 10s timeout.
- ✅ Utilise `dumb-init` pour propagation signaux.

### 9.7 Process manager

- Docker `restart: unless-stopped` ✅.
- Pas de PM2, pas de nodemon en prod (`nodemon` est en devDependencies uniquement).
- ✅ `dumb-init` comme PID 1 (zombie reaping + signal forwarding).

---

## 10. OBSERVABILITÉ

### 10.1 Logs structurés

⚠️ **Semi-structurés** : format winston printf avec `JSON.stringify(meta)` pour les objets. Pas de logs JSON pur. Pour ingestion Datadog/Loki, ajouter `format.json()` ou `Logstash.format()`.

✅ Niveau configurable via `LOG_LEVEL` env var.
✅ Trois destinations : console, error.log, combined.log.

### 10.2 Monitoring

- ✅ **Sentry** (`@sentry/node@9`) initialisé dans `index.js` si `SENTRY_DSN` set. Captures `uncaughtException` + erreurs explicites via `Sentry.captureException(err)` dans l'error handler middleware.
- ✅ `tracesSampleRate` configurable (défaut 0.1 = 10% des transactions tracées).
- ❌ **Pas de Prometheus metrics endpoint**. Pas de `prom-client`. Le `/api/stats` expose des metrics custom mais pas au format Prometheus.
- ❌ Pas de Datadog / NewRelic / OpenTelemetry.
- ✅ Docker healthcheck + `restart: unless-stopped`.

### 10.3 Tracing distribué

❌ Pas de tracing distribué. Sentry a un support OpenTelemetry intégré (v9) mais `tracesSampleRate` est le seul réglage. Pas de headers W3C traceparent propagés vers Shwary/PawaPay/Mapbox.

### 10.4 Métriques business exposées

✅ `/api/health` expose :
- DB status + TCP status (activeConnections, connectedDevices, lastFrameAgeSec, watchdogRestarts, totalFrames, validFrames)
- PositionHandler metrics (processed, dbWrites, dbErrors, creditsSkipped, deviceInactiveSkipped, alertsTriggered, notificationsSent, edgeFunctionCalls, edgeFunctionErrors)
- Memory (rss, heapUsed, heapTotal)
- Uptime

✅ `/api/stats` (admin) expose plus de détails TCP + positionHandler.

❌ Pas de metrics business agrégées (nombre d'users actifs, MRR via credits, taux de churn, etc.). Pas de dashboard Grafana.

---

## 11. POINTS FORTS

✅ **Docker multi-stage + non-root + dumb-init + healthcheck** — qualité production.
✅ **Graceful shutdown** complet (SIGTERM/SIGINT/SIGQUIT/uncaughtException/unhandledRejection).
✅ **Watchdog TCP freeze** auto-restart après 10 min sans frame (`tcpServer.js:143`).
✅ **Protection GPS coords** contre écrasement LBS → GPS (`supabaseService.js:115-145`) — protection intelligente contre les positions dégradées.
✅ **Multi-protocol TCP parser** (ST-901 + Concox + iStartek) avec auto-detection + buffer overflow protection (4/8/16 KB limit).
✅ **Webhooks paiement multi-verif** : signature HMAC-SHA256 (Shwary) / Content-Digest SHA-256 (PawaPay) **+** round-trip API verification (status + amount) + idempotence via `.in('status', ['PENDING', 'SUBMITTED'])`.
✅ **Idempotence payments** : upsert `daily_deduction_log` avec UNIQUE(user_id, device_id, deduction_date), payments update avec `WHERE status IN ('PENDING', 'SUBMITTED')`.
✅ **RPC `SECURITY DEFINER` avec check `service_role`** pour opérations sensibles (`adjust_user_credits_atomic`, `delete_user_cascade`, `delete_device_cascade`).
✅ **RLS partout** (24/25 tables), avec policy "service_role full access" + policy "users read own" pattern systématique.
✅ **Whitelist `ALLOWED_COMMANDS`** pour commandes TCP tracker (anti-injection).
✅ **Anti-mass-assignment** sur PUT `/geofences/:id` et PUT `/pricing` (whitelist `allowedFields`).
✅ **Timing-safe comparison** pour API key + admin key + Bearer OTP secret + Svix signature.
✅ **Anti-spam notifications** : cooldown map par `userId:deviceId:alertType` (10 min à 24h selon type).
✅ **Anti-doublons FCM** : détection tokens FCM partagés entre users (`notificationService.js:255-285`).
✅ **Credit cache Realtime** : listener `user_credits.is_active` et `user_devices.is_active` pour invalidation instantanée (0 latence entre recharge et déblocage positions).
✅ **Quota Mapbox** par user (200 req/jour) avec upsert atomic.
✅ **Engine-cut safety** : vérifie `speed < 20 km/h`, owner-only, `!is_shared`, `is_active`, `protocol_type === 'istartek'`, `engine_cut_state` (anti-double-cut), ACK timeout 10s.
✅ **OTP webhook Svix Standard Webhooks** (HMAC-SHA256 + timestamp anti-replay ±5min) + fallback Bearer secret.
✅ **Code comments très détaillés** (français/anglais mixte) — documentation inline excellente sur la logique métier.

---

## 12. POINTS FAIBLES & RISQUES

### 🔴 P0 — Critiques (sécurité, data leak, RCE, injection)

| # | Issue | Fichier | Impact | Effort fix |
|---|-------|---------|--------|-----------|
| **P0-1** | Mot de passe DB Supabase hardcodé dans CI : `process.env.SUPABASE_DB_PASSWORD \|\| 'titebe1234DEV@'` | `.github/workflows/deploy.yml:45` | Attaquant lit le repo public → se connecte en `postgres` à `db.twkdvsuefjewykxsnrwu.supabase.co` (si mdp encore valide) → full DB dump, modification/suppression données. **Rotation immédiate du mdp + audit logs connexion Supabase 30 derniers jours.** | S |
| **P0-2** | Codes OTP test stockés en mémoire + endpoint `GET /api/auth/test-code?phone=...&key=yazz-test-2026` non protégé par secret fort. 13 numéros test dont `243986842924` (owner Henock Titebe). Si déployé en prod, attaque impersonation owner. | `src/api/authRoutes.js:44-56,414-452` | Quelqu'un qui connaît le numéro owner + la clé hardcodée peut récupérer son OTP et se logger en admin. | S |
| **P0-3** | CORS `*` par défaut en prod (warning mais pas de blocage). | `src/utils/config.js:89`, `src/server.js:158` | CSRF possible, exfiltration données par sites tiers. | S |
| **P0-4** | `apiKeyAuth` fail-open en dev : si `NODE_ENV!=production` (typo), API REST totalement ouverte sans auth. | `src/middleware/auth.js:23-33` | Si quelqu'un oublie `NODE_ENV=production` en deploy, toute l'API est publique. | S |
| **P0-5** | Service role key utilisée pour tous les appels Supabase (1 seul client singleton). Bypass total RLS. | `src/services/supabaseService.js:12` | Si une route est mal protégée, fuite massive (tous users, toutes positions). Pas de scoping par user_id. | M |
| **P0-6** | RPC `exec_sql` (non versionnée) appelée pour auto-migration — accepte paramètre `query: text`. | `src/services/supabaseService.js:525-549` | Si exposée par défaut (pas de check role), SQL injection arbitraire via service_role key. À vérifier côté dashboard. | S |
| **P0-7** | `OTP_DRY_RUN=true` par défaut dans `.env.example` — si quelqu'un déploie avec `.env.example` copié tel quel, tous les codes OTP sont loggés en clair (fuite credentials users). | `.env.example:80`, `src/api/authRoutes.js:344-352` | Fuite OTP en clair dans logs backend → accès comptes users. | S |

### 🟠 P1 — Importants (dette tech, perf, maintainability)

| # | Issue | Fichier | Impact | Effort |
|---|-------|---------|--------|--------|
| **P1-1** | Aucun test (0 tests, jest installé mais non utilisé). | — | Régressions fréquentes, refactoring risqué. | L |
| **P1-2** | Aucun ESLint/Prettier. | — | Code quality non enforced, style inconsistent. | S |
| **P1-3** | JavaScript pur, pas de TypeScript. | — | Pas de type-check, IDE moins efficace, refactoring risqué. | L |
| **P1-4** | `ws@8.20.0` vulnérable (high, DoS memory exhaustion). | `package.json:45` | DoS possible via crafted WebSocket frames. Fix: `^8.21.0`. | S |
| **P1-5** | `firebase-admin@13.9.0` entraîne `websocket-driver@0.7.4` (critical CVE). | `package.json:39` | Message corruption WebSocket. Fix: `firebase-admin@14.4.0`. | S |
| **P1-6** | `handle_new_user()` trigger sur `auth.users` non versionné dans migrations. | migrations/ | Nouvelle installation Supabase → pas d'auto-création `public.users` à l'inscription. | S |
| **P1-7** | `exec_sql` RPC non versionnée. | supabaseService.js:525 | Non reproductible, dépend d'artéfact dashboard. | S |
| **P1-8** | `process.exit(0)` sur erreur migration dans CI → déploiements silencieusement cassés. | `.github/workflows/deploy.yml:85` | Migrations échouent en prod sans alerte. | S |
| **P1-9** | `scripts/deploy_lbs_fix.sh` cassé (`[REDACTED:github_token]` placeholder). | scripts/ | Script de fix rapide non fonctionnel. | S |
| **P1-10** | Validation inputs manuelle (pas de zod/joi). | toutes les routes | Inconsistance, oublis possibles. | M |
| **P1-11** | `redis-server --requirepass ${REDIS_PASSWORD:-yazz_redis_2026}` fallback hardcodé. | docker-compose.yml:49 | Si `REDIS_PASSWORD` non setté, Redis utilise mdp par défaut. | S |
| **P1-12** | `getAllDevices`, `getAllLastPositions` retournent TOUTES les données de tous les users (admin-only mais pas de pagination DB-side au-delà de 1000). | routes.js | À 5K-10K devices, timeout possible. | M |
| **P1-13** | Pas de rate limit per-user (JWT) sur routes sensibles (payments, engine-cut). | — | Spam possible malgré rate limit par IP. | M |
| **P1-14** | `MAPBOX_ACCESS_TOKEN` et `PAWAPAY_*` non documentés dans `.env.example`. | .env.example | Oubli config → silent failure. | S |
| **P1-15** | `supabase/.temp/` tracked dans git (project ref + org ID). | supabase/.temp/ | Fuite metadata. | S |
| **P1-16** | `verifyShwarySignature` pad à `maxLen` avec `Buffer.alloc` + `timingSafeEqual` — code inhabituel, fonctionne mais à simplifier. | webhookRoutes.js:41-52 | Maintainability. | S |
| **P1-17** | `paymentRoutes.js:140` — si `verifyErr` API Shwary down, `isVerified = true` ("trust sync response"). | paymentRoutes.js:138-141 | Faux paiement validé si API Shwary indisponible au moment de l'init. | S |
| **P1-18** | `engineCutRoutes.js:178` retourne `success: true` avec warning si `updateError` DB. | engineCutRoutes.js:178-185 | État DB incohérent avec état capteur. | S |
| **P1-19** | Image Docker `node:20-alpine` non pinée par digest. | Dockerfile:2 | Rebuild non-reproductible. | S |
| **P1-20** | Pas de `security_opt: [no-new-privileges:true]` ni `read_only: true` sur conteneur. | docker-compose.yml | Container escape plus facile. | S |
| **P1-21** | Logs non structurés (format string, pas JSON). | utils/logger.js | Ingestion Loki/ELK difficile. | S |
| **P1-22** | Pas de metrics Prometheus. | — | Pas de dashboard Grafana, pas d'alerting business. | M |
| **P1-23** | `routes.js:81` : `/api/users/:userId/devices` ne vérifie pas que le caller est le user concerné (apiKey-only) → IDOR. | routes.js | Avec API key, on liste devices de n'importe quel user. | S |

### 🟡 P2 — Mineurs (qualité, conventions)

| # | Issue | Fichier |
|---|-------|---------|
| **P2-1** | Convention nommage migrations cassée : `2026_06_20_allow_phone_only_signup.sql` au lieu de `037_*.sql`. | migrations/ |
| **P2-2** | Commentaires mix FR/EN (principalement FR avec headers EN). | partout |
| **P2-3** | `scripts/test-simulator.js` IMEI default `9171071034` (probablement un IMEI test réel). | scripts/ |
| **P2-4** | `update-https.sh` log `${REMOTE_HASH:0:8}` mais pas le hash complet (OK). | update-https.sh |
| **P2-5** | Dossier `skills/` (48 sous-dossiers) présent dans le repo — pas lié au backend GPS. Bloat du repo (+10 Mo). | skills/ |
| **P2-6** | Dossier `download/` contient uniquement `README.md` vide. | download/ |
| **P2-7** | Pas de `.nvmrc` / `.node-version` ( engines node >=18 mais image Docker 20). | — |
| **P2-8** | `tcpServer.js:210` commentaire `90s (was 5min); // 5 min idle timeout` — code comment residuel. | tcpServer.js |
| **P2-9** | `config.js:29` commentaire `// Fixed: was TWILIO_ACCOU2NT_SID (typo)` — référence à un bug fix dans un commentaire (à nettoyer). | config.js |
| **P2-10** | `routes.js` mélange endpoints admin et user-scoped sans préfixe `/admin/`. | routes.js |
| **P2-11** | Pas de versionning API (`/api/v1/...`). | server.js |
| **P2-12** | `LICENSE: "ISC"` mais pas de fichier `LICENSE`. | package.json |
| **P2-13** | `hetzner-setup.sh:120` source `.env` dans shell (risque injection). | deploy/ |
| **P2-14** | `paymentRoutes.js:32` : `(typeof rawMin === 'number' ? rawMin : parseInt(rawMin, 10)) \|\| 3000` — si `rawMin === 0`, fallback à 3000 (OK car 0 = pas de min, mais logique implicite). | paymentRoutes.js |
| **P2-15** | `supabase/.temp/` devrait être dans `.gitignore`. | .gitignore |

---

## 13. RECOMMANDATIONS PRIORITISÉES

### 🔴 P0 — Action immédiate (cette semaine)

| # | Action | Effort | Détail |
|---|--------|--------|--------|
| 1 | **Rotationner le mdp DB Supabase** `titebe1234DEV@` + auditer logs connexion 30j | S | Supabase Dashboard → Database → Logs → filtrer par IP non-VPS. Remplacer mdp dans `.env` VPS. |
| 2 | **Supprimer fallback mdp hardcodé** dans `.github/workflows/deploy.yml:45` | S | `password: process.env.SUPABASE_DB_PASSWORD` sans fallback, `if (!process.env.SUPABASE_DB_PASSWORD) throw`. Ajouter var `SUPABASE_DB_PASSWORD` dans secrets GitHub. |
| 3 | **Supprimer `TEST_PHONES` + endpoint `/api/auth/test-code`** du code prod (feature-flag via `NODE_ENV === 'test'`) | S | `if (config.isDev && TEST_PHONES.has(phone)) {...}` — bloqué en prod. |
| 4 | **Forcer `CORS_ORIGINS` explicite en prod** (throw au démarrage si `*`) | S | `if (config.corsOrigins === '*' && !config.isDev) throw new Error('CORS_ORIGINS=* forbidden in production');` |
| 5 | **Fail-closed `apiKeyAuth`** : si `API_KEY` non set en prod → 503 (déjà fait) MAIS aussi vérifier `NODE_ENV` exact string `'production'` (pas substring). | S | `if (process.env.NODE_ENV !== 'production' && !config.apiKey) throw...` au démarrage. |
| 6 | **Séparer client Supabase service_role (ops serveur) et client anon (ops user-scoped)** | M | Créer `getSupabaseAnon()` pour `supabaseAuth.getUser(token)` (pas besoin de service_role pour valider un JWT). |
| 7 | **Vérifier + supprimer la RPC `exec_sql`** si elle existe côté Supabase, ou la définir dans une migration avec check `service_role` strict. | S | Dashboard Supabase → Database → Functions → `exec_sql`. |
| 8 | **Changer `OTP_DRY_RUN` défaut à `false`** dans `.env.example` | S | `OTP_DRY_RUN=false` (ou supprimer la var). |

### 🟠 P1 — Plan d'action (1-2 sprints)

| # | Action | Effort | Détail |
|---|--------|--------|--------|
| 9 | **Bump `ws` à `^8.21.0`** | S | `npm install ws@^8.21.0` |
| 10 | **Bump `firebase-admin` à `^14.4.0`** | S | `npm install firebase-admin@^14.4.0` (semver-major, tester FCM) |
| 11 | **Ajouter ESLint + Prettier** | S | `npm i -D eslint prettier eslint-config-prettier eslint-config-airbnb-base` + `.eslintrc.json` |
| 12 | **Ajouter tests Jest** sur services critiques (creditService, webhookRoutes verifySignature, alertEngine cooldown) | L | Commencer par smoke tests sur `supabaseService`, `shwaryService`, `pawaPayProvider`. |
| 13 | **Migrer vers TypeScript** | L | `tsc --init` + renommer `.js` → `.ts` progressivement, commencer par `utils/`, `middleware/`. |
| 14 | **Ajouter `zod` + schemas de validation** par route | M | `npm i zod` + `const DeviceCreateSchema = z.object({...})` |
| 15 | **Rate limit per-user** sur `/api/payments`, `/api/devices/:id/engine-cut`, `/api/commands/:imei` | M | `express-rate-limit` avec `keyGenerator: (req) => req.user.id` |
| 16 | **Pin image Docker par digest** | S | `FROM node:20-alpine@sha256:...` |
| 17 | **`security_opt: [no-new-privileges:true]` + `read_only: true`** (avec tmpfs pour `/tmp`, `logs/`) | S | docker-compose.yml |
| 18 | **Versionner `handle_new_user` trigger** dans une migration | S | `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users ...` |
| 19 | **Supprimer `process.exit(0)` sur erreur migration** dans CI | S | `process.exit(1)` |
| 20 | **Fix `IDOR` `/api/users/:userId/devices`** : exiger JWT + check `req.user.id === req.params.userId` | S | routes.js:100 |
| 21 | **Ajouter metrics Prometheus** (`prom-client`) | M | `/metrics` endpoint + Grafana dashboard |
| 22 | **Logs structurés JSON** | S | `format: format.json()` dans logger.js |
| 23 | **Nettoyer `skills/` et `download/`** du repo | S | `git rm -r skills/ download/` + ajouter au `.gitignore` |
| 24 | **Ajouter `supabase/.temp/` au `.gitignore`** | S | + `git rm -r --cached supabase/.temp/` |

### 🟡 P2 — Backlog

- Renommer `2026_06_20_allow_phone_only_signup.sql` → `037_phone_only_signup.sql`.
- Ajouter `.nvmrc` (`20`).
- Unifier langage des commentaires (FR ou EN, pas mixte).
- Préfixer routes admin avec `/api/admin/*` pour clarifier.
- Versioning API (`/api/v1/*`).
- Ajouter fichier `LICENSE` (MIT/Apache au choix, pas ISC).
- Nettoyer commentaires résiduels (`// Fixed: was TWILIO_ACCOU2NT_SID (typo)`).
- Documenter `MAPBOX_ACCESS_TOKEN` et `PAWAPAY_*` dans `.env.example`.
- Rate limit différencié pour `/api/payments/initiate` (5/min/user).
- Validation range GPS coords dans `parkingRoutes` et `geofences` POST.

---

## 14. CONCLUSION

Le backend **yazz_backend** est un système GPS tracking **mature fonctionnellement** (38 migrations, multi-protocol TCP, multi-provider paiement, alert engine riche, RLS systématique, RPC atomiques sécurisées) **mais présente des défauts de sécurité critiques** qui doivent être corrigés avant toute mise en production à grande échelle :

1. **Secret DB hardcodé dans CI publique** (P0-1) → rotation immédiate.
2. **Backdoors OTP test** récupérables via endpoint non protégé (P0-2) → feature-flag.
3. **CORS `*` + fail-open auth en dev** (P0-3, P0-4) → forcer en prod.
4. **Service role key utilisée partout** sans scoping user (P0-5) → séparer clients.
5. **`exec_sql` RPC** non versionnée et potentiellement exposée (P0-6) → auditer.
6. **0 test, 0 ESLint, JS pur** (P1-1/2/3) → dette tech à rembourser.

**Score final** :
- 🟢 Ops/Docker/Graceful shutdown : **8/10** (excellent)
- 🟡 Architecture/Code : **6.5/10** (modulaire mais pas de TS/tests/lint)
- 🟡 SQL/RLS/Migrations : **8/10** (RLS systématique, RPC sécurisées, mais trigger manquant + exec_sql non versionnée)
- 🔴 Sécurité runtime : **5/10** (secrets hardcodés, CORS fail-open, IDOR, pas de rate limit per-user)
- 🟡 Observabilité : **6/10** (Sentry ✅, mais logs string + pas de Prometheus)

**Effort total de remediation** : ~3-4 sprints (1 dev senior).
- P0 : 3-5 jours
- P1 : 4-6 semaines
- P2 : backlog continu

---

*Fin du rapport d'audit — AUDIT-YAZZ-BACKEND*
