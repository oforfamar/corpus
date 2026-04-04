# Corpus — Agent & AI Assistant Reference

> This file (`AGENTS.md`) and `CLAUDE.md` are identical and must be kept in sync.
> When making changes to one, apply the same changes to the other.

## Project overview

**Corpus** is a self-hosted body composition tracker. Users log smart-scale measurements monthly (or more frequently) and view their progress over time via interactive charts. It supports multiple users, OIDC authentication via Authelia, and derives additional health metrics from stored user profiles.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+, ES modules (`"type": "module"`) |
| Framework | Express 5 |
| Database | SQLite via `better-sqlite3` |
| Auth | `better-auth` with `genericOAuth` plugin (OIDC, Authelia) |
| DB adapter | `@better-auth/kysely-adapter` + `kysely` with `SqliteDialect` |
| Frontend | Single-page HTML (`public/index.html`) — no build step, no framework |
| Charts | Chart.js 4 + `chartjs-adapter-date-fns` + `chartjs-plugin-annotation` |
| Config | `dotenv` via `.env` file |

---

## Repository structure

```
corpus/
├── server.js              # Express app entry point, session middleware, auth guard
├── auth.js                # better-auth instance with OIDC/genericOAuth config
├── db.js                  # SQLite schema creation + all prepared statement exports
├── routes/
│   ├── entries.js         # CRUD for body measurement entries
│   ├── users.js           # Distinct user name listing
│   └── profile.js         # User profile get/upsert
├── public/
│   └── index.html         # Full SPA: form, charts, stats row, modals
├── systemd/
│   ├── corpus.service     # systemd unit (Debian/Ubuntu)
│   └── corpus.openrc      # OpenRC init script (Alpine Linux)
├── data/                  # Auto-created at runtime, gitignored
│   └── tracker.db         # SQLite database
├── .env.example           # Environment variable template
├── package.json
├── AGENTS.md              # This file
└── CLAUDE.md              # Identical to AGENTS.md
```

---

## Environment variables

