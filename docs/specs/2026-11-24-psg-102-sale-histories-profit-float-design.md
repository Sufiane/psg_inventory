# PSG-102 sale_histories.profit Int vs Sales.profit Float: design

Found during PSG-98 planning (`docs/specs/2026-11-22-psg-98-whole-euro-sale-prices-design.md`,
section 6). Nothing here was run against a live database: the Docker daemon (OrbStack) was
not running when this spec was written. Every behavioural claim below is marked verified
(read from code or CI) or unverified.

## 1. Is the mismatch real

Yes, the schema mismatch is real (verified):

| Model / column | Type | Migration |
|---|---|---|
| `Sales.profit` | `Float` -> `DOUBLE PRECISION` | `20241209211933_init`, line 55 |
| `SaleHistories.profit` | `Int` -> `INTEGER` | `20241209211933_init`, line 68 |

No later migration touches either column. `computeProfit` is `price * 88 / 100`, so stored
profit is fractional for most prices (33 -> 29.04, 501 -> 440.88).

Two write paths copy the live sale's profit into the history row, both unconditionally
(verified):

- `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts` (end of the write helper,
  `tx.saleHistories.create({ ... profit: currentSale.profit ... })`)
- `src/api/sales/usecases/ungift-sale/ungift-sale.usecase.db.ts` (same shape, inside the
  `$transaction`)

`saleHistories` is otherwise only deleted (`delete-sale.usecase.db.ts`,
`sales-import.db.ts`). Nothing reads history rows. So there is no read-side consumer to
change.

## 2. Is the ticket's predicted symptom ("fails at Prisma") real

Doubtful. Evidence against a hard failure (verified):

- The e2e spec `e2e/tests/sale.e2e-spec.ts` creates a sale at price 501 (profit 440.88),
  opens the edit drawer, marks it SOLD and saves. That goes through `update-sale` and
  writes a history row with `profit: 440.88`.
- CI on `main` is green including the E2E job (latest completed runs, 2026-11-24).

If Prisma rejected a non-integer for an `Int` field, that test would be red. Either Prisma
6.0.1 / Postgres coerce the value, or the e2e path does not exercise what we think. The
most likely alternative to a crash is silent rounding: `440.88` stored as `441`. That is
worse than a loud failure: the audit trail is quietly wrong, with no error anywhere.

Therefore the ticket's step 1 (characterisation test) is not a formality. It decides the
accurate description of the bug: "update/ungift 500s" vs "history snapshots are rounded".
Both are fixed by the same migration, so the fix is not blocked on the outcome; only the
ticket text and the commit message depend on it.

## 3. Scope

In scope:

1. A characterisation test that runs against a real Postgres and observes what actually
   lands in `sale_histories.profit` for a fractional profit.
2. Migration `sale_histories.profit` -> `DOUBLE PRECISION`, plus `schema.prisma` change.
3. Drift check proving `schema.prisma` and the migration history agree.

Out of scope (not absorbed):

- Moving profit to integer cents or `Decimal`. That is the real fix for float drift in
  `computeProfit` (also noted in PSG-98 spec); separate, bigger ticket. Recommend
  filing it only if the product wants cent-exact accounting.
- Repairing already-rounded history rows. The `INTEGER` -> `DOUBLE PRECISION` widening is
  lossless for what is stored, but the discarded fractions cannot be recovered. History
  has no read consumer, so I recommend leaving old rows as they are (open question Q2).
- PSG-98 (whole-euro prices). It does not remove the bug: 88 % of a whole euro is still
  fractional (33 -> 29.04).

## 4. Other Int/Float mismatches

Checked all of `src/prisma/schema.prisma` (verified). Only one `Float` column exists in
the whole schema (`Sales.profit`). The other money columns are `Int` on both sides where
they are paired:

| Pair | Sales | SaleHistories |
|---|---|---|
| `listed_price` | `Int` | `Int` |
| `profit` | `Float` | `Int` (the bug) |
| `invest` | `Int` | not snapshotted |
| `nb_tickets` | `Int` | not snapshotted |

`Matches`, `SeasonPasses`, `SalePassAllocations`, `Gifts`, `Recipients` hold no float
money. No other mismatch.

Side note, not a mismatch: history does not snapshot `invest`, so a restored state cannot
reproduce net. Not this ticket.

## 5. Migration

New directory `src/prisma/migrations/20261124120000_sale_histories_profit_float/` with
`migration.sql`:

```sql
-- AlterTable
ALTER TABLE "sale_histories" ALTER COLUMN "profit" SET DATA TYPE DOUBLE PRECISION;
```

This is the exact statement Prisma emits for `Int` -> `Float`, so the drift check should
produce an empty diff. Schema change:

```prisma
model SaleHistories {
  ...
  profit      Float
```

Properties: widening int4 -> float8 is lossless for existing values; Postgres rewrites the
table (small table, ACCESS EXCLUSIVE lock for the rewrite, acceptable); no default, no
`NOT NULL` change; no data migration needed; no rollback script (Prisma convention here),
but narrowing back would be lossy so none is offered.

