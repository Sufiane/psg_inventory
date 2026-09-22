# Extracting `updateSale` Into a Usecase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revised 2026-09-17** against `origin/main` at `43bc57d`. The db layer is now per-service
modules (`SalesDbModule`, `MatchesDbModule`, …) with no `DbModule` barrel;
`src/db/sales/sales.service.ts` is now `src/db/sales/sales.db.ts` exporting class `SalesDb`;
`resolveTargetStatus`, `UpdateSaleDto.sold`, `flattenGift` and `SaleResponse` were deleted
upstream. **Line numbers below were re-derived at `43bc57d` and will still drift — re-read
every file before editing it.**

**Goal:** Move `SalesService.updateSale` and everything that exists only to serve it into
`src/api/sales/usecases/update-sale/`, per CLAUDE.md's usecase rule, **changing no behaviour
whatsoever**. `SalesService.updateSale` becomes a one-line delegate; `ISalesService`,
`SalesController`, `scripts/ungift-sale.ts`, `src/db/**` and `web/**` are untouched.

**Architecture:** Three shared leaves are extracted first so the usecase never calls back into
its owning service — `computeProfit` (pure), `SaleAllocationsValidator` (owns matches +
season-passes db) and `SalesCacheInvalidator` (owns Redis). The usecase then depends on a
narrow `IUpdateSaleUsecaseDb` (four of `ISalesDbService`'s twelve methods, declared by indexed
access, bound by a typed `useFactory` to the *same* provider instance), `IRecipientsDbService`,
and those two collaborators. Read spec D1 before Task 5: a Prisma-importing
`*.usecase.db.ts` under `src/api/` is legal to write and **impossible to wire**
(`no-prisma-service-outside-db` blocks `sales.module.ts` from importing `PrismaModule`), which
is why the usecase's db artifact is interface-only.

**Tech Stack:** NestJS 11 + Prisma 6 (`src/`), Jest 29 + `jest-mock-extended`,
`dependency-cruiser` for the layering rules. No new dependencies — if a task seems to need one,
stop and escalate.

## Global Constraints

- **Spec of record:** `docs/specs/2026-09-16-update-sale-usecase-extraction-design.md`,
  including its 2026-09-17 revision note. Read *The layering rules*, D1, D2 and D9 before
  Task 5. The behaviour being preserved is documented in
  `docs/specs/2026-09-11-gifted-sale-status-design.md` (D5, D8, D9, D10, D14–D17) — background,
  not something this plan changes.
- **Pure refactor. No behaviour change.** No new `ErrorCode`, no changed guard order, no
  changed cache key, no changed DTO, no changed db method signature. If a task appears to
  require one, stop and escalate — it is a misreading.
- **`ISalesService` does not change.** Same nine abstract members, same signatures.
  `src/api/sales/interfaces/sales.service.interface.ts` is edited in **no** task.
- **`src/db/**` is not edited in any task.** Neither is `src/api/sales/sales.controller.ts`,
  `scripts/ungift-sale.ts`, or anything under `web/`.
- **`.dependency-cruiser.cjs` is fixed, with one named exception: Task 0.** Beyond Task 0,
  do not add further rules, exceptions or `severity` changes. Note `docs/tech-debt.md`
  entry 3 for why `no-orm-outside-db` keeps its `^src/db/` clause.
- **Comments move with the code they explain, unedited.** The routing comments inside
  `updateSale`, and the comments on `resolveNewGiftRecipient`, `resolveExistingGiftRecipient`,
  `LEGAL_TRANSITIONS`, `assertLegalTransition`, `isKickoffGuarded` and `invalidateAfterWrite`
  are load-bearing. Copy them verbatim: no deletions, no rewording, no expansion. Write no new
  comments beyond the ones this plan names explicitly.
- Explicit return types on every function and method, including `Promise<void>`.
  Constructor-injected dependencies are `private readonly`. No single-letter locals. No inline
  `if` — always braced, body on its own line. Blank line before `if` / `for` / `while` /
  `return` / `throw` unless it is the first statement in its block.
- Jest structure: a `describe` per condition, `it` titles state only the outcome, shared setup
  in that `describe`'s own `beforeEach`. Moved blocks keep their existing titles exactly.
- **Gate after every task, all three green:** `npm run lint`, `npm run typecheck`, `npm test`.
  `npm test` now includes `src/app.module.spec.ts`, which compiles the entire `AppModule` DI
  graph — that is the net for a provider registered without its module import, and it is the
  reason Tasks 2, 3 and 5 cannot silently half-wire anything. Task 7 adds `npm run lint:deps`
  and `npm run build`. **No task is allowed to end with a red suite.** This is a refactor and
  the suite is the only proof it is one.