Defined in `.env` (copy from `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `AUTHELIA_ISSUER` | Yes (prod) | OIDC issuer URL, no trailing slash |
| `OIDC_CLIENT_ID` | Yes (prod) | Client ID registered in Authelia |
| `OIDC_CLIENT_SECRET` | Yes (prod) | Client secret |
| `BASE_URL` | Yes (prod) | Public URL of this app (used for OIDC redirect URI) |
| `SESSION_SECRET` | Yes (prod) | Long random string for signing session cookies |
| `PORT` | No | Port to listen on, defaults to `3000` |
| `AUTH_BYPASS` | No | Set to `true` to skip OIDC entirely — injects a fake "Dev User" session. **Never use in production.** |

---

## Database schema

The app uses a single SQLite file at `data/tracker.db`. better-auth creates its own tables (`user`, `session`, `account`, `verification`) in the same file via its Kysely adapter.

### `entries` table

Stores one row per measurement session per user.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `user_id` | TEXT | better-auth user UUID from session |
| `user_name` | TEXT | Display name from OIDC, stored for filtering |
| `date` | TEXT | ISO 8601 (`YYYY-MM-DD`), user-chosen |
| `weight_kg` | REAL | |
| `bmi` | REAL | Can be auto-calculated from weight + profile height |
| `body_fat_pct` | REAL | |
| `body_water_pct` | REAL | |
| `metabolic_age` | INTEGER | |
| `bmr_kcal` | INTEGER | |
| `muscle_mass_kg` | REAL | Total body |
| `bone_mass_kg` | REAL | |
| `visceral_fat` | REAL | |
| `left_arm_muscle_kg` | REAL | |
| `left_arm_fat_pct` | REAL | |
| `right_arm_muscle_kg` | REAL | |
| `right_arm_fat_pct` | REAL | |
| `left_leg_muscle_kg` | REAL | |
| `left_leg_fat_pct` | REAL | |
| `right_leg_muscle_kg` | REAL | |
| `right_leg_fat_pct` | REAL | |
| `trunk_muscle_kg` | REAL | |
| `trunk_fat_pct` | REAL | |
| `created_at` | TEXT | `datetime('now')` default |

### `user_profiles` table

One row per user. Created/updated via the profile modal in the UI. No separate CRUD page.

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | matches better-auth `user.id` |
| `user_name` | TEXT | |
| `date_of_birth` | TEXT | `YYYY-MM-DD` — age is always computed dynamically |
| `height_cm` | REAL | |
| `sex` | TEXT | `'male'` or `'female'` |
| `updated_at` | TEXT | Updated on every upsert |

---

## API routes

All routes except `/api/auth/*` require an active session. In `AUTH_BYPASS=true` mode the session is always the fake Dev User.

| Method | Path | Auth | Description |
|---|---|---|---|
| `ALL` | `/api/auth/*` | — | Delegated to better-auth (OIDC sign-in, callback, sign-out) |
| `GET` | `/api/me` | Yes | Current user `{ id, name, email }` |
| `GET` | `/api/entries` | Yes | All entries, optional `?user=<name>` filter, ordered by date ASC |
| `POST` | `/api/entries` | Yes | Create entry; `user_id`/`user_name` from session, not body |
| `PUT` | `/api/entries/:id` | Yes | Update entry; enforces ownership |
| `DELETE` | `/api/entries/:id` | Yes | Delete entry; enforces ownership; returns 204 |
| `GET` | `/api/users` | Yes | Distinct user names that have at least one entry |
| `GET` | `/api/profile` | Yes | Current user's profile row or `null` |
| `PUT` | `/api/profile` | Yes | Upsert current user's profile |

---

## Auth flow

- better-auth is initialised in `auth.js` with the `genericOAuth` plugin
- The OIDC provider is named `authelia` and uses discovery URL auto-detection (`/.well-known/openid-configuration`)
- PKCE is enabled (`pkce: true`)
- Session cookies are issued by better-auth; every request runs `auth.api.getSession()` to validate them
- Unauthenticated browser requests are redirected to `/api/auth/sign-in/social?providerId=authelia&callbackURL=/`
- Unauthenticated API requests return `401`
- `AUTH_BYPASS=true` skips all of the above and injects: `{ userId: 'dev-user', user: { id: 'dev-user', name: 'Dev User', email: 'dev@localhost' } }`

---

## Frontend architecture

Single file: `public/index.html`. No build step, no framework, no bundler. All logic is vanilla JS in a `<script>` block at the bottom.

### Key state variables

```js
let me = null;          // { id, name, email } from /api/me
let myProfile = null;   // user_profiles row for current user, or null
let allEntries = [];    // all entries currently loaded (respects filter)
const charts = {};      // Chart.js instances keyed by canvas ID
```

### Key functions

| Function | Description |
|---|---|
| `boot()` | Fetches `/api/me` + `/api/profile` in parallel, sets header, auto-opens profile modal if incomplete, calls `loadData()` |
| `loadData()` | Fetches entries (with filter), refreshes user filter dropdown, calls `renderStats()`, `renderCharts()`, `renderTable()` |
| `renderStats()` | Builds the 5-card derived metrics row above charts (weight trend, BMI category, body fat ACE category, metabolic age delta, BMR vs Mifflin-St Jeor) |
| `renderCharts()` | Creates or updates all 6 Chart.js instances; applies ideal weight band and ACE body fat bands as annotations |
| `renderTable()` | Builds the history table sorted descending; shows Edit/Delete only for own rows |
| `autoFillBmi(prefix)` | On weight input: computes BMI from stored `myProfile.height_cm` and fills the BMI field |
| `openProfileModal(mandatory)` | Opens profile modal; if `mandatory=true` the cancel button is disabled |
| `submitProfile(e)` | PUTs to `/api/profile`, updates `myProfile`, re-renders stats and charts |
| `openEditModal(entry)` | Populates and shows the edit modal |
| `makeDatasetsMulti(fields, entries)` | Builds Chart.js datasets — one dataset per field when single-user view, one per user per field when all-users view |
| `weightAnnotations()` | Returns chartjs-plugin-annotation config for ideal weight band (BMI 18.5–24.9) |
| `fatAnnotations()` | Returns annotation config for ACE fitness (green) and acceptable (amber) body fat bands |
| `aceRanges(sex, age)` | Returns `{ fitness: [lo,hi], acceptable: [lo,hi] }` per ACE guidelines, with +2% per decade adjustment over age 60 |
| `mifflinBmr(weight, height, age, sex)` | Mifflin-St Jeor formula for BMR in kcal/day |
| `ageFromDob(dob)` | Returns decimal age from `YYYY-MM-DD` string |

### Charts

| Canvas ID | Metrics | Annotations |
|---|---|---|
| `chart_weight` | `weight_kg`, `bmi` | Ideal weight band (green, profile required) |
| `chart_fat_water` | `body_fat_pct`, `body_water_pct` | ACE fitness band (green) + acceptable band (amber), profile required |
| `chart_muscle_bone` | `muscle_mass_kg`, `bone_mass_kg` | None |
| `chart_misc` | `visceral_fat`, `metabolic_age`, `bmr_kcal` | None |
| `chart_limb_muscle` | L/R arm + L/R leg + trunk muscle (kg) | None |
| `chart_limb_fat` | L/R arm + L/R leg + trunk fat (%) | None |

---

## Service files

The `systemd/` directory contains two init files. Both assume:
- App installed at `/opt/corpus`
- Dedicated system user `corpus` (no login shell, no home directory)
- `.env` at `/opt/corpus/.env`, owned `corpus:corpus`, mode `640`
- Data directory at `/opt/corpus/data`

| File | System | Init system |
|---|---|---|
| `systemd/corpus.service` | Debian / Ubuntu | systemd |
| `systemd/corpus.openrc` | Alpine Linux | OpenRC |

---

## Development workflow

```bash
# Install dependencies
npm install

# Run with auth bypass (no Authelia needed)
AUTH_BYPASS=true node server.js

# Run with auto-restart on file changes
AUTH_BYPASS=true npm run dev
```

The database is created automatically at `data/tracker.db` on first run. Delete it to start fresh.

---

## Conventions and constraints

- **No build step.** The frontend is a single `public/index.html` file with inline CSS and JS. Do not introduce a bundler or framework without explicit instruction.
- **No ORM.** Database access uses `better-sqlite3` prepared statements directly in `db.js`. Do not introduce Prisma, Drizzle, or any ORM.
- **ES modules only.** All files use `import`/`export`. `"type": "module"` is set in `package.json`.
- **All metrics in SI units.** Weight and mass in kg, height in cm, percentages as plain numbers (e.g. `18.2` not `0.182`).
- **Ownership enforcement.** Users can only edit and delete their own entries. Profile data is always scoped to the current session user. No admin roles exist.
- **Data is shared but labelled.** All logged-in users can see all entries (filtered by the profile dropdown). There is no private data mode.
- **No frontend routing.** The SPA is a single page; there are no client-side routes.
- **Profile is upsert-only.** There is no delete endpoint for user profiles.
