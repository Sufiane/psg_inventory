# Split the `DbModule` Barrel and Rename the Db Layer — Design

**Date:** 2026-09-16
**Status:** Approved
**Type:** Backend-only refactor. Net-zero at runtime.
**Unblocks (not implemented here):** colocated `*.usecase.db.ts` files under `src/api/`, per the usecase-layer convention in the user's global CLAUDE.md.

## Problem

Two independent problems in the same set of files.

### A — the `DbModule` barrel

`src/db/db.module.ts` provides and exports all eight db tokens. Eleven modules import it
wholesale: the nine under `src/api/`, `src/auth/auth.module.ts`, and
`src/crons/cancel-sales/cancel-sales.module.ts`.

Nothing is broken at runtime. The cost is architectural:

- `imports: [DbModule]` carries no signal. Reading `HealthModule` tells you it can reach
  the database; it does not tell you it reaches exactly one table's worth of it
  (`src/api/health/health.service.ts` injects only `IHealthDbService`).
- A service can start injecting an unrelated db token with no module edit, no review
  surface, and no dependency-cruiser error. The dependency appears in the constructor and
  nowhere else. That is silent drift.

### B — config/reality drift in the dep checker

`.dependency-cruiser.cjs`'s `no-orm-outside-db` comment claims it guards "`*.db.ts` files".
No file in the repo is named `*.db.ts`. The rule is in fact location-based
(`from.pathNot: ['^src/db/', …]`), and the db layer's files are named `*.service.ts` —
the same suffix as the api-layer files they are the counterpart of. The collision is not
theoretical: six api specs already work around it with aliased imports, e.g.

```ts
import { SalesService as SalesDbService } from '../../db/sales/sales.service';
```

Separately, the rule can never grow to cover a colocated `*.usecase.db.ts` under
`src/api/`, because its only notion of "the db layer" is a directory.

## Goal

Make every db dependency an explicit, reviewable module edge; rename the db layer to the
`*.db.ts` / `FooDb` convention; and teach the dependency rules to recognise the db layer
by filename as well as by location, so a later colocation step is a config no-op.

**No behaviour changes.** Every existing test must pass with only import-path and
identifier updates. No database migration. No dependency added or removed.

## Non-goals

- Moving db files out of `src/db/` into `src/api/`. Separate, later step.
- Introducing a `usecases/` layer or extracting any usecase.
- Touching `no-api-from-db`. It only becomes a problem under colocation, which is not here.
- Renaming the abstract tokens (`ISalesDbService` and friends). See D3.
- Enabling the eslint rules noted under "Out-of-scope observations".

## Baseline corrections

Three things the working brief got wrong, confirmed by reading the tree:

1. **`PrismaService` is in `DbModule.providers` but not in `exports`.** Nothing outside
   `src/db/` can inject it today. That is the correct baseline and this change preserves
   it — see D2 and D5.
2. **The db dependency is not one-to-one.** Four of the eleven consumers need two to four
   db services. See the table in D1.
3. **A filename-only `no-orm-outside-db` would break eleven files.** See D4.

## Decisions

### D1 — One db module per db *service*, composed by consumers

Eight new Nest modules, one per db service, each owning exactly one token:

```ts
// src/db/sales/sales.db.module.ts
@Module({
    imports: [PrismaModule, RecipientsDbModule],
    providers: [{ provide: ISalesDbService, useClass: SalesDb }],
    exports: [ISalesDbService],
})
export class SalesDbModule {}
```

Rejected: one db module per *consumer* (a `SalesApiDbModule` bundling four tokens). That
re-creates barrels one level down, and duplicates the provider for a token across several
modules — which either yields several instances of the same db service or forces the
shared-module indirection anyway.

The derived dependency map, read off constructors rather than assumed:

| Consumer module | Db modules it imports |
|---|---|
| `src/api/accounting/accounting.module.ts` | `AccountingDbModule`, `SalesDbModule`, `SeasonPassesDbModule` |
| `src/api/admin/admin.module.ts` | `MatchesDbModule`, `UsersDbModule` |
| `src/api/health/health.module.ts` | `HealthDbModule` |
| `src/api/matches/matches.module.ts` | `MatchesDbModule` |
| `src/api/recipients/recipients.module.ts` | `RecipientsDbModule` |
| `src/api/sales-import/sales-import.module.ts` | `MatchesDbModule`, `SeasonPassesDbModule`, `SalesImportDbModule` |
| `src/api/sales/sales.module.ts` | `SalesDbModule`, `MatchesDbModule`, `SeasonPassesDbModule`, `RecipientsDbModule` |
| `src/api/season-passes/season-passes.module.ts` | `SeasonPassesDbModule` |
| `src/api/users/users.module.ts` | `UsersDbModule` |
| `src/auth/auth.module.ts` | `UsersDbModule` |
| `src/crons/cancel-sales/cancel-sales.module.ts` | `SalesDbModule` |

`src/api/ask/` correctly appears nowhere: it reaches data only through
`IAccountingService` and `IMatchesService`.

Two db services depend on another db service, so two db modules import a sibling:
`SalesDb` and `SalesImportDb` both inject `IRecipientsDbService`, so `SalesDbModule` and
`SalesImportDbModule` import `RecipientsDbModule`. `RecipientsDbModule` imports only
`PrismaModule`, so there is no cycle.

`RedisService` needs no import anywhere: `RedisModule` is already `@Global()`, and the
current `DbModule` does not import it either. Status quo preserved.

### D2 — `PrismaService` via a non-global `PrismaModule`

New `src/db/prisma.module.ts`:

```ts
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
```

Each of the eight db modules imports it. Because they all import the same module class,
Nest instantiates it once — one `PrismaService`, one connection pool. Net-zero at runtime.

Rejected alternatives:

- **`@Global()`.** It would make `PrismaService` injectable from any api service with zero
  import statement. That is precisely the invisible-availability failure this change
  exists to remove, and it breaks the baseline in correction 1 outright.
- **Re-registering `PrismaService` in each db module's own `providers`.** Eight
  `PrismaClient` instances, eight connection pools. A real runtime regression.

Under a non-global `PrismaModule`, an api module could still reach `PrismaService` by
adding `imports: [PrismaModule]` — a visible, reviewable line, exactly as it could add
`PrismaService` to its own `providers` today. D5 makes that mechanically enforced rather
than a convention living only in this document.

### D3 — Rename files and implementation classes; leave the tokens

| From | To |
|---|---|
| `src/db/<m>/<m>.service.ts` | `src/db/<m>/<m>.db.ts` |
| `src/db/<m>/<m>.service.spec.ts` | `src/db/<m>/<m>.db.spec.ts` |
| class `AccountingService` (db) | `AccountingDb` |
| class `HealthService` (db) | `HealthDb` |
| class `MatchesService` (db) | `MatchesDb` |
| class `RecipientsService` (db) | `RecipientsDb` |
| class `SalesService` (db) | `SalesDb` |
| class `SalesImportService` (db) | `SalesImportDb` |
| class `SeasonPassesService` (db) | `SeasonPassesDb` |
| class `UsersService` (db) | `UsersDb` |

Only four db services have specs (matches, recipients, sales, sales-import).
`src/db/shared/date-range.util.spec.ts` is not a service spec and is untouched.

The abstract tokens stay `IUsersDbService`, `ISalesDbService`, and so on. Renaming them to
`ISalesDb` would ripple into every api service, every api spec and every new db module for
no gain: the token names are already unambiguous — they were never the collision.

The `FooDb` shape (rather than `FooDbService`) is chosen to match the documented
`foo.db.ts` → `FooDb` convention in the user's global CLAUDE.md.

Consequence in the api specs: the six that import a concrete db class do so **only** as
the type argument to `mockDeep<T>` / `DeepMockProxy<T>`. Their
`import { SalesService as SalesDbService }` aliases collapse to plain
`import { SalesDb }`, with no change to any test body.

### D4 — `no-orm-outside-db`: widen the exemption, do not replace it

```js
from: {
    pathNot: ['^src/db/', '\\.db\\.ts$', '\\.spec\\.ts$'],
},
```

The location clause stays. The filename clause is **additive**, and it is the part that
later makes a colocated `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts`
legal without another config change.

A straight swap to filename-only was rejected because eleven files under `src/db/` import
Prisma with a non-type-only statement and are legal today purely by location:

- Type-level usage, convertible to `import type` if anyone wants to:
  `accounting.db.interface.ts`, `matches.db.interface.ts`, `sales.db.interface.ts`,
  `sales-import.db.interface.ts`, `users.db.interface.ts`, `matches/types/match.type.ts`,
  `sales/type/sale.type.ts`, `sales/type/sale-with-full-match.type.ts`,
  `sales/type/oldest-match-sale.type.ts`, `season-passes/type/season-pass.type.ts`.
- **Not** convertible: `src/db/matches/matches.utils.ts` uses `Competition.CHAMPIONSHIP`
  and `Competition.CHAMPIONS_LEAGUE` as runtime values. A filename-only rule would need a
  bespoke single-file exemption for it, which is strictly worse than keeping the location
  clause.

The rule's comment is corrected to describe what it actually does.

**Considered and rejected — narrowing the `'\\.spec\\.ts$'` exemption to db-layer specs.**
Four non-db specs import `@prisma/client` non-type-only and use the values at runtime as
fixture data: `src/api/sales/sales.service.spec.ts` and
`src/api/accounting/accounting.service.spec.ts` (`SaleStatus.SOLD` / `.GIFTED` / …), and
`src/api/matches/matches.service.spec.ts` and
`src/api/matches/formatters/format-match.formatter.spec.ts` (`Competition.CHAMPIONSHIP`).
Narrowing the exemption would require either a file allowlist in the config or rewriting
real test fixtures to dodge a lint rule. Neither is worth it for a rule whose value is
about what ships to production, over files that never ship.
(`src/api/admin/admin.service.spec.ts` already uses `import type` and would have been
unaffected either way.) **Do not re-propose this without new information.**

### D5 — New rule `no-prisma-service-outside-db`

```js
{
    name: 'no-prisma-service-outside-db',
    comment:
        'PrismaService is the db layer\'s own handle on the ORM. Api services, controllers and their modules reach the database through a db token, never by importing PrismaService.',
    severity: 'error',
    from: { pathNot: ['^src/db/', '\\.db\\.ts$'] },
    to: { path: '^src/db/prisma\\.service\\.ts$' },
}
```

Without it, "`PrismaService` stays unexported" is a convention living only in this
document — and replacing invisible availability with enforced edges is the whole point of
the change.

