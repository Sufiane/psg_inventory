# PSG-35: E2E CI Integration + README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required, blocking `e2e` job to `.github/workflows/ci.yml` that spins up
the local stack, migrates, seeds, builds+starts the backend, builds+previews the
frontend, then runs the Playwright suite on every PR — plus a README section documenting
the setup and how to run it locally.

**Architecture:** One new GitHub Actions job (`e2e`) added to the existing single-file
workflow, sequenced after the current `checks` job. One new README section
(`## E2E Tests`). No application code changes — `src/`, `web/src/`, and `e2e/tests/` are
untouched.

**Tech Stack:** GitHub Actions (`ubuntu-latest`), Docker Compose (Postgres 16.4 + Redis
7.4, already defined), Prisma migrate, `tsx` seed scripts, NestJS (`node dist/main`),
SvelteKit (`vite preview`), Playwright `@playwright/test` 1.49.1 (chromium only).

**Spec:** `docs/specs/2026-09-26-psg-35-e2e-ci-integration-design.md`. Read D1-D9 before
Task 1 — D3's env-var table and D4's readiness-probe reasoning are load-bearing for
every step below; don't improvise different values.

## Global Constraints

- No changes to `src/`, `web/src/`, `e2e/tests/`, `e2e/fixtures.ts`,
  `e2e/global-setup.ts`, or `e2e/playwright.config.ts` — this ticket is CI config + docs
  only (spec Non-goals).
- `e2e` job triggers match `checks` exactly: `pull_request` and `push: [main]` (spec D1).
- `e2e` job runs after `checks` via `needs: checks` (spec D2).
- Env vars for the `e2e` job are exactly the table in spec D3 — do not invent different
  values, ports, or var names.
- Readiness probes are `GET http://localhost:7777/health?db=true` (backend) and
  `GET http://localhost:4173/login` (frontend), 30 attempts × 2s each (spec D4).
- Playwright: chromium only (`npx playwright install --with-deps chromium`), browser
  binaries cached via `actions/cache` keyed on `hashFiles('e2e/package-lock.json')`
  (spec D5).
- `timeout-minutes: 15` on the `e2e` job (spec D7) — an estimate, not a hard number from
  the ticket; leave as-is unless real CI runs prove it wrong.
- On failure, upload `e2e/playwright-report/` and `e2e/test-results/` as a build artifact
  (spec D8).
- Final `if: always()` step tears down containers via `npm run local:db:destroy` (spec
  D9).
- Making the new check "required" in branch protection is a manual, out-of-band GitHub
  Settings action — no task below does this, since a workflow YAML change cannot
  configure branch protection (spec D1's flagged consequence). Task 3 calls this out
  explicitly as the final manual step.

---

## File Structure

**Modified:**

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Add a new `e2e` job alongside the existing `checks` job |
| `README.md` | Add a new `## E2E Tests` section after the existing `## Tests` section |

**Created:** none (this plan produces no new files).

---

## Task 1 — Add the `e2e` job to `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run local:db:up`, `local:db:migrate`, `local:db:seed:e2e`, `build`,
  `start:prod` (root `package.json`, already exist, unmodified); `build`, `preview`
  (`web/package.json`, already exist, unmodified); `test`, `typecheck`
  (`e2e/package.json`, already exist, unmodified); `GET /health?db=true`
  (`src/api/health/health.controller.ts`, already exists, unmodified).
- Produces: a passing/failing `e2e` GitHub Actions job that Task 3 observes on a real
  PR. Nothing in Task 2 depends on this job's internals beyond the same env vars and
  command sequence (kept identical on purpose, see Task 2).

- [ ] **Step 1: Add the `e2e` job**

Open `.github/workflows/ci.yml`. The current file is:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24.21.0
          cache: npm

      - run: npm ci

      - run: npm run typecheck

      - run: npm run lint

      - run: npm run lint:deps

      - run: npm test

      - run: npm run build

      # The build can exit 0 while emitting nothing (stale .tsbuildinfo), and a
      # wrong rootDir silently relocates output to dist/src/, which breaks the
      # `node dist/main` start command at deploy time only.
      - name: Verify the build emitted a runnable entrypoint
        run: test -f dist/main.js
```

Append a new `e2e` job under `jobs:`, as a sibling of `checks` (same 2-space indent), so
the full file becomes:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24.21.0
          cache: npm

      - run: npm ci

      - run: npm run typecheck

      - run: npm run lint

      - run: npm run lint:deps

      - run: npm test

      - run: npm run build

      # The build can exit 0 while emitting nothing (stale .tsbuildinfo), and a
      # wrong rootDir silently relocates output to dist/src/, which breaks the
      # `node dist/main` start command at deploy time only.
      - name: Verify the build emitted a runnable entrypoint
        run: test -f dist/main.js

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

- [ ] **Step 2: Validate the YAML parses**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK
```
Expected: `OK`. This only catches indentation/syntax errors (e.g. a job nested inside a
step by mistake) — it does not validate GitHub Actions' own schema (unknown keys, wrong
`uses:` action names). Schema-level and runtime validation happens for real on push, in
Task 3.