- **Do not commit.** Each task ends by *staging* its changes (`git add`) and reporting. The
  user runs `/crit` on the staged diff and gives the go-ahead before anything is committed.

---

## Parallelism

**Backend only. No frontend work exists in this plan — `web/` is not touched by any task.**

All seven tasks are **strictly sequential**: 1 → 2 → 3 → 4 → 5 → 6 → 7. Tasks 1–3 and 5 all
edit `src/api/sales/sales.service.ts`, Tasks 2, 3 and 5 all edit
`src/api/sales/sales.module.ts`, and Tasks 2–6 all edit `src/api/sales/sales.service.spec.ts`.
There is nothing to parallelise and attempting it produces conflicts in three shared files.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/api/sales/shared/profit.util.ts` | `computeProfit(price)` — the PSG-commission arithmetic |
| `src/api/sales/shared/sale-allocations.validator.ts` | `SaleAllocationsValidator.validate(...)`, owns matches + season-passes db |
| `src/api/sales/shared/sales-cache.invalidator.ts` | `SalesCacheInvalidator.afterWrite(...)`, owns `RedisService` |
| `src/api/sales/test-support/sales.fixtures.ts` | `saleFixture` / `giftFixture` / `matchFixture` / `passFixture` + shared id constants |
| `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts` | `IUpdateSaleUsecaseDb` — interface only, four methods, no ORM import |
| `src/api/sales/usecases/update-sale/update-sale.usecase.ts` | `UpdateSaleUsecase.execute(...)` + the transition/kickoff rules |
| `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts` | The five `updateSale` describe blocks, moved |

**Modified:**

| File | Change |
|---|---|
| `src/api/sales/sales.service.ts` | Loses `updateSale`'s body and its 8 helpers; delegates to the usecase; drops 4 dependencies; `getProfit` delegates to `computeProfit` |
| `src/api/sales/sales.module.ts` | Registers the two collaborators, the usecase and the `IUpdateSaleUsecaseDb` binding; adds `RedisModule` to `imports` |
| `src/api/sales/sales.service.spec.ts` | Loses the five moved describe blocks and the inline fixtures; gains providers and one delegation test |
| `docs/tech-debt.md` | Three new entries (Task 7) |

**Untouched (assert this in Task 7):** `src/api/sales/interfaces/sales.service.interface.ts`,
`src/api/sales/sales.controller.ts`, `src/api/sales/dto/**`, `src/db/**`, `scripts/**`,
`tsconfig*.json`, `package.json`, `web/**`. `.dependency-cruiser.cjs` is touched, but only by
Task 0 (see below) — no other task may edit it.

---

## Task 0 — Close the `no-prisma-service-outside-db` wiring gap

Approved by the user separately from the refactor itself, as its own reviewable change,
landed first so every later task's `npm run lint:deps` runs against the final config.

**The gap:** `7bfec56` added a `'\\.db\\.ts$'` exemption to `no-orm-outside-db` specifically
to make a colocated `src/api/**/*.usecase.db.ts` legal (`docs/specs/2026-09-16-db-module-
split-and-db-rename-design.md`, line 6 and D4). `1caf2f2` then added
`'^src/db/prisma\\.module\\.ts$'` to `no-prisma-service-outside-db`'s `to:` list. Net effect:
such a file is legal to write but impossible to wire — the module that registers it needs
`imports: [PrismaModule]`, and no api-side module matches that rule's
`pathNot: ['^src/db/', '\\.db\\.ts$']` (`*.db.module.ts` does not match `\.db\.ts$`). D5 of
the db-split spec named this exact moment: "that is the right moment to decide on a clause —
not now, when no such file exists."

- [ ] Add `'\\.usecase\\.db\\.module\\.ts$'` to `no-prisma-service-outside-db`'s `pathNot`.
      Deliberately narrower than `'\\.db\\.module\\.ts$'` — the eight existing
      `src/db/**/*.db.module.ts` files are already exempt by the `^src/db/` location clause,
      so the broader form would only widen the api-side surface for no gain.
- [ ] Update the rule's `comment` to say why: a colocated usecase db module is the one
      api-side module permitted to import `PrismaModule`, and it must provide only its
      usecase's db class, since importing `PrismaModule` hands `PrismaService` to every
      provider in the importing module.
- [ ] `npm run lint:deps` passes clean; the eight existing `*.db.module.ts` files are
      unaffected.
- [ ] This clause is unexercised by this branch — option A (Task 5) creates no colocated
      usecase db module, so nothing matches the new pattern yet. Expected; mirrors `7bfec56`,
      which cut its hatch before anything used it.
- [ ] Record the amendment in `docs/specs/2026-09-16-update-sale-usecase-extraction-design.md`
      as a short addition to the relevant D-section.

---

## Task 1 — Extract `computeProfit`

**Files:** `src/api/sales/shared/profit.util.ts` (new), `src/api/sales/sales.service.ts`

- [ ] Create `src/api/sales/shared/profit.util.ts` exporting
      `export function computeProfit(price: ListedPrice): Profit` whose body is the current
      expression from `SalesService.getProfit`, character for character:
      `return ((price * (100 - PSG_COMMISSION)) / 100) as Profit;`. Import `PSG_COMMISSION`
      from `../../../shared/constants` and the branded types from `@psg/shared/money`.
- [ ] In `sales.service.ts`, replace `getProfit`'s body with `return computeProfit(price);`.
      Keep the method, its name, its signature and its place on `ISalesService` — the interface
      file is not edited.
- [ ] Leave the two internal call sites (`addSale`, `updateSale`) on `this.getProfit(...)` for
      now. Task 5 repoints the `updateSale` one.
- [ ] Remove the now-unused `PSG_COMMISSION` import from `sales.service.ts` (`noUnusedLocals`
      fails the typecheck otherwise).

**Verify:** `npm run lint && npm run typecheck && npm test` — green, no spec file edited.

**Done when:** `sales.service.ts` no longer contains the commission arithmetic and the suite is
untouched and passing.

---

## Task 2 — Extract `SaleAllocationsValidator`

**Files:** `src/api/sales/shared/sale-allocations.validator.ts` (new),
`src/api/sales/sales.service.ts`, `src/api/sales/sales.module.ts`,
`src/api/sales/sales.service.spec.ts`

- [ ] Create the validator as an `@Injectable()` class with
      `constructor(private readonly matchesDbService: IMatchesDbService, private readonly seasonPassesDbService: ISeasonPassesDbService) {}`
      and one public method:
      ```ts
      async validate(
          userId: UserId,
          matchId: MatchId,
          allocations: SaleAllocationDto[] | SaleAllocationInput[],
      ): Promise<void>
      ```
      Its body is `SalesService.validateAllocations` moved **verbatim** — same checks in the
      same order (empty → duplicate `seasonPassId` → `MATCH_NOT_FOUND` → pass ownership → pass
      season), same `DomainException(ErrorCode.…)` for each.
- [ ] Delete `validateAllocations` from `SalesService`. `addSale` and `updateSale` both call
      `await this.saleAllocationsValidator.validate(userId, …, …)` with the arguments they pass
      today. Drop `IMatchesDbService` and `ISeasonPassesDbService` from the `SalesService`
      constructor and their imports.
- [ ] In `sales.module.ts`, add `SaleAllocationsValidator` to `providers` as a plain class
      entry. **Leave `MatchesDbModule` and `SeasonPassesDbModule` in `imports`** — the
      validator is declared in this module and resolves those tokens, so the edges are still
      required. (Spec D2 explains why no module edge disappears here.)
- [ ] In `sales.service.spec.ts`'s `Test.createTestingModule`, add `SaleAllocationsValidator`
      to `providers` as the **real** class. The existing `IMatchesDbService` /
      `ISeasonPassesDbService` mock providers stay exactly as they are — the validator resolves
      them, so every existing assertion against `matchesDbService.getOneMatch` and
      `seasonPassesDbService.findById` keeps working unchanged.
- [ ] Change no test assertion and no test title.

**Verify:** `npm run lint && npm run typecheck && npm test`. Watch `addSale allocations`
(l.1168) and `updateSale allocations` (l.1240) pass without edits — that is the proof the move
was verbatim — and `AppModule > resolves every provider`, which is the proof the module wiring
is complete.

**Done when:** `SalesService` holds no allocation logic and two call sites go through the
validator.

---

## Task 3 — Extract `SalesCacheInvalidator` and declare the `RedisModule` edge

**Files:** `src/api/sales/shared/sales-cache.invalidator.ts` (new),
`src/api/sales/sales.service.ts`, `src/api/sales/sales.module.ts`,
`src/api/sales/sales.service.spec.ts`

- [ ] Create the invalidator as an `@Injectable()` class with
      `constructor(private readonly redisService: RedisService) {}` and one public method
      `async afterWrite(userId: UserId, options: { recipientChanged: boolean }): Promise<void>`
      whose body is `SalesService.invalidateAfterWrite` moved verbatim — the
      `CACHE_KEYS.invalidateAccounting(userId)` call, then the `recipientChanged`-gated
      `CACHE_KEYS.invalidateRecipients(userId)` call. **Move the `// The combobox orders by
      giftCount, …` comment with it, unedited.**
- [ ] Delete `invalidateAfterWrite` from `SalesService`. Its five call sites (`updateSale` ×3,
      `ungiftSale`, `deleteSale`) become `await this.salesCacheInvalidator.afterWrite(...)` with
      identical arguments. Drop `RedisService` and the `CACHE_KEYS` import from `SalesService`.
- [ ] In `sales.module.ts`, add `SalesCacheInvalidator` to `providers` **and add `RedisModule`
      to `imports`**. `RedisModule` is `@Global()` so this is not strictly required today —
      it is deliberate (spec D4): it costs nothing, it matches
      `src/api/season-passes/season-passes.module.ts`, and it means `SalesModule` needs no edit
      when `docs/tech-debt.md` entry 2 drops `@Global()`.
- [ ] In `sales.service.spec.ts`, add the **real** `SalesCacheInvalidator` to `providers`; keep
      the `RedisService` mock provider as is. Every `redisService.invalidatePattern` assertion
      must keep passing untouched.

**Verify:** `npm run lint && npm run typecheck && npm test`. `updateSale recipients cache
invalidation` (l.958), `ungiftSale` (l.914) and `deleteSale` (l.1083) are the blocks that prove
it.

**Done when:** `SalesService`'s constructor is down to `ISalesDbService`,
`IRecipientsDbService`, `SaleAllocationsValidator` and `SalesCacheInvalidator`, and
`SalesModule` imports `RedisModule` explicitly.

---

## Task 4 — Extract the shared test fixtures

**Files:** `src/api/sales/test-support/sales.fixtures.ts` (new),
`src/api/sales/sales.service.spec.ts`

- [ ] Move `saleFixture`, `giftFixture`, `matchFixture`, `passFixture` and the `userId`,
      `saleId`, `matchId`, `passId` constants (currently lines 35–102, inside the
      `describe('SalesService')` closure) into
      `src/api/sales/test-support/sales.fixtures.ts`, exported. Bodies unchanged, explicit
      return types kept.
- [ ] **`SaleStatus` must be a type-only import in this file.** It is not a `.spec.ts`, not
      under `src/db/`, and not a `*.db.ts`, so `no-orm-outside-db` applies to it in full; only
      `type-only` imports of `@prisma/client` are exempt. Write
      `import type { SaleStatus } from '@prisma/client';` and give `saleFixture`'s status
      parameter the default `'PENDING' as SaleStatus` instead of `SaleStatus.PENDING`.
- [ ] Import the fixtures into `sales.service.spec.ts`. Spec files may keep using `SaleStatus`
      as a value — leave those call sites alone.
- [ ] Change no test body, no title, no assertion.

**Verify:** `npm run lint && npm run typecheck && npm test && npm run lint:deps`. Run
`lint:deps` here — this is the task that can break it.

**Done when:** the suite and `lint:deps` are green and `sales.service.spec.ts` declares no
fixtures of its own.

---

## Task 5 — Create the usecase and make `SalesService.updateSale` a delegate

**This is the behaviour-preservation proof. Beyond registering two providers,
`sales.service.spec.ts` is NOT edited in this task — all 1301 lines of it must pass unchanged
against the delegating service.**

**Files:** `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts` (new),
`src/api/sales/usecases/update-sale/update-sale.usecase.ts` (new),
`src/api/sales/sales.service.ts`, `src/api/sales/sales.module.ts`,
`src/api/sales/sales.service.spec.ts` (providers only)

- [ ] Create `update-sale.usecase.db.ts`. **Interface only — it must not import Prisma or
      `PrismaService`**, for the reason in spec D1 (the file would be legal; its wiring would
      not):
      ```ts
      export abstract class IUpdateSaleUsecaseDb {
          abstract getOneSale: ISalesDbService['getOneSale'];
          abstract updateSale: ISalesDbService['updateSale'];
          abstract giftSale: ISalesDbService['giftSale'];
          abstract updateGift: ISalesDbService['updateGift'];
      }
      ```
      Indexed access, not retyped signatures.
- [ ] Create `update-sale.usecase.ts`:
      ```ts
      @Injectable()
      export class UpdateSaleUsecase {
          constructor(
              private readonly db: IUpdateSaleUsecaseDb,
              private readonly recipientsDbService: IRecipientsDbService,
              private readonly saleAllocationsValidator: SaleAllocationsValidator,
              private readonly salesCacheInvalidator: SalesCacheInvalidator,
          ) {}

          async execute(userId: UserId, payload: UpdateSaleDto): Promise<void> { … }
      }
      ```
      `execute`'s body is `SalesService.updateSale`'s body moved verbatim, with exactly these
      substitutions: `this.salesDbService.` → `this.db.`, `this.getProfit(` →
      `computeProfit(`, `this.validateAllocations(` → `this.saleAllocationsValidator.validate(`,
      `this.invalidateAfterWrite(` → `this.salesCacheInvalidator.afterWrite(`. Nothing else
      changes — not `const target = payload.status;`, not the branch order, not the
      `fieldPatch` spread, not the early `return`s.
- [ ] Move into the same file, unchanged: private `resolveNewGiftRecipient`,
      `resolveExistingGiftRecipient`, `assertOwnedRecipient`; module-scope `LEGAL_TRANSITIONS`,
      `isLegalTransition`, `assertLegalTransition`, `assertNotAfterKickoff`, `isKickoffGuarded`
      — five module-scope helpers, not six. `resolveTargetStatus` no longer exists; do not
      recreate it. **Every comment attached to them moves verbatim.**
- [ ] In `sales.service.ts`, replace `updateSale`'s body with
      `return this.updateSaleUsecase.execute(userId, payload);` and add
      `private readonly updateSaleUsecase: UpdateSaleUsecase` to the constructor. Delete the
      three private helpers and five module-scope helpers that moved, drop
      `IRecipientsDbService` from the constructor, and delete every import that is now unused
      (`IRecipientsDbService`, `GiftRecipientInput`, `normalizeRecipientName`, `RawSaleStatus`,
      `SaleStatusTarget`, and any `DomainException`/`ErrorCode` usage that left — check what
      `getSale`, `ungiftSale` and `deleteSale` still need before deleting).
- [ ] In `sales.module.ts`, add `UpdateSaleUsecase` to `providers` plus the binding:
      ```ts
      {
          provide: IUpdateSaleUsecaseDb,
          inject: [ISalesDbService],
          useFactory: (salesDb: ISalesDbService): IUpdateSaleUsecaseDb => salesDb,
      },
      ```
      The declared return type is the compile-time conformance check; do not replace it with
      `useExisting`, which Nest does not type-check. `ISalesDbService` is already in scope via
      the existing `SalesDbModule` import.
- [ ] In `sales.service.spec.ts` add **only** what Nest needs to resolve the new graph:
      `UpdateSaleUsecase` and an `IUpdateSaleUsecaseDb` provider. Bind `IUpdateSaleUsecaseDb`
      to the **same mock object** already provided for `ISalesDbService` — hoist
      `mockDeep<SalesDb>()` into a local `const` and pass it under both tokens — so the existing
      `salesDbService.giftSale` / `updateGift` / `updateSale` assertions still observe the calls
      the usecase makes. This is the only edit to that file in this task: it adds no test and
      changes no assertion.

**Verify:** `npm run lint && npm run typecheck && npm test`. **All five `updateSale` describe
blocks in `sales.service.spec.ts` must pass with no assertion edited.** If any test fails, the
move was not verbatim — find the divergence and fix the production code, never the test.

**Done when:** `SalesService.updateSale` is one line, the usecase owns every rule, and the
original suite is green.

---

## Task 6 — Move the `updateSale` tests to the usecase spec

**Files:** `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts` (new),
`src/api/sales/sales.service.spec.ts`

- [ ] Create `update-sale.usecase.spec.ts` with a top-level `describe('UpdateSaleUsecase')`
      whose `beforeEach` builds a testing module providing: `UpdateSaleUsecase`, the real
      `SaleAllocationsValidator`, the real `SalesCacheInvalidator`, and mocks for
      `IUpdateSaleUsecaseDb` (`mockDeep<SalesDb>()`), `IRecipientsDbService`
      (`mockDeep<RecipientsDb>()`), `IMatchesDbService`, `ISeasonPassesDbService` and
      `RedisService`. Carry over the `giftSale` / `updateGift`
      `mockResolvedValue({ recipientId: 'r-default' })` defaults with their explaining comment,
      and `module.useLogger(false)`.
- [ ] Move these five describe blocks across **with their titles and bodies unchanged**:
      `updateSale kickoff guard` (l.225, including its nested `when the target sale does not
      exist`), `updateSale status transitions` (l.284), `routing a write to the db layer`
      (l.761), `updateSale recipients cache invalidation` (l.958), `updateSale allocations`
      (l.1240).
- [ ] The **only** permitted edit inside a moved block: `service.updateSale(userId, payload)` →
      `usecase.execute(userId, payload)`. Same arguments. Every `expect`, every `ErrorCode`,
      every `toHaveBeenCalledWith` stays byte-identical.
- [ ] Import the fixtures from `../../test-support/sales.fixtures`.
- [ ] In `sales.service.spec.ts`, delete those five blocks, change the `UpdateSaleUsecase`
      provider added in Task 5 from the real class to `mockDeep<UpdateSaleUsecase>()` in the
      file's single `beforeEach` (no remaining block exercises `updateSale`'s rules), and add
      one new `describe('updateSale')` with a single `it` asserting `execute` was called once
      with `(userId, payload)`. This is the only new test in the whole plan.
- [ ] Keep the `IMatchesDbService`, `ISeasonPassesDbService` and `RedisService` mocks in that
      file: `addSale allocations` still resolves the real validator through them, and
      `ungiftSale` / `deleteSale` still resolve the real invalidator through Redis.

**Verify:** `npm run lint && npm run typecheck && npm test`. Compare the total test count
against the count recorded before Task 1 — it must be exactly one higher.

**Done when:** both spec files are green and every `updateSale` behaviour is asserted against
`usecase.execute`.

---

## Task 7 — Tech-debt entries, full verification, cleanup

**Files:** `docs/tech-debt.md`. No logic changes.

- [ ] Append three entries to `docs/tech-debt.md`, following the existing what / why deferred /
      cost to act / recommendation format, numbered after the current four. Read entries 1–4
      first so none of this duplicates them:
      1. **`IUpdateSaleUsecaseDb` is an interim shape.** A narrow interface bound to the same
         `SalesDb` instance rather than a dedicated usecase db. Deferred because the queries it
         needs run through `applySaleWrite` / `loadSaleRowOrThrow` / `invalidateSaleCaches`,
         still shared with `ungiftSale` and `deleteSale`. Cost to act: low *after* those two
         become usecases, high before — it means duplicating a helper that carries the spec-D15
         transaction ordering.
      2. **`ungiftSale` and `deleteSale` as usecase candidates,** with what makes each one a
         candidate and why neither qualifies today (spec *Scope*).
      3. **Test fixtures are compiled into `dist`.** `tsconfig.build.json` excludes only
         `**/*spec.ts`. Cost to act: one `exclude` entry, but build-config changes have moved
         this repo's output path before, so it needs a `npm run build` check that `dist/main.js`
         is still where `start:prod` looks.
- [ ] Run the whole gate: `npm run lint`, `npm run typecheck`, `npm test`, `npm run lint:deps`,
      `npm run build`.
- [ ] `npm run build` must emit `dist/main.js` — **not** `dist/src/main.js`. If the path moved,
      a `tsconfig` input set changed; revert that rather than adjusting the start script.
- [ ] `git diff --stat origin/main...` and confirm the untouched list holds:
      `src/api/sales/interfaces/sales.service.interface.ts`, `src/api/sales/sales.controller.ts`,
      `src/api/sales/dto/**`, `src/db/**`, `scripts/**`,
      `tsconfig*.json`, `package.json`, `web/**` — zero changed lines in all of them.
      `.dependency-cruiser.cjs` is expected to show only Task 0's one-line addition to
      `no-prisma-service-outside-db`'s `pathNot` plus its comment update — confirm nothing
      else in the file moved.
- [ ] Grep the diff for deleted comments: every comment removed from `sales.service.ts` must
      appear, identical, in the usecase or in one of the two collaborators. No comment may
      simply disappear.
- [ ] Confirm `sales.service.ts` has no remaining reference to `RedisService`, `CACHE_KEYS`,
      `IMatchesDbService`, `ISeasonPassesDbService`, `IRecipientsDbService` or `PSG_COMMISSION`.
- [ ] Stage everything (`git add -A`) and report that it is ready for `/crit`. **Do not commit.**

**Done when:** all five commands are green, the untouched list is verified, the tech-debt
entries are filed, and the work is staged.
