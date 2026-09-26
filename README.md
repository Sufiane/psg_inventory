# PSG Inventory

A NestJS REST API for managing Paris Saint-Germain match ticket inventory and sales. 
Track ticket listings, monitor financial performance, and fetch live match data from the Football Data API.

## Features

- JWT authentication with role-based access control (USER / ADMIN)
- Full CRUD for ticket sales with status tracking (PENDING → SOLD / CANCELLED)
- Automatic profit calculation accounting for PSG's 12% commission
- Financial summaries (current season, specific season, all-time)
- Match data sync from the Football Data API
- Redis caching with smart invalidation
- Scheduled job for auto-cancelling stale sales

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 (Express) |
| Language | TypeScript 5 |
| Database | PostgreSQL + Prisma 6 |
| Cache | Redis |
| Auth | JWT + Passport.js + bcrypt |
| External API | Football Data API v4 |
| Testing | Jest |

## Prerequisites

- Node.js >= 22.12
- Docker (runs the local PostgreSQL *and* Redis used in dev/test — see [Local Stack](#local-stack))

## Installation

```bash
git clone https://github.com/your-username/psg_inventory.git
cd psg_inventory
npm install
```

Copy `.env.example` to `.env` and fill in the values (see [Environment Variables](#environment-variables)),
start the local stack, then run migrations and seed the demo accounts:

```bash
npm run local:db:up
npm run local:db:migrate
npm run local:db:seed
```

## Local Stack

Local dev and tests run against disposable PostgreSQL and Redis containers defined in
[`docker-compose.yml`](docker-compose.yml) — never against the production database.

```bash
npm run local:db:up      # start postgres + redis, wait for both to be healthy
npm run local:db:migrate # apply migrations (prisma migrate deploy)
npm run local:db:seed    # seed demo accounts (see Demo Accounts below)
npm run local:db:down    # stop the containers, keep the data
npm run local:db:destroy # stop the containers and delete their volumes
```

`DATABASE_URL` and `REDIS_URL` in `.env.example` already point at these containers. The production
connection string (Aiven, via Railway) only belongs in the deployed environment's config — never in a
local `.env`, since any `prisma migrate`/seed run acts on whichever `DATABASE_URL` is active.

### Running several checkouts at once

The compose file takes its project name and host ports from `.env`, so each checkout can own a
private stack instead of sharing one:

| Variable | Purpose |
|---|---|
| `COMPOSE_PROJECT_NAME` | Namespaces the containers and volumes |
| `POSTGRES_PORT` | Host port for PostgreSQL (container side stays 5432) |
| `REDIS_PORT` | Host port for Redis (container side stays 6379) |

Give each checkout a distinct project name and port pair, and keep `DATABASE_URL` / `REDIS_URL` in
step with them. In Conductor this is automatic: `.conductor/settings.local.toml` derives all of it
from `CONDUCTOR_WORKSPACE_NAME` and `CONDUCTOR_PORT`, and the archive script destroys only that
workspace's own containers and volumes.

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `JWT_EXPIRES` | Token expiration (e.g. `1d`) |
| `FOOTBALL_DATA_API_KEY` | API key for [football-data.org](https://www.football-data.org) |
| `REDIS_URL` | Redis connection string |

## Running the App

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The server starts on port **7777** by default.

## Demo Accounts

Seeded by `npm run local:db:seed` (re-running wipes & re-seeds these two users only).

The seed also generates a synthetic fixture list — home and away matches across the current and
previous season, with results on the ones already played — so a fresh database is usable without a
Football Data API key. Seasons are derived from today's date, not hardcoded. A season that already
holds real synced matches is left untouched.

| Email | Password | Setup |
|---|---|---|
| `demo1@psg.fr` | `demo1234` | 1 season pass current season, 1 season pass previous season, sales on each |
| `demo2@psg.fr` | `demo1234` | 2 season passes same current season, each sale allocated across both passes |

## Tests

```bash
npm run test          # unit tests
npm run test:cov      # with coverage report
```

## E2E Tests

Playwright specs in [`e2e/`](e2e) cover the critical paths end to end: login, sale
create/SOLD/GIFTED/delete, and season-pass create/update/delete. `e2e/` is its own npm
package (own `package.json`, own lockfile) — install its dependencies separately from
the root.

Requires the local stack, a built+running backend, and a built+previewed frontend, all
talking to each other on fixed ports. **`FRONTEND_ORIGIN` must be set to the frontend
preview's origin (`:4173`), not left at its `:5173` dev-server default** — the backend's
CORS check otherwise rejects every request from the e2e run.

```bash
# 1. Local stack + seed data
npm run local:db:up
npm run local:db:migrate
npm run local:db:seed:e2e

# 2. Backend, built and started in the background
FRONTEND_ORIGIN=http://localhost:4173 npm run build
FRONTEND_ORIGIN=http://localhost:4173 npm run start:prod &

# 3. Frontend, built and previewed in the background (needs BACKEND_URL at runtime).
# `vite preview`'s Miniflare emulation reads `.dev.vars`, not process env, so a plain
# `BACKEND_URL=... npm run preview` is silently ignored in favor of wrangler.jsonc's
# committed prod URL — write .dev.vars instead.
cd web
npm install
echo "BACKEND_URL=http://localhost:7777" > .dev.vars  # must match the backend's default PORT (see "Running the App")
npm run build
npm run preview &
cd ..

# 4. Run the suite
cd e2e
npm install
npx playwright install --with-deps chromium
npm test
```

CI runs this same sequence automatically on every pull request as the required `E2E`
check (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — a failing e2e run
blocks merge the same way a failing `checks` run does.

On failure, inspect `e2e/playwright-report/` locally (open `index.html`), or download
the `playwright-report` artifact from the failed CI run's Actions summary page.

## API Overview

All endpoints except `POST /users` and `POST /users/login` require a `Bearer` JWT token.
Admin endpoints additionally require the `ADMIN` role.

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/users` | Public | Register a new user |
| POST | `/users/login` | Public | Login, returns JWT token |

### Matches
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/matches/current-season` | JWT | List matches for the current season |
| GET | `/matches/season/:seasonStartYear` | JWT | List matches for a given season |
| GET | `/matches/:matchId` | JWT | Get a single match |

> All match endpoints accept `?withResult=true` to include match results.

### Sales
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sales` | JWT | List the authenticated user's sales |
| GET | `/sales/:saleId` | JWT | Get a single sale |
| POST | `/sales` | JWT | Create a new sale |
| POST | `/sales/update` | JWT | Update an existing sale |
| DELETE | `/sales/:saleId` | JWT | Delete a sale |

### Accounting
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/accounting/current-season` | JWT | Financial summary for the current season |
| GET | `/accounting/all-time` | JWT | All-time financial summary |
| GET | `/accounting/season/:seasonStartYear` | JWT | Summary for a given season |

### Admin
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/admin/matches/load/current-season` | JWT + ADMIN | Sync current season matches from Football Data API |
| POST | `/admin/matches/load/:seasonStartYear` | JWT + ADMIN | Sync a specific season from Football Data API |
| POST | `/admin/matches` | JWT + ADMIN | Manually create a match |

## Project Structure

```
src/
├── api/
│   ├── users/          # Registration & login
│   ├── matches/        # Match endpoints
│   ├── sales/          # Sales CRUD
│   ├── accounting/     # Financial reporting
│   └── admin/          # Admin-only operations
├── auth/               # JWT & Local strategies
├── db/                 # Prisma database layer
├── football-data/      # Football Data API client
├── redis/              # Redis caching service
├── crons/              # Scheduled tasks
├── common/             # Exception handling
├── shared/             # Guards, decorators, constants, utils
├── prisma/
│   └── schema.prisma   # Database schema
└── env.schema.ts       # Environment variable validation
```
