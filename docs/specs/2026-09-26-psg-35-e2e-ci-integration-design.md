# PSG-35: E2E CI integration + README — Design

**Date:** 2026-09-26
**Status:** Draft
**Issue:** PSG-35 (parent PSG-31; blocked-by PSG-33 and PSG-34, both merged)
**Type:** CI config + docs only. No application code changes.

## Context

PSG-31 added an e2e Playwright suite (`e2e/`): `auth.e2e-spec.ts` (PSG-32, foundation),
`sale.e2e-spec.ts` (PSG-33, merged as `c61f219`), `season-pass.e2e-spec.ts` (PSG-34,
merged as `3a6b307`). All three specs exist and pass when run manually against a locally
built stack. Nothing runs them in CI, and nothing in the README tells a contributor they
exist or how to run them.

The referenced parent planning doc
(`docs/plans/2026-09-24-e2e-critical-path-tests-implementation-plan.md`) is not in the
repo — as with PSG-33/34, this spec is derived fresh from the ticket description and the
current state of the scaffold, not from that lost doc.

PSG-35 covers the parent plan's Tasks 6-7:

- **Task 6:** a CI job that spins up the local stack, migrates, seeds, builds+starts the
  backend, builds+previews the frontend, then runs `playwright test`.
- **Task 7:** a README section documenting the e2e setup and how to run it.

## Current state (read from the repo, not assumed)

- **CI system:** GitHub Actions. One workflow, `.github/workflows/ci.yml`, one job
  (`checks`): `npm ci` → typecheck → lint → lint:deps → `npm test` (vitest, backend
  unit/integration) → `npm run build` → asserts `dist/main.js` exists. Triggers:
  `pull_request` and `push` to `main`.
- **`docker-compose.yml`:** Postgres 16.4 + Redis 7.4, both with healthchecks, no fixed
  ports or project name (uses `${POSTGRES_PORT:-5432}` / `${REDIS_PORT:-6379}` /
  `COMPOSE_PROJECT_NAME` from `.env`, all optional — a missing `.env` is fine, compose
  falls back to the literal defaults).
- **Root `package.json` scripts** already do everything Task 6 needs individually:
  `local:db:up` (`docker compose up -d --wait` — blocks until both healthchecks pass),
  `local:db:migrate` (`prisma migrate deploy`), `local:db:seed:e2e`, `build`
  (`nest build && tsc-alias`), `start:prod` (`node dist/main`).
- **`web/package.json`:** `build` (`vite build`), `preview` (`vite preview`, defaults to
  port `4173`). No prerendered routes (`grep prerender` in `web/src` is empty), so
  `vite build` itself needs no backend and no `BACKEND_URL` — only `preview` (which runs
  the SSR server at runtime) does.
- **`e2e/` is its own npm package** — separate `package.json`/lockfile, not an npm
  workspace member of root or `web/`. `npm test` = `playwright test`, `npm run typecheck`
  = `tsc --noEmit`. Playwright browsers are not installed anywhere in CI today.
  `e2e/playwright.config.ts` already defaults `baseURL` to `http://localhost:4173` and
  sets `reporter: process.env.CI ? 'github' : 'list'` — GitHub-annotation output is
  already wired, nothing to add there.
- **Backend env requirements at boot** (`src/env.schema.ts`): `JWT_SECRET`,
  `JWT_EXPIRES`, `FOOTBALL_DATA_API_KEY`, `REDIS_URL` are required (non-optional);
  `GEMINI_API_KEY` is optional (app boots and every route but `/ask` works without it).
  `FRONTEND_ORIGIN` (CORS, `src/main.ts`) **defaults to `http://localhost:5173`** — this
  would silently block every browser request from a `vite preview` frontend at `:4173`
  unless overridden.
- **Frontend env:** `web/src/lib/env.ts` reads `BACKEND_URL` via `$env/dynamic/private`,
  which resolves from `process.env` under plain `vite preview` (not just `wrangler dev`)
  — confirmed by reading the fallback chain (`event.platform?.env?.BACKEND_URL ??
  env.BACKEND_URL`).
- **Readiness signal:** `GET /health?db=true` exists (`src/api/health/health.controller.ts`)
  and exercises the DB connection, not just "HTTP server is up" — usable as the backend
  readiness probe.