- [ ] **Step 3: Dry-run the same command sequence locally**

This is the closest thing to a "test" a CI config change gets before a real push. Run
the job's own command sequence, in order, directly in this workspace, to catch wiring
bugs (wrong script name, wrong port, wrong env var) before spending a CI run on them.
Skip the two `npm ci`/browser-install steps if this workspace's `node_modules` and
Playwright browsers are already present and up to date — the point is to exercise the
runtime sequence (env vars, ports, readiness probes, the actual test run), not to
re-verify `npm ci` itself.

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/psg_inventory
export REDIS_URL=redis://localhost:6379
export JWT_SECRET=e2e-ci-secret
export JWT_EXPIRES=1d
export FOOTBALL_DATA_API_KEY=e2e-ci-dummy-key
export FRONTEND_ORIGIN=http://localhost:4173
export PORT=7777
export BACKEND_URL=http://localhost:7777
export PLAYWRIGHT_BASE_URL=http://localhost:4173

npm run local:db:up
npm run local:db:migrate
npm run local:db:seed:e2e

npm run build
nohup npm run start:prod > backend.log 2>&1 &

for i in $(seq 1 30); do
  curl -sf "http://localhost:7777/health?db=true" > /dev/null && break
  sleep 2
done
curl -sf "http://localhost:7777/health?db=true" > /dev/null && echo "backend up" || (cat backend.log && exit 1)

(cd web && npm run build)
(cd web && nohup npm run preview > preview.log 2>&1 &)

for i in $(seq 1 30); do
  curl -sf "http://localhost:4173/login" > /dev/null && break
  sleep 2
done
curl -sf "http://localhost:4173/login" > /dev/null && echo "frontend up" || (cat web/preview.log && exit 1)

(cd e2e && npm test)
```

Expected: `backend up`, `frontend up`, and all Playwright tests pass (3 spec files,
~7 tests). If a step fails, fix the workflow YAML (Step 1) to match what actually works
here — the workflow must match this sequence exactly, since Task 3's real CI run repeats
it verbatim.

- [ ] **Step 4: Clean up the local dry run**

```bash
pkill -f "node dist/main" || true
pkill -f "vite preview" || true
npm run local:db:destroy
rm -f backend.log web/preview.log
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(e2e): add required e2e job (PSG-35)"
```

**Done when:** the YAML parses (Step 2), the local dry run (Step 3) passes end to end,
and the workflow file is committed.

---

## Task 2 — Add the `## E2E Tests` README section

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the exact command sequence validated in Task 1 Step 3 (kept byte-for-byte
  consistent — a README that drifts from what CI actually runs is worse than no README
  section).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Insert the new section**

`README.md`'s existing `## Tests` section (unit tests) ends right before `## API
Overview`:

```markdown
## Tests

```bash
npm run test          # unit tests
npm run test:cov      # with coverage report
```

## API Overview
```

Insert a new `## E2E Tests` section between them, so the file reads:

```markdown
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

# 3. Frontend, built and previewed in the background (needs BACKEND_URL at runtime)
cd web
npm install
npm run build
BACKEND_URL=http://localhost:7777 npm run preview &
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
```

- [ ] **Step 2: Review against Task 1's dry run**