Timestamp must sort after the latest migration `20260911120100_add_recipients_and_gifts`.
Re-check at implementation time that no newer migration landed on `main` (pull main first).

## 6. Characterisation test

Constraint (verified): all existing backend specs are Vitest unit specs with
`vitest-mock-extended` Prisma mocks (`src/**/*.spec.ts`, `vitest.config.ts`). A mock does
not validate column types, so a mocked spec cannot observe the bug. It needs a real
Postgres. The e2e Playwright suite has a real DB, but it only sees the UI and no endpoint
exposes history rows, so it cannot assert the stored value.

Recommended: a small DB-level integration spec.

- File: `src/api/sales/usecases/update-sale/update-sale.usecase.db.int-spec.ts` (and one
  for ungift), suffix `.int-spec.ts` so the default `vitest run` (`include: src/**/*.spec.ts`)
  does not pick it up.
- Config: new `vitest.integration.config.ts` (same plugins and aliases as
  `vitest.config.ts`, `include: ['src/**/*.int-spec.ts']`), script `test:integration`.
- It uses a real `PrismaService` against `DATABASE_URL`, creates its own user, match and
  sale rows, calls the real usecase db (`RedisService` stubbed, Redis is irrelevant),
  then reads `sale_histories` directly with Prisma.
- Assertion is the desired behaviour: history `profit` equals the sale's fractional profit
  exactly (e.g. 440.88). Before the migration it is red, either by throwing or by getting
  `441`; after, green. Running it before the migration is the characterisation: the
  failure message is recorded in the PR description and the ticket.
- CI: run it in the existing E2E job after `npm run local:db:migrate`, which already has
  Postgres up. One added step, no new service.

Cheaper alternative considered and rejected: assert only in the e2e suite. It passes today
(see section 2), so it proves nothing, and cannot read history.

Alternative for later (not recommended now): Testcontainers. It adds a dependency and a
Docker requirement to the default test run for one spec; the compose stack already exists.

## 7. Drift-check procedure

Run against a throwaway Postgres on a non-default port, never the workspace `.env` DB
(README: any `prisma migrate` acts on the active `DATABASE_URL`).

```
docker run --rm -d --name psg102-drift -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 postgres:16.4
export DRIFT_URL=postgresql://postgres:postgres@localhost:55432/postgres
```

1. Characterise (before migration): `DATABASE_URL=$DRIFT_URL npx prisma migrate deploy`,
   then `DATABASE_URL=$DRIFT_URL npm run test:integration`. Expect red. Record how.
2. Apply migration and schema change, then repeat step 1's two commands. Expect green.
3. Migrations vs schema, both ways:
   - `npx prisma migrate diff --from-url "$DRIFT_URL" --to-schema-datamodel src/prisma/schema.prisma --exit-code` (after `migrate deploy`): exit 0 = no drift.
   - `npx prisma migrate diff --from-migrations src/prisma/migrations --to-schema-datamodel src/prisma/schema.prisma --shadow-database-url "$DRIFT_URL" --exit-code`: exit 0 = migration history equals schema. The shadow URL must point at an empty scratch database, so create one first (`createdb` via `docker exec psg102-drift createdb -U postgres shadow` and use `.../shadow`).
4. `docker rm -f psg102-drift`.

`prisma migrate diff` flags confirmed against Prisma 6.0.1 docs knowledge but must be
re-confirmed with `npx prisma migrate diff --help` at implementation time. There is no
drift gate in CI today (`.github/workflows/ci.yml` only runs `migrate deploy`); adding one
is a worthwhile follow-up ticket, not part of this PR.

## 8. Layering / conventions

No service or db code changes: the usecase dbs already pass `currentSale.profit` (a
`number`). `SaleRowSnapshot.profit: number` is already correct for a Float column. The
integration spec lives beside the db it exercises. Specs follow the project `describe('when
...')` nesting; no comments by default; no new dependencies (Vitest, Prisma already
pinned), so no pinning work.

## 9. Size

About 140 lines: migration 3, schema 1, integration spec ~90 (two scenarios plus fixtures),
vitest integration config ~15, package script 1, CI step ~5, tech-debt/doc touch ~5. One
PR, one layer (schema + test infra, backend only), one actor-less change. Under the 800
cap; no ticket split. Follow-ups to file separately: CI drift gate, integer-cents profit
(only if wanted).

## 10. Open questions

Q1. What does Prisma actually do today (throw, or round to 441)? Answered by running the
spec before the migration. Needs a running Docker daemon; blocks only the wording of the
ticket and commit, not the fix.

Q2. Leave already-rounded history rows alone (recommended: nothing reads them)?

Q3. Accept an integration-test tier (`*.int-spec.ts` plus CI step) as the home for
real-DB specs, or prefer the lighter option of a one-off manual script for the
characterisation and no committed test? Recommended: commit the spec, it is the
regression guard for this class of bug (mocks cannot catch type mismatches).
