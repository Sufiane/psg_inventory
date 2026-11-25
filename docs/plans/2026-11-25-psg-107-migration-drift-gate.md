# PSG-107 migration drift gate Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** CI fails when `src/prisma/schema.prisma` and the migration history disagree.

**Spec:** `docs/specs/2026-11-25-psg-107-migration-drift-gate-design.md`

**Size / split:** one PR, ~70 lines, CI only. Single ticket, no split. Branch `psg-107` (rename if Conductor named it otherwise, before first push). Conventional commits; stage, do not commit before the user runs `/crit`.

**Architecture:** new `schema-drift` job in `.github/workflows/ci.yml` with a `postgres:16.4` service container: migrate, create shadow DB, run two `prisma migrate diff --exit-code` steps. Prisma is 6.0.1, so flags are `--to-schema-datamodel` (not `--to-schema`).

---

### Task 1: Prove the commands detect drift locally (the "test")

**Files:** none committed (scratch edit to `src/prisma/schema.prisma`, reverted).

- [ ] Start throwaway Postgres on a free port:
  `docker run -d --rm --name psg107-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=psg_inventory -p 54107:5432 postgres:16.4`
- [ ] Export env and prepare DBs:
  ```
  export DATABASE_URL=postgresql://postgres:postgres@localhost:54107/psg_inventory
  export SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:54107/psg_shadow
  npx prisma migrate deploy
  docker exec psg107-pg psql -U postgres -c 'CREATE DATABASE psg_shadow'
  ```
- [ ] Clean baseline, expect exit 0 for both:
  ```
  npx prisma migrate diff --exit-code --from-url "$DATABASE_URL" --to-schema-datamodel src/prisma/schema.prisma; echo $?
  npx prisma migrate diff --exit-code --from-migrations src/prisma/migrations --shadow-database-url "$SHADOW_DATABASE_URL" --to-schema-datamodel src/prisma/schema.prisma; echo $?
  ```
  If either is non-zero, main is already drifted: stop, report the diff to the coordinator (new ticket, do not fix here).
- [ ] Add a scratch field to any model in `schema.prisma` (e.g. `driftProbe String?` on `Users`), rerun both commands, expect exit 2 and a printed diff each. Record the output.
- [ ] `git checkout src/prisma/schema.prisma`; `docker rm -f psg107-pg`. Confirm `git status` shows no schema change.

### Task 2: Add the `schema-drift` job

**Files:** modify `.github/workflows/ci.yml` (insert between `checks` and `e2e`; do not touch existing jobs).

- [ ] Add:
```yaml
  schema-drift:
    name: Schema drift
    runs-on: ubuntu-latest
    timeout-minutes: 10
    services:
      postgres:
        image: postgres:16.4
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: psg_inventory
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/psg_inventory
      SHADOW_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/psg_shadow
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24.21.0
          cache: npm
          cache-dependency-path: package-lock.json

      - run: npm ci

      - name: Apply migrations to the CI database
        run: npx prisma migrate deploy

      - name: Create the shadow database
        run: psql "postgresql://postgres:postgres@localhost:5432/postgres" -c 'CREATE DATABASE psg_shadow'

      - name: Schema matches the migrated database
        run: npx prisma migrate diff --exit-code --from-url "$DATABASE_URL" --to-schema-datamodel src/prisma/schema.prisma

      - name: Schema matches the migration history
        run: >-
          npx prisma migrate diff --exit-code
          --from-migrations src/prisma/migrations
          --shadow-database-url "$SHADOW_DATABASE_URL"
          --to-schema-datamodel src/prisma/schema.prisma
```
- [ ] Validate YAML: `npx --yes yaml-lint .github/workflows/ci.yml` (or `python3 -I -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'))"`). Run `actionlint` if installed.
- [ ] Stage: `git add .github/workflows/ci.yml docs/specs/2026-11-25-psg-107-migration-drift-gate-design.md docs/plans/2026-11-25-psg-107-migration-drift-gate.md`. Suggested message: `ci: add prisma migration drift gate (PSG-107)`. Do not commit; tell the user to run `/crit`.

### Task 3: Verify in CI (after the user pushes)

- [ ] On the PR, the `Schema drift` job is green with both diff steps passing.
- [ ] Optional: paste Task 1 drift-detected output into the PR body as proof the gate fails.
- [ ] PR body: no PR-number refs; mention that the job is not required until added to branch protection (user action).