- **Nothing in CI touches `web/` or `e2e/` today.** The `checks` job installs and
  validates only the root (backend) package tree.

## Goal

Add a second job, `e2e`, to the existing `.github/workflows/ci.yml`, that runs the full
Playwright suite against a freshly built stack on every PR (same triggers as `checks`),
and is a required/blocking check. Add a README section explaining the e2e setup and how
to run it locally, mirroring what CI does.

## Non-goals

- No general frontend CI (no lint/typecheck/vitest job for `web/`). The `web/` tree has
  its own `typecheck`/`test` scripts already, but wiring those into CI is a separate
  concern from "run the e2e suite" — flagged as a candidate follow-up, not part of this
  ticket.
- No build-artifact sharing between the `checks` and `e2e` jobs (e.g. uploading the
  backend's `dist/` from `checks` for `e2e` to reuse). Each job is self-contained; the
  duplicated backend build costs under a minute and keeps the jobs independent, which is
  simpler to reason about and to rerun individually.
- No sharding/matrix parallelism for Playwright — 3 spec files, ~7 tests, single project
  worth of runtime does not justify the added complexity yet.
- No change to `e2e/playwright.config.ts`, `global-setup.ts`, `fixtures.ts`, or any test
  spec file — those already work, per PSG-33/34.
- No repo-code changes to make FOOTBALL_DATA_API_KEY/GEMINI_API_KEY real in CI — e2e
  specs never exercise the admin match-sync or `/ask` endpoints, so dummy values satisfy
  boot-time validation without needing real secrets.

## Design decisions

### D1 — Trigger and blocking behavior (confirmed by user via coordinator)

`e2e` runs on the same triggers as `checks` (`pull_request`, `push: main`), and is a
required status check — a failing `e2e` run blocks merge, same as a failing `checks` run.

**Consequence flagged for follow-up (not part of this PR's diff):** a workflow job can't
mark itself "required" — that's a branch-protection setting under the repo's GitHub
Settings → Branches (or via `gh api repos/.../branches/main/protection`). This PR adds
the job; someone with repo admin access needs to add `e2e` to the required-status-checks
list on `main`'s branch protection rule after this merges, the same way `checks` presumably
already is. **Flagged for the user to confirm/do — outside what a workflow YAML change
can accomplish.**

### D2 — Job ordering: `e2e` depends on `checks` (`needs: checks`)

Chosen default (not asked, since it's a reasonable engineering tradeoff, not a
product decision): `e2e` only starts after `checks` passes, rather than running in
parallel. Rationale: `e2e` is the heavier job (docker compose, two extra `npm ci`s,
browser install, two app builds, a live browser suite) — no reason to pay for that on a
PR that's already failing typecheck/lint/a unit test/the backend build. **Tradeoff
flagged:** this adds `checks`'s own duration to the time before `e2e` (and therefore
merge-readiness) completes, rather than running the two in parallel. If PR feedback
latency turns out to matter more than CI-minutes cost, dropping `needs: checks` is a
one-line change later.

### D3 — CORS/env wiring for a `vite preview` frontend talking to a `node dist/main` backend

Both apps run as real local servers in the `e2e` job (not mocked), so they need to agree
on ports and origins the same way a developer's local setup does:

| Var | Value in CI | Why |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/psg_inventory` | Matches `docker-compose.yml`'s defaults exactly — no `.env` file needed in CI at all; compose, Prisma, and the backend all read it from the job's real process env. |
| `REDIS_URL` | `redis://localhost:6379` | Same reasoning. |
| `JWT_SECRET` / `JWT_EXPIRES` | Literal dummy values (e.g. `e2e-ci-secret` / `1d`) | Required by `env.schema.ts`; never validated against anything external. |
| `FOOTBALL_DATA_API_KEY` | Literal dummy value | Required by `env.schema.ts` to boot; no e2e spec calls the admin sync endpoints that actually use it. |
| `GEMINI_API_KEY` | Left unset | Optional; app boots and every route except `/ask` works without it (per `.env.example`'s own comment). |
| `FRONTEND_ORIGIN` | `http://localhost:4173` | **Must be overridden from its `:5173` default** or the backend's CORS policy rejects every request from the `vite preview` origin. |
| `PORT` | `7777` | Backend's own default — set explicitly for clarity even though it matches `DEFAULT_PORT`. |
| `BACKEND_URL` | `http://localhost:7777` | Read by `web/src/lib/env.ts` via `$env/dynamic/private` at runtime — works under plain `vite preview`, confirmed by reading the fallback chain (no `wrangler dev` needed). |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:4173` | Matches `playwright.config.ts`'s own default — set explicitly rather than relying on the implicit default, so a future default change in that file doesn't silently desync CI. |

**Flagged as a picked default, not asked:** dummy secrets are inlined directly in the
workflow YAML rather than stored as GitHub Actions secrets, since none of them are
sensitive (never sent to a real external service, never reused outside this ephemeral
job). If that's wrong for this repo's security posture, moving them to
`secrets.*` is a small follow-up.

### D4 — Backend/frontend readiness: background process + curl retry loop, not sleep

Both apps are started in the background (`nohup ... &`) in one step and polled with a
bounded curl-retry loop in the next step, rather than a fixed `sleep N`. This is the
standard GitHub Actions "start a service, then wait for it" pattern — a background
process started with `&` in one step survives into later steps of the *same* job because
they share the same runner VM/shell environment.

- Backend readiness: poll `GET http://localhost:7777/health?db=true` (exercises the DB
  connection Prisma needs for the actual e2e specs, not just "HTTP is up").
- Frontend readiness: poll `GET http://localhost:4173/login` (an unauthenticated,
  always-200 route).
- Both loops: 30 attempts × 2s (60s budget) before failing the job with the relevant
  `*.log` file dumped to the job output for debugging.

**Flagged as a picked default:** the 60s-per-service budget and 15-minute whole-job
timeout (`timeout-minutes: 15`) are estimates, not measured — see D7.

### D5 — Playwright browser install, scoped and cached

Only the `authenticated`/`auth` projects in `playwright.config.ts` use
`devices['Desktop Chrome']` — no Firefox/WebKit project exists. `npx playwright install
--with-deps chromium` (scoped to chromium only, not the full browser matrix) keeps
install time down. The browser binaries themselves (not the `--with-deps` OS packages,
which apt still reinstalls every run — GitHub Actions doesn't cache apt state by default)
are cached via `actions/cache`, keyed on `runner.os` + a hash of `e2e/package-lock.json`
(so a Playwright version bump invalidates the cache automatically).

### D6 — Three separate `npm ci` calls, one `setup-node` cache

`e2e/` and `web/` are not npm workspaces of the root — each has its own lockfile. The job
runs `npm ci` at root, then `npm ci` in `web/`, then `npm ci` in `e2e/`. A single
`actions/setup-node` step covers all three via `cache-dependency-path` listing all three
lockfiles, rather than three separate cache steps.

### D7 — Timeout budget (picked default, flagged)

`timeout-minutes: 15` for the whole `e2e` job. Rough budget: 3× `npm ci` (cached, ~1-2min
total) + docker compose up --wait (~10-20s) + migrate/seed (~5-10s) + backend build
(~20-40s) + frontend build (~30-60s) + Playwright browser install (~10s cached / ~60s
cold) + the actual `playwright test` run (~7 tests, retries:1, ~30-90s) — realistically
5-8 minutes end to end. 15 minutes leaves headroom for a cold cache without masking a
genuinely hung process for hours (GitHub's own default job timeout is 360 minutes, which
is too permissive here). **Not a hard requirement from the ticket — adjust if CI runs
show this estimate is off.**

### D8 — Artifact upload on failure

On failure, upload `e2e/playwright-report/` and `e2e/test-results/` (both already in
`e2e/.gitignore`, so they exist only as build output) as a GitHub Actions artifact
(`actions/upload-artifact`, `if: failure()`, 7-day retention). This isn't named in the
ticket but is Playwright's own standard CI recipe and is the only way to see *why* an
e2e failure happened after the job's log output scrolls past — flagged as an addition
beyond the ticket's literal ask, low-risk, easy to drop if unwanted.

### D9 — Teardown

A final `if: always()` step runs `npm run local:db:destroy` (stop containers, remove
volumes). Not strictly required — the runner VM is destroyed after the job regardless —
but keeps the job symmetric with the rest of the repo's own `local:db:*` script pattern
and avoids relying on implicit runner cleanup.

## Proposed `.github/workflows/ci.yml` addition

```yaml
  e2e:
    name: E2E
    runs-on: ubuntu-latest
    needs: checks
    timeout-minutes: 15
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/psg_inventory
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: e2e-ci-secret
      JWT_EXPIRES: 1d
      FOOTBALL_DATA_API_KEY: e2e-ci-dummy-key
      FRONTEND_ORIGIN: http://localhost:4173
      PORT: 7777
      BACKEND_URL: http://localhost:7777
      PLAYWRIGHT_BASE_URL: http://localhost:4173
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24.21.0
          cache: npm
          cache-dependency-path: |
            package-lock.json
            web/package-lock.json
            e2e/package-lock.json

      - run: npm ci
      - run: npm ci
        working-directory: web
      - run: npm ci
        working-directory: e2e

      - name: Typecheck e2e specs
        run: npm run typecheck
        working-directory: e2e

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('e2e/package-lock.json') }}

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
        working-directory: e2e

      - name: Start Postgres + Redis
        run: npm run local:db:up

      - run: npm run local:db:migrate
      - run: npm run local:db:seed:e2e

      - name: Build backend
        run: npm run build

      - name: Start backend
        run: nohup npm run start:prod > backend.log 2>&1 &

      - name: Wait for backend
        run: |
          for i in $(seq 1 30); do
            if curl -sf "http://localhost:7777/health?db=true" > /dev/null; then
              exit 0
            fi
            sleep 2
          done
          echo "backend did not become ready in time"; cat backend.log; exit 1

      - name: Build frontend
        run: npm run build
        working-directory: web

      - name: Start frontend preview
        run: nohup npm run preview > preview.log 2>&1 &
        working-directory: web

      - name: Wait for frontend
        run: |
          for i in $(seq 1 30); do
            if curl -sf "http://localhost:4173/login" > /dev/null; then
              exit 0
            fi
            sleep 2
          done
          echo "frontend did not become ready in time"; cat web/preview.log; exit 1

      - name: Run Playwright tests
        run: npm test
        working-directory: e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            e2e/playwright-report
            e2e/test-results
          retention-days: 7

      - name: Tear down containers
        if: always()
        run: npm run local:db:destroy
```

## README section (Task 7)

Add a new `## E2E Tests` section (after the existing `## Tests` unit-test section),
covering:

1. What the suite covers (login, sale CRUD, season-pass CRUD) and where it lives
   (`e2e/`, own `package.json`).
2. How to run it locally — the exact sequence a developer needs, mirroring the CI job:
   ```bash
   npm run local:db:up
   npm run local:db:migrate
   npm run local:db:seed:e2e
   npm run build && npm run start:prod &   # backend, in the background

   cd web && npm run build && npm run preview &   # frontend, in the background
   cd ..

   cd e2e && npm install && npx playwright install --with-deps chromium && npm test
   ```
   With a note that `FRONTEND_ORIGIN=http://localhost:4173` must be set (or exported)
   before starting the backend, since its CORS default is `:5173`, not the preview
   port — the single most likely local footgun this design surfaces.
3. What CI does differently from nothing — i.e. a one-line pointer: "CI runs this same
   sequence automatically on every PR as the required `e2e` check (see
   `.github/workflows/ci.yml`)."
4. Where to look on failure: `e2e/playwright-report/` locally, or the uploaded
   `playwright-report` artifact on a failed CI run.

## Open decisions — summary for the user

**Confirmed (via coordinator, before this doc was written):**
1. `e2e` job runs on every PR (same triggers as `checks`).
2. `e2e` job is a required/blocking check.

**Picked as reasonable defaults and flagged here, not asked (per coordinator's
instruction) — revisit if any of these are wrong:**
3. `e2e` job runs after `checks` (`needs: checks`), trading PR feedback latency for
   CI-minutes savings on already-broken PRs (D2).
4. Dummy `JWT_SECRET`/`FOOTBALL_DATA_API_KEY` values are inlined in the workflow YAML,
   not stored as GitHub Actions secrets (D3).
5. 15-minute job timeout and 60-second-per-service readiness budget are estimates, not
   measured against a real CI run yet (D4, D7).
6. Playwright-report/test-results are uploaded as a build artifact on failure — not
   named in the ticket, added for debuggability (D8).
7. **Making the new check "required" needs a manual branch-protection change in GitHub
   repo settings after this PR merges — a workflow YAML cannot do this itself** (D1).
   This is the one item that needs a human with repo admin access, not just code review.
