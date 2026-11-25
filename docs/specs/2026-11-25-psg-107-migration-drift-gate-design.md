# PSG-107: Prisma migration drift gate in CI

Status: proposed. Size: S (~70 lines, one layer: CI). Origin: found during PSG-102, which ran
the two diffs by hand against a throwaway Postgres.

## 1. Problem

Nothing in CI checks that `src/prisma/schema.prisma` matches the migration history. A schema
edit without a migration (or a hand-edited migration that diverges) passes CI and only
surfaces at deploy or in the next `prisma migrate dev`.

## 2. Findings

| Item | Fact |
|---|---|
| Workflow | `.github/workflows/ci.yml`: `checks` job (typecheck, lint, unit, build) and `e2e` job (`needs: checks`). |
| CI database | Only the `e2e` job has one: `npm run local:db:up` (docker compose, `postgres:16.4`), then `npm run local:db:migrate` (`prisma migrate deploy`). `DATABASE_URL` is a job-level env. |
| Prisma | `prisma` / `@prisma/client` pinned `6.0.1`. Schema path via `package.json#prisma.schema`. No `prisma.config.ts`. Datasource `url = env("DATABASE_URL")`. |
| Flag names | The ticket says `--to-schema`. Prisma 6.0.1 only has `--to-schema-datamodel` / `--from-schema-datamodel` (verified with `npx prisma@6.0.1 migrate diff --help`). `--to-schema` arrives with a later Prisma. Use the 6.0.1 names. |
| Exit codes | `--exit-code`: 0 no diff, 2 diff, 1 error. Any non-zero fails the step. |
| Shadow DB | `--from-migrations` needs `--shadow-database-url` pointing at an empty, separate database the role may create/drop in. `postgres` superuser on a service container satisfies that. |
| Tech debt | `docs/tech-debt.md` has no entry on drift or Prisma CI. Nothing to reconcile. |

## 3. Decisions

1. **New dedicated job `schema-drift`, not steps in `e2e`.** Runs in parallel with `checks`,
   fails in about a minute instead of after Playwright setup, needs no Redis/Playwright/web
   install. Cost: a second Postgres provisioning (~15 lines). Alternative (two steps in `e2e`
   after `local:db:migrate`) is cheaper in YAML but fails late, behind the `checks` gate and
   `e2e` install time, and couples a schema check to the e2e job. Rejected.
2. **Postgres as a GitHub `services:` container, `postgres:16.4`** (same version as
   `docker-compose.yml`). Not docker compose: the job needs no Redis and a service container
   has native health gating.
3. **Database setup:** service creates `psg_inventory`; a step runs `prisma migrate deploy`
   against it; a step creates empty `psg_shadow` on the same server via `psql`.
4. **Two diff steps, separate, so a failure names which comparison drifted:**
   - `prisma migrate diff --exit-code --from-url "$DATABASE_URL" --to-schema-datamodel src/prisma/schema.prisma`
   - `prisma migrate diff --exit-code --from-migrations src/prisma/migrations --shadow-database-url "$SHADOW_DATABASE_URL" --to-schema-datamodel src/prisma/schema.prisma`
5. **Install:** root `npm ci` only (web not needed). Run prisma via `npx prisma` from the
   locked devDependency, no extra pins.
6. **Prove the gate fails: one-time local proof, not a permanent CI self-test.** Plan task
   adds a scratch column to `schema.prisma` without a migration, runs both commands against
   a local throwaway Postgres, expects exit 2, reverts. Result is pasted in the PR body. A
   permanent negative test in CI would need a second schema fixture and buys little.
7. **No change to application code, no new npm script.** Commands live inline in the workflow.
8. **Branch protection:** adding the job does not make it required. Making `schema-drift` a
   required status check is a repo-settings action for the user, listed as an open question.

## 4. Out of scope

- Upgrading Prisma to get `--to-schema` (separate ticket if wanted).
- Running the gate in the Railway deploy pipeline.
- Checking data migrations (backfills); the diff is schema-only.

## 5. Open questions

1. Make `schema-drift` a required check in branch protection? (Default: yes, user action.)
2. Accept new job (default) vs two steps inside `e2e`?
3. Accept `--to-schema-datamodel` (6.0.1 reality) over the ticket's `--to-schema`?

## 6. Size and split

One PR, about 70 lines: ~40 YAML, ~30 doc/PR text. No schema, backend or web changes. No split.
