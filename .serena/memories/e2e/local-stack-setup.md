# E2E Local Stack Setup (multi-workspace gotchas)

Running a live Playwright run in a Conductor workspace — verified 2026-09-25 on PSG-33:

- Ports 5432/6379 may already be owned by other workspaces' containers (`Bind ... port is already allocated`). The compose file expects per-workspace ports via root `.env` (gitignored). Working set: `POSTGRES_PORT=55020`, `REDIS_PORT=55021` (must match `DATABASE_URL`/`REDIS_URL`), `PORT=7777`, `FRONTEND_ORIGIN=http://localhost:4173`.
- A fresh workspace may lack root `node_modules` (`prisma: command not found` on migrate) and `web/node_modules` — run `npm install` at root and in `web/`; `e2e/` needs `npm ci` for typecheck.
- `web/.env` (gitignored) must set `BACKEND_URL=http://localhost:7777` — `web/src/lib/env.ts` throws otherwise.
- Playwright chromium may be missing from the cache — `npx playwright install chromium`.
- Full run order: `local:db:up` → `local:db:migrate` → `start:dev` (backend, :7777) → `web` build+preview (:4173) → `local:db:seed:e2e` → `npm --prefix e2e test`. Back-to-back runs without reseeding are the pollution check (specs must delete their own rows). See `mem:suggested_commands`.
- E2E fixtures are self-cleaning: `seedUser()`/`seedMatch()` delete prior e2e sales before re-seeding, so a failed test's dangling row is cleared by the next `local:db:seed:e2e` — but NOT by a bare re-run (duplicate same-price rows then cause strict-mode locator errors).