# PSG-102 sale_histories.profit to Float: implementation plan

Spec: `docs/specs/2026-11-24-psg-102-sale-histories-profit-float-design.md`.

Size: ~140 lines, single PR, under the 800 cap. Backend/schema only, no web work, nothing to
parallelise with a frontend builder. No ticket split. Follow-ups to file separately: CI
migration drift gate; integer-cents profit (only if product wants it).

Conventions: explicit return types, no inline `if`, no single-letter names, `describe('when
...')` nesting, no comments by default, exact dep pinning (no new deps expected), numeric
separators on literals of 5+ digits. Commits: `test(sales): characterise sale_histories
profit rounding (PSG-102)` then `fix(sales): store sale history profit as float (PSG-102)`.
Pull main first and confirm no newer migration than `20260911120100_...` exists.

Prerequisite: Docker daemon running (OrbStack was down while planning).

## Task 0: throwaway Postgres

```
docker run --rm -d --name psg102-drift -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16.4
export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres
npx prisma migrate deploy
```

Never use the workspace `.env` DB for this. Remove the container at the end of Task 5.

## Task 1: integration test harness

Files: `vitest.integration.config.ts` (new), `package.json` (script `test:integration`:
`vitest run --config vitest.integration.config.ts`).

1. Copy `vitest.config.ts` plugins/alias/setup, change `include` to
   `['src/**/*.int-spec.ts']`. Confirm default `npm test` ignores `.int-spec.ts`.
2. Check `tsconfig`/`tsconfig.build.json` exclude so `.int-spec.ts` is not built into
   `dist` (same treatment as `.spec.ts`; assert `test -f dist/main.js` after `npm run
   build`, and that `dist/` has no int-spec output).

## Task 2: characterisation specs (red)

Files: `src/api/sales/usecases/update-sale/update-sale.usecase.db.int-spec.ts`,
`src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.int-spec.ts`.

1. Build a real `PrismaService` (as in the db specs, but not mocked), a stub
   `RedisService` (`mockDeep`, only invalidation calls), and the real usecase db.
2. Fixture helper in each spec (or one shared `src/test/` helper if both need it; no
   barrel): create user, match, sale with `listedPrice: 501`, `profit: 440.88`. Use unique
   ids per test and delete created rows in `afterEach` (history, gift, sale, then
   user/match) so reruns are clean.
3. update-sale: describe `when the sale has a fractional profit` -> it `snapshots the exact
   profit into history`: call the update write, read `saleHistories` by `saleId`, expect
   `profit` toBe 440.88.
4. ungift-sale: same, with a GIFTED sale plus gift row; describe `when the gifted sale has
   a fractional profit`.
5. Run `npm run test:integration` against the Task 0 DB. Expected: red. Record in the
   commit message and ticket whether it threw (message text) or stored 441. Answers spec
   Q1. Commit the test (first commit).

## Task 3: migration and schema (green)

Files: `src/prisma/schema.prisma`, new
`src/prisma/migrations/20261124120000_sale_histories_profit_float/migration.sql`.

1. In `SaleHistories`, change `profit Int` to `profit Float`.
2. Write `migration.sql`:
   ```sql
   -- AlterTable
   ALTER TABLE "sale_histories" ALTER COLUMN "profit" SET DATA TYPE DOUBLE PRECISION;
   ```
   (The leading `-- AlterTable` is Prisma's generated header; keep it so the file matches
   generator output. It is not a code comment in the project sense.)
3. `npx prisma generate`, `npx prisma migrate deploy` on the throwaway DB.
4. `npm run test:integration`: green. Commit schema + migration (second commit).

## Task 4: drift check

On the throwaway DB, after Task 3:

1. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel src/prisma/schema.prisma --exit-code` -> exit 0.
2. `docker exec psg102-drift createdb -U postgres shadow`, then
   `npx prisma migrate diff --from-migrations src/prisma/migrations --to-schema-datamodel src/prisma/schema.prisma --shadow-database-url postgresql://postgres:postgres@localhost:55432/shadow --exit-code` -> exit 0.
3. Confirm flags with `npx prisma migrate diff --help` first (Prisma 6.0.1). Paste the
   exit codes into the PR description.

If either exits 2, the migration SQL differs from what Prisma wants: regenerate with
`prisma migrate diff --from-migrations ... --to-schema-datamodel ... --script` and adopt
its output.

## Task 5: CI wiring and cleanup

Files: `.github/workflows/ci.yml`.

1. In the E2E job, after `npm run local:db:migrate` and before seeding, add step
   `npm run test:integration` (DB env is already set for that job; verify the env var name
   the job exports). Seeding after the test avoids polluting e2e data; the spec cleans up
   its own rows anyway.
2. `docker rm -f psg102-drift`.
3. If `docs/tech-debt.md` lists this finding, remove or close it; do not add a "new" entry.
   File Linear follow-ups (PSG-* issues, assignee me): CI drift gate; integer-cents
   profit (only if wanted).

## Task 6: verify (handoff to qa-verifier)

- `npm test` (unit) green, `npm run lint`, `npm run build` then `test -f dist/main.js`.
- `npm run test:integration` green on a fresh migrated DB, and red if Task 3 is reverted.
- Both drift commands exit 0.
- E2E job green in CI.

Stage and stop; user runs `/crit` before commit approval.