**The `*.db.module.ts` files need no exemption, and none is added.** They import
`PrismaModule` from `src/db/prisma.module.ts`; they never name `PrismaService`.
Dependency-cruiser's `from`/`to` match direct edges, so `sales.db.module.ts →
prisma.module.ts` and `prisma.module.ts → prisma.service.ts` are two separate edges and
only the second one is a `to` match. `prisma.module.ts` is itself exempt by the `^src/db/`
clause.

The four db specs that import `PrismaService` (`matches`, `recipients`, `sales`,
`sales-import`) are exempt by the same location clause. Note for whoever does the
colocation step: a colocated `*.usecase.db.spec.ts` under `src/api/` **would** trip this
rule, and that is the right moment to decide on a `\\.db\\.spec\\.ts$` clause — not now,
when no such file exists.

### D6 — `no-db-from-controller`: widen, do not swap

```js
to: { path: ['^src/db/', '\\.db\\.ts$'] },
```

The brief called for swapping `^src/db/` out for `\\.db\\.ts$`. That would *weaken* the
rule: a controller could then import `src/db/sales/type/sale.type.ts`, which is forbidden
today. Widening has zero effect on the current tree — no controller imports anything under
`src/db/` — and survives colocation.

### D7 — Ordering: rename first, then split. Three units of work.

The brief numbered the barrel split first. Reversed, because rename-first is strictly the
smaller diff: it touches `db.module.ts` once (eight import lines) and then deletes it,
whereas split-first would create eight brand-new db module files and immediately re-edit
all eight during the rename.

- **Phase A** — rename files, rename classes, update every import site. Green under the
  *existing* dependency-cruiser config: the files stay under `src/db/`, so the location
  clause still covers them.
- **Phase B** — `.dependency-cruiser.cjs` only (D4, D5, D6). Roughly ten lines.
  Deliberately separate: A is a large mechanical diff and B is the small semantic one, and
  reviewing them in one commit hides B.
- **Phase C** — create `PrismaModule` and the eight `*.db.module.ts`, rewire the eleven
  consumers, delete `db.module.ts`.
- **Phase D** — the DI smoke spec (D8).

Each phase is independently green and is staged for `/crit` separately.

### D8 — A DI smoke spec for `AppModule`

Phase C is the highest-risk step here: eleven consumers rewired by hand, and a missed
`imports:` entry is exactly the class of bug that `tsc` and eslint both sail past and that
surfaces only as a runtime resolution error on whichever route nobody exercised. Nothing
in the repo currently catches it.

`src/app.module.spec.ts` compiles the real `AppModule`:
`Test.createTestingModule({ imports: [AppModule] }).compile()`. `compile()` instantiates
providers but does not run `onModuleInit`, so neither Prisma nor Redis opens a socket —
and the builder must confirm that empirically with both services down, not by reasoning
about lifecycle hooks.

Three environment facts it has to respect, read from `src/env.schema.ts` and
`src/app.module.ts`:

- `validate` requires exactly four variables: `JWT_SECRET`, `JWT_EXPIRES`,
  `FOOTBALL_DATA_API_KEY`, `REDIS_URL`. Everything else is `@IsOptional()`.
  `DATABASE_URL` is not validated by the schema but the `PrismaClient` constructor needs
  it, so the stub sets it too. `GEMINI_API_KEY` is deliberately left unset —
  `LlmService` handles that path explicitly.
- `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` must be left **unset**, or `AppModule`
  registers `ObserveModule` and the test starts depending on telemetry credentials.
- `NODE_ENV` must be `production` for this spec, so the `pino-pretty` transport branch is
  skipped and no worker thread is spawned.

`ConfigModule.forRoot()` validates synchronously as `app.module.ts` is evaluated, and the
`ObserveModule` ternary is evaluated at import time too, so the stub environment must be
in place *before* `AppModule` is imported.

The spec passes against both the current `DbModule` wiring and the post-Phase-C wiring. It
is scheduled after C, but landing it before C as a guard is equally acceptable.

## Verification

Every phase runs the same gate:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

`lint:deps` is `depcruise src --config`, which resolves `.dependency-cruiser.cjs` by
default — the Phase B changes take effect with no script change.

The `test -f dist/main.js` line is not decoration. Widening the root `tsconfig.json`
`include` past `src/` silently relocates the nest build output to `dist/src/` and breaks
the Railway `start:prod` script (`node dist/main`), and no CI gate catches it.

**This change touches no tsconfig, and must not.** The current setup is load-bearing and
subtle: root `include` is already `["src/**/*", "scripts/**/*"]`, and it is only
`tsconfig.build.json`'s `"exclude": [… "scripts" …]` that keeps the inferred `rootDir` at
`src` and the output at `dist/main.js`. Every file this change creates lands under `src/`,
so no `include` edit is needed. `.dependency-cruiser.cjs` reads
`tsConfig: { fileName: 'tsconfig.json' }`, so a tsconfig edit would also silently change
what the dep rules can see.

The workspace this was designed in has no `node_modules`, so none of the above was run
empirically. The implementation plan opens by requiring `npm ci` and a confirmed green
baseline on the untouched tree before anything is edited.

## Out-of-scope observations

Recorded here because they were found while reading, not because this change acts on them.

- **`eslint.config.mjs` does not enable `@typescript-eslint/explicit-function-return-type`
  or `explicit-module-boundary-types`**, although the user's global CLAUDE.md states both
  are enforced. Turning them on would light up unrelated files across the repo and destroy
  the net-zero property this change depends on. It is a separate decision for the user.
- **Optional hygiene:** the ten db-layer files listed in D4 could switch to `import type`
  for their Prisma imports. Purely cosmetic under D4's widened rule — worth doing only if
  someone later wants the location clause gone.
- **`RedisModule` is `@Global()`**, so six db services inject `RedisService` with no module
  edge, which is the same invisible-availability shape this change removes for the db
  layer. Making the six db modules import `RedisModule` explicitly would be free and
  net-zero, but it is a different decision about a different module.
- `src/db/matches/matches.utils.ts` throws a `DomainException` from the db layer, which
  the global CLAUDE.md's hexagonal rules say belongs in the service. Pre-existing; moving
  it is a behaviour-risk change and is not attempted here.
