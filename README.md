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

- Node.js >= 18
- PostgreSQL — free tier available on [Aiven](https://aiven.io)
- Redis — free tier available on [Render](https://render.com)

## Installation

```bash
git clone https://github.com/your-username/psg_inventory.git
cd psg_inventory
npm install
```

Copy `.env.example` to `.env` and fill in the values (see [Environment Variables](#environment-variables)), 
then run migrations:

```bash
npx prisma migrate dev
```

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

Seeded by `npx ts-node scripts/seed-demo.ts` (re-running wipes & re-seeds these two users only).

| Email | Password | Setup |
|---|---|---|
| `demo1@psg.fr` | `demo1234` | 1 season pass current season (2025), 1 season pass previous season (2024), sales on each |
| `demo2@psg.fr` | `demo1234` | 2 season passes same current season (2025), each sale allocated across both passes |

## Tests

```bash
npm run test          # unit tests
npm run test:cov      # with coverage report
```

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