Re-read the command sequence just inserted against Task 1 Step 3's actual dry-run
commands. Every env var name, script name, and port must match exactly — this is a
manual side-by-side check, not a tool run (there's no automated way to verify prose
matches a CI job's behavior).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add E2E Tests section to README (PSG-35)"
```

**Done when:** `README.md` has the new section in place, between `## Tests` and `## API
Overview`, and its command sequence matches Task 1's validated dry run exactly.

---

## Task 3 — Push, open the PR, and confirm the real CI run

This is the verification Task 1's local dry run and Task 2's manual review can't fully
provide: GitHub Actions' own runner environment, real `actions/cache` behavior, and the
actual "required check" wiring. Hand this to `qa-verifier` if this environment can't
push/open a PR itself — don't skip it silently.

**Files:** none created or modified — this task runs and reads output only.

- [ ] **Step 1: Push the branch and open (or update) the PR**

```bash
git push -u origin HEAD
```

If a PR doesn't already exist for this branch, open one (`gh pr create` or the GitHub
UI). Confirm the PR's Checks tab shows both `checks` and `E2E` as pending/running jobs
from `.github/workflows/ci.yml`.

- [ ] **Step 2: Wait for the `E2E` job and read its result**

If it fails, read the failing step's log first — the two most likely failure classes are
(a) a readiness probe timing out (check the dumped `backend.log`/`preview.log` in that
step's output — likely a missing/misnamed env var from Task 1's table) or (b) a
Playwright assertion failing for real (check the uploaded `playwright-report` artifact).
Do not adjust retry counts or timeouts to paper over a genuine failure — fix the
underlying wiring or defer to the same debugging process PSG-33/34's specs used.

- [ ] **Step 3: Confirm `checks` and `E2E` both went green, then flag the manual follow-up**

Once both jobs pass: this PR's diff is complete, but D1's required-check behavior needs
one manual, out-of-band step that no commit in this repo can perform — a repo admin
must add `E2E` to `main`'s branch protection required-status-checks list (GitHub
Settings → Branches → branch protection rule for `main`, or
`gh api repos/<org>/<repo>/branches/main/protection` for the same change via CLI). Note
this explicitly when reporting this task done — it is the one open item from the spec
that isn't satisfied by merging this PR.

**Done when:** the PR shows both `checks` and `E2E` passing, and the required-status-check
follow-up has been called out to whoever merges this PR.

---

## Self-Review (plan vs spec)

1. **Spec coverage:** D1 (triggers + required check) → Task 1's `on:`/job triggers match
   `checks` exactly (no separate `on:` block — same workflow file); the required-check
   *branch-protection* half is explicitly called out as a non-code manual step in Task 3
   Step 3, matching the spec's own flag. D2 (`needs: checks`) → present in the job YAML.
   D3 (env vars) → the exact table, reused verbatim in Task 1's YAML, Task 1's dry run,
   and Task 2's README snippet. D4 (readiness probes) → both wait-loops present,
   identical between the workflow YAML and the dry run. D5 (Playwright browsers, cached,
   chromium-only) → present. D6 (three `npm ci`s, one cache step) → present. D7 (timeout)
   → `timeout-minutes: 15` present. D8 (artifact upload on failure) → present, `if:
   failure()`. D9 (teardown) → present, `if: always()`. README section (Task 7) → Task 2,
   covers what/where/how-to-run/what-CI-does/where-to-look-on-failure per the spec's
   README design section.
2. **Placeholder scan:** no TBD/TODO; every step has literal YAML, literal shell, or
   literal markdown. Task 3 intentionally does not hardcode `gh pr create`'s exact flags
   since PR title/body conventions belong to the repo's own git-workflow habits, not this
   plan.
3. **Type/name consistency:** env var names (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
   `JWT_EXPIRES`, `FOOTBALL_DATA_API_KEY`, `FRONTEND_ORIGIN`, `PORT`, `BACKEND_URL`,
   `PLAYWRIGHT_BASE_URL`) are identical across Task 1's workflow YAML, Task 1's dry-run
   Step 3, and Task 2's README snippet — checked side by side while writing this plan.
   Script names (`local:db:up`, `local:db:migrate`, `local:db:seed:e2e`, `build`,
   `start:prod` at root; `build`, `preview` in `web/`; `test`, `typecheck` in `e2e/`) match
   the actual `package.json` scripts read during exploration, not invented names.
