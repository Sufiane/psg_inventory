# Extracting `updateSale` into a usecase — design

Date: 2026-09-16
Status: implemented — revised 2026-09-22 after PSG-16 fired D1's own trigger condition

## Revisions

**2026-09-22 — `ungiftSale` and `deleteSale` landed as usecases (PSG-16), so `updateSale`
was built as a full db-owning usecase, not the interim shape D1 originally recommended.**
D1 named its own trigger explicitly: "it becomes worth doing when `ungiftSale` and
`deleteSale` become usecases too, at which point the whole write cluster — `applySaleWrite`
included — relocates as one unit instead of being torn in half." `PSG-16`
(`ba487fe`) did exactly that, extracting `ungiftSale`/`deleteSale` into
`src/api/sales/usecases/{ungift-sale,delete-sale}/`, each with its own Prisma-and-Redis-owning
`*.usecase.db.ts` (no dependency on `SalesDb` for the write) registered in a new
`SalesUsecasesModule`. Once that landed, `SalesDb.applySaleWrite` / `resolveRecipientId` /
`loadSaleRowOrThrow` / `invalidateSaleCaches` had exactly one remaining consumer cluster —
`updateSale` / `giftSale` / `updateGift` — so the entanglement D1 rejected Option C on no
longer existed. `updateSale` was therefore extracted the same way as its siblings: Option C,
built directly, with no interim D1-option-A step. D1 below is rewritten to describe what was
actually built; the original interim-shape analysis is kept only as historical record inside
it, clearly marked as superseded.

**2026-09-17 — rebased onto `origin/main` (`43bc57d`), five upstream deltas absorbed.**
The layering rules were rewritten (`no-orm-outside-db` gained a `\.db\.ts$` escape hatch,
`no-prisma-service-outside-db` is new), the `DbModule` barrel became per-service db modules,
`src/db/sales/sales.service.ts` became `src/db/sales/sales.db.ts` with class `SalesDb`, the
GIFTED back-compat scaffolding was deleted (`UpdateSaleDto.sold` and `resolveTargetStatus`
are gone; `flattenGift` and `SaleResponse` are gone too), and `src/app.module.spec.ts` now
compiles the whole DI graph.

What that changed in this document: **the recommendation did not change, but the reason it
is a recommendation did.** The first draft argued a colocated Prisma-importing
`*.usecase.db.ts` was *illegal* under `src/api/`. It is now legal to write — and still not
wireable, for a different rule, spelled out in *The layering rules* below. Option C is
therefore rejected on entanglement, which is a judgement, not on a lint error, which is a
constraint. **D6 is void**: `flattenGift` no longer exists. D8 moves five module-scope
helpers, not six. The module-wiring half of D2 and all of D4's Redis discussion are new.
The follow-ups of D10 now belong in `docs/tech-debt.md`.

## Problem

`SalesService.updateSale` is no longer an orchestration over db calls. It enforces a
transition table, enforces a kickoff guard, decides between three different db write methods
from the pair (current status, target status), resolves a gift recipient two different ways
depending on which of those branches won, and invalidates two cache families on a condition
derived from the write's result. Three private methods and five module-scope helpers in
`src/api/sales/sales.service.ts` (398 lines) exist for that one operation and nothing else.

That is the shape CLAUDE.md's *usecase layer for complex operations* rule describes: one
operation, multiple intents routed to different writes, non-trivial business rules, private
helpers only that operation needs. This document designs the extraction.

**This is a pure refactor.** No behaviour changes. Specifically unchanged, byte for byte:

- the HTTP contract (`POST /sales/update`, `UpdateSaleDto`, `Promise<void>`);
- every `DomainException` / `ErrorCode` raised, and the order the guards raise them in
  (illegal transition before kickoff — the comment on `assertLegalTransition` says so);
- the transition table `LEGAL_TRANSITIONS` and the entry-scoped kickoff guard, including the
  `GIFTED -> GIFTED` exemption (spec D5/D10);
- the gift-intent routing across `giftSale` / `updateGift` / `updateSale`, including the
  absent-`status`-with-recipient shape and its mirror error
  `SALE_GIFT_RECIPIENT_NOT_APPLICABLE`;
- the cache invalidation, including the `recipientChanged` condition that compares the
  returned `recipientId` against `existing.Gift?.recipientId ?? null`;
- `ISalesService`, and therefore `SalesController` and `scripts/ungift-sale.ts`.

`src/api/sales/sales.service.spec.ts` (1301 lines) is the safety net, and the refactor is
phased so it stays green at every step — including one step where it is not edited at all
beyond provider registration (D9, plan Task 5).

## Scope

In scope: `updateSale` only.

Out of scope, deliberately, but named so a later pass does not re-derive it:

- **`ungiftSale` is a usecase candidate.** A second write path into the gift row with its own
  guard (`status !== 'GIFTED'` → `SALE_INVALID_STATUS_TRANSITION`) and its own cache
  consequence, with exactly one caller — a script. It is small today, which is the only
  reason it stays.
- **`deleteSale` is a weaker candidate.** A guard, one db call, and an invalidation whose
  `recipientChanged` argument encodes a real rule. A clean service→db passthrough today, and
  CLAUDE.md explicitly says not to retrofit the layer onto those.

Both are filed in `docs/tech-debt.md` (D10). If either is ever extracted, D1's verdict should
be re-taken with them — see D1's closing paragraph.

## The layering rules

`.dependency-cruiser.cjs` is enforced by `npm run lint:deps` and is treated here as fixed.
This design proposes no relaxation, no exception and no `severity` change. Three rules bear
on the work. The first two were rewritten upstream on 2026-09-17 and they point in opposite
directions, which is the whole of this section:

```js
{
    name: 'no-orm-outside-db',
    comment:
        'Prisma may only be imported by the db layer: anything under src/db/, or any *.db.ts file wherever it lives (so a colocated *.usecase.db.ts under src/api/ stays legal). Api services and controllers go through a db token.',
    severity: 'error',
    from: { pathNot: ['^src/db/', '\\.db\\.ts$', '\\.spec\\.ts$'] },
    to: {
        path: ['^node_modules/(@prisma/client|\\.prisma/client)'],
        dependencyTypesNot: ['type-only'],
    },
},
{
    name: 'no-prisma-service-outside-db',
    comment:
        "PrismaService is the db layer's own handle on the ORM. Api services, controllers and their modules reach the database through a db token, never by importing PrismaService. PrismaModule is listed too: importing it hands PrismaService to every provider in the importing module, which is the same leak by another route. The \\.usecase\\.db\\.module\\.ts$ exemption is the one api-side exception: a colocated usecase db module is the sole module permitted to import PrismaModule, and it must provide only its usecase's db class, because importing PrismaModule hands PrismaService to every provider in the importing module.",
    severity: 'error',
    from: { pathNot: ['^src/db/', '\\.db\\.ts$', '\\.usecase\\.db\\.module\\.ts$'] },
    to: { path: ['^src/db/prisma\\.service\\.ts$', '^src/db/prisma\\.module\\.ts$'] },
},
{
    name: 'no-api-from-db',
    severity: 'error',
    from: { path: '^src/db/' },
    to: { path: '^src/api/' },
},
```

Read together:

1. **A colocated `src/api/sales/usecases/update-sale/update-sale.usecase.db.ts` importing
   Prisma is legal.** `no-orm-outside-db`'s `\.db\.ts$` clause says so, and its comment names
   this exact file as the thing the clause exists for. CLAUDE.md's letter — "the usecase db
   is the only file in that folder that imports the ORM" — is satisfiable here.
2. **It is legal to write and it cannot be wired without a contortion.** Such a class needs a
   `PrismaService` instance, which Nest supplies only to providers of a module that imports
   `PrismaModule`. The module that would register it is `src/api/sales/sales.module.ts` —
   which matches neither `^src/db/` nor `\.db\.ts$`, so `no-prisma-service-outside-db`
   errors on that import edge. Renaming the module file does not help: `\.db\.ts$` does not
   match `…db.module.ts`. Moving the registration into a module under `src/db/` does not help
   either, because that module would have to import the api-side class and `no-api-from-db`
   forbids it.

   There is exactly one way through, and it is worth naming so nobody rediscovers it and
   thinks it was overlooked: declare the `@Module` **inside a file that is itself named
   `*.db.ts`** — put the Nest module class in `update-sale.usecase.db.ts` next to the db class,
   or in a second `*.db.ts`. That file may import `PrismaModule`, and `sales.module.ts` may
   import *it* (only controllers are barred from importing `*.db.ts`). It passes the cruiser.
   It also means a Nest module declaration living in a file whose name says "this is a data
   access class", which is a worse lie than the one the narrow interface tells. Not
   recommended, and not what the escape hatch was written for.
3. **So the wireable form of a dedicated usecase db is
   `src/db/sales/usecases/update-sale/`**, with its own `*.db.module.ts` under `src/db/`.
   That form is fully legal today. Its blocker is entanglement, not lint — see D1.
4. **Any usecase db artifact under `src/api/` must therefore be interface-only.** An abstract
   class with no ORM import, bound to a provider that already exists. That is option A.

One thing not to propose: tightening `no-orm-outside-db` to a filename-only rule by dropping
its `^src/db/` clause. `docs/tech-debt.md` entry 3 records why the location clause has to
stay — `src/db/matches/matches.utils.ts` imports `Competition` as a runtime value and is not
a `*.db.ts`.

## D1 — Where the usecase's db access lives: A, B or C

**As built (2026-09-22): Option C, colocated under `src/api/sales/usecases/update-sale/`.**
`update-sale.usecase.db.ts` declares `IUpdateSaleUsecaseDb` and implements
`UpdateSaleUsecaseDb`, matching `UngiftSaleUsecaseDb` / `DeleteSaleUsecaseDb`'s shape exactly:
constructor injects `PrismaService` and `RedisService` directly, owns its own `$transaction`
calls, and the four private helpers this section's original analysis worried about splitting
(`applySaleWrite`, `resolveRecipientId`, `loadSaleRowOrThrow`, `invalidateSaleCaches`) were
ported into this class rather than shared with `SalesDb`. `sumTickets` was duplicated too, the
same way `ungiftSale`/`deleteSale`'s db classes duplicate their own small pure helpers rather
than import `SalesDb`'s. `SalesDb` lost `updateSale`, `giftSale`, `updateGift` and all four
helpers — they had no other caller once this landed.

**One deliberate deviation from the sibling pattern.** `getOneSale` — the full `Sale` read
with `Match`+`Gift` included, needed for the transition/kickoff guards — is genuinely shared:
`SalesService.getSale` calls the same query independently of `updateSale`. Unlike
`ungiftSale`/`deleteSale`'s narrow single-purpose reads, duplicating this one into
`UpdateSaleUsecaseDb` would fork a cached, non-trivial query. `UpdateSaleUsecaseDb` therefore
also injects `ISalesDbService` and delegates `getOneSale` to it (`this.salesDbService
.getOneSale(...)`), rather than reimplementing the query on its own `PrismaService`.

This makes `IUpdateSaleUsecaseDb` a narrow abstraction over *two* things — its own owned
writes, and a delegated shared read — not the "four methods narrowed by indexed access into
`ISalesDbService`" shape Option A (below) proposed. The db access is still fully separable
from `SalesDb`'s write surface; only the one shared read crosses the boundary, explicitly,
through a real dependency edge rather than a copy-pasted query.

The remainder of this section is kept as historical record: the original analysis, written
before `PSG-16` fired the trigger condition it names, explaining why Option A (the interim
shape) was chosen at the time instead of Option C.

### Option C — a dedicated usecase db class

Two forms, and they fail for two different reasons.

**C-colocated** (`src/api/sales/usecases/update-sale/update-sale.usecase.db.ts`, importing
Prisma). Legal as a file; its provider registration is not, unless the `@Module` is smuggled
into a `*.db.ts` — consequence (2) above. Rejected on mechanics. Worth stating plainly because
the cruiser comment invites it: the rule that makes the file legal and the rule that makes its
ordinary wiring illegal were written in the same commit, and only the first is advertised.

**C-under-`src/db/`** (`src/db/sales/usecases/update-sale/update-sale.usecase.db.ts` plus its
own `*.db.module.ts`). Fully legal and fully wireable. Rejected on entanglement, which is a
judgement about risk and is stated as such.

The four methods `updateSale` needs are `getOneSale`, `updateSale`, `giftSale`, `updateGift`.
What they depend on inside `src/db/sales/sales.db.ts` (class `SalesDb`, 538 lines):

| Private helper | Used by the four that would move | Also used by methods that stay |
|---|---|---|
| `applySaleWrite` (l.154) | `updateSale`, `giftSale`, `updateGift` | **`ungiftSale`** |
| `resolveRecipientId` (l.250) | `giftSale`, `updateGift` | — (would move cleanly) |
| `loadSaleRowOrThrow` (l.270) | `updateSale`, `giftSale`, `updateGift` | **`ungiftSale`** |
| `invalidateSaleCaches` (l.285) | `updateSale`, `giftSale`, `updateGift` | **`ungiftSale`**, **`deleteSale`** |
| `sumTickets` (l.26), `saleQuery` | all four | `addSale`, the read paths |

`applySaleWrite`'s own comment names the entanglement:

> `// Extracted so giftSale / updateGift / ungiftSale / updateSale differ only`
> `// in the gift write they wrap it with.`

A physical split either duplicates `applySaleWrite` or has the new class call back into the
old one. That helper carries the soldAt/cancelledAt mirroring, the allocation replacement,
the history row and the spec-D15 transaction ordering (status first in `giftSale` because the
composite foreign key rejects the reverse; gift row first in `ungiftSale` for the same
reason). Two copies of it, one exercised only by a script path, is exactly the divergence D15
exists to prevent — on code that is already hardened and covered by `sales.db.spec.ts`.

**Rejected.** And note what this rejection is now made of: one leg (lint forbids it) died in
the rebase, the other (splitting a shared, invariant-carrying helper is not worth it for this
refactor) is untouched. C is available; it is simply not worth its risk while `ungiftSale`
and `deleteSale` still live on the same class.

### Option B — a `shared/db.service.ts` (rejected)

Concretely this would be `src/db/shared/db.service.ts`, next to the existing
`src/db/shared/date-range.util.ts`. The only things with a claim to move into it are the four
private helpers above, and each has exactly one consumer class today. Nothing is shared, so
nothing moves, and the file would be created empty of purpose.

The upstream db-module split made this worse, not better: `src/db/` is now nine explicit
per-service modules, each exporting exactly one token, precisely so that an import edge tells
you what a module touches. A `shared/db.service.ts` would be the one node in that graph whose
edge means "something". The proposal is sound reasoning about a repo where `*.db.ts` files are
colocated per api module and shared db code genuinely has nowhere to live; here it has nine
homes and a rule about which.

**Rejected on repo-layout grounds, not on principle.**

### Option A — a narrow usecase-scoped interface over the existing provider (recommended)

`src/api/sales/usecases/update-sale/update-sale.usecase.db.ts` declares an abstract class
`IUpdateSaleUsecaseDb` with exactly the four sales-side methods the usecase calls. No ORM
import, so it is legal under every reading of the rules, and it is bound in `SalesModule` to
the **same instance** every other caller uses.

Declared by indexed access rather than by retyping:

```ts
export abstract class IUpdateSaleUsecaseDb {
    abstract getOneSale: ISalesDbService['getOneSale'];
    abstract updateSale: ISalesDbService['updateSale'];
    abstract giftSale: ISalesDbService['giftSale'];
    abstract updateGift: ISalesDbService['updateGift'];
}
```

The three write payloads are seven-field inline object types; retyping them creates a second
copy that drifts the first time a field is added. Indexed access gives the same narrowing —
the usecase cannot reach `cancelMany`, `getSalesByRange` or the other eight methods — with no
duplication and no drift.

The binding carries its own compile-time conformance check, because Nest does not type-check
`useExisting`:

```ts
{
    provide: IUpdateSaleUsecaseDb,
    inject: [ISalesDbService],
    useFactory: (salesDb: ISalesDbService): IUpdateSaleUsecaseDb => salesDb,
},
```

The declared return type is the check. Same instance, no adapter object, no method rebinding,
four lines.

**Recommended at the time (2026-09-16/17) — as a choice, not as the only legal option.**
CLAUDE.md sanctions exactly this as an interim step ("a narrow dedicated interface backed by
the same underlying db class, registered under both DI tokens") and requires it be said out
loud: **this is not the final shape.** The final shape is C-under-`src/db/` or a colocated
C, and it becomes worth doing when `ungiftSale` and `deleteSale` become usecases too, at which
point the whole write cluster — `applySaleWrite` included — relocates as one unit instead of
being torn in half. Filed in `docs/tech-debt.md` at the time (D10).

**Superseded, 2026-09-22.** `PSG-16` landed `ungiftSale`/`deleteSale` as usecases before this
branch's Option A was ever built, firing the trigger condition named above in the same breath
it was written. `updateSale` was therefore built as Option C directly (see the top of D1) —
Option A was designed but never implemented.

**Amendment, 2026-09-17 (plan Task 0, historical).** `no-prisma-service-outside-db`'s
`pathNot` gained `'\.usecase\.db\.module\.ts$'`, so a colocated `*.usecase.db.module.ts`
under `src/api/` could import `PrismaModule` directly. By the time `updateSale` was actually
built, `PSG-16` had widened the same rule's `pathNot` further, to `'\.module\.ts$'` — broad
enough that a shared `sales-usecases.module.ts` registering multiple usecases' db classes
needs no per-usecase `*.usecase.db.module.ts` at all. `.dependency-cruiser.cjs` was not
touched again for this refactor; the `PSG-16` clause already covered it.

## D2 — One narrow token, not four, and no facade

`updateSale` reaches four db tokens today: `ISalesDbService`, `IMatchesDbService`,
`ISeasonPassesDbService`, `IRecipientsDbService`. Collapsing four independent tokens behind
one `IUpdateSaleUsecaseDb` facade would be worse than the problem: there is no `useExisting`
that points at two providers, so it needs a hand-written adapter object; it hides which
subsystem each call hits; and it makes the unit tests mock one blob where they now mock four
faithful services.

The question dissolves rather than needing an answer, because D3 and D4 remove two of the four
from both callers:

| Dependency | `updateSale` needs it for | After D3/D4 |
|---|---|---|
| `IMatchesDbService` | `validateAllocations` | moves to `SaleAllocationsValidator` |
| `ISeasonPassesDbService` | `validateAllocations` | moves to `SaleAllocationsValidator` |
| `RedisService` | `invalidateAfterWrite` | moves to `SalesCacheInvalidator` |
| `ISalesDbService` | 4 of its 12 methods | **narrowed** to `IUpdateSaleUsecaseDb` |
| `IRecipientsDbService` | 1 of its 5 methods (`findByIdForUser`) | injected as-is |

The criterion for narrowing, written down so the next usecase does not have to guess:
**narrow when the offered surface is much wider than the used one and the unused methods are
fat writes** (12 → 4, including three transactional write paths the usecase has no business
calling in other combinations); **do not narrow when it is one trivial read off an already
minimal token** (5 → 1, all reads, no hazard in the other four). A second facade for
recipients would double the ceremony for a guarantee nobody needs.

### Module wiring, and an overclaim avoided

`SalesModule` today, after the upstream barrel split:

```ts
imports: [SalesDbModule, MatchesDbModule, SeasonPassesDbModule, RecipientsDbModule],
providers: [{ provide: ISalesService, useClass: SalesService }],
```

After this refactor it declares six providers — `ISalesService`/`SalesService`,
`UpdateSaleUsecase`, the `IUpdateSaleUsecaseDb` binding, `SaleAllocationsValidator`,
`SalesCacheInvalidator` — and imports
`[SalesDbModule, MatchesDbModule, SeasonPassesDbModule, RecipientsDbModule, RedisModule]`.

That is **one import more than today, not fewer**, and it is worth being exact about why,
because the opposite is easy to assume. The collaborators are declared in `SalesModule`, so
the module still needs the matches and season-passes edges — the validator resolves them.
What moves is narrower and still real: `SalesService` itself drops from five injected
dependencies to four, only one of which is a db token, and `updateSale`'s rules lose the
ability to reach matches, season passes, recipients or Redis directly. The *provider*-level
dependency graph gets honest; the *module*-level one does not shrink.

The alternative that would shrink it — a `SalesSharedModule` (or one module per collaborator)
owning the matches/season-passes/Redis edges and exporting the two providers — is rejected.
One module holding two unrelated collaborators re-creates in miniature the ambient-availability
smell the db split just removed ("importing this gives you a cache invalidator *and* two db
tokens"), and a module per provider is ceremony for a boundary that does not exist: both
collaborators are sales-domain leaves used only by sales providers, inside one module, with no
layer to police. `src/app.module.spec.ts` compiles the graph either way, so nothing is lost in
safety.

## D3 — `validateAllocations` becomes an injectable collaborator

Used by `addSale` (stays on the service) and `updateSale` (moves). CLAUDE.md forbids the
usecase calling back up into `SalesService`, and copying it is not an option in a refactor
whose premise is one behaviour.

It becomes `SaleAllocationsValidator` at
`src/api/sales/shared/sale-allocations.validator.ts` — an `@Injectable()` with one public
method:

```ts
async validate(
    userId: UserId,
    matchId: MatchId,
    allocations: SaleAllocationDto[] | SaleAllocationInput[],
): Promise<void>
```

It owns `IMatchesDbService` and `ISeasonPassesDbService`. The body moves verbatim, including
every `DomainException` and the order they fire in (empty → duplicate `seasonPassId` →
`MATCH_NOT_FOUND` → pass ownership → pass season). Declared in `SalesModule`; injected by both
`SalesService` and `UpdateSaleUsecase`. A sibling leaf, not a back-call: the call direction
stays controller → service → usecase, with the validator reachable from both.

Rejected alternative: a free function taking its db dependencies as an argument. It works and
needs no registration, but it forces the usecase to keep injecting two db tokens purely to
hand them straight back out, which is what D2 is trying to stop.

## D4 — `invalidateAfterWrite` becomes an injectable collaborator, and an explicit `RedisModule` edge

Used by `updateSale` (moves), `ungiftSale` and `deleteSale` (stay). Same shape:
`SalesCacheInvalidator` at `src/api/sales/shared/sales-cache.invalidator.ts`, `@Injectable()`,
owning `RedisService`:

```ts
async afterWrite(userId: UserId, options: { recipientChanged: boolean }): Promise<void>
```

The body moves verbatim, and the comment explaining why `recipientChanged` gates the second
invalidation ("the combobox orders by giftCount, which only moves when a gift is created,
retargeted or destroyed") moves with it — a constraint from a screen you cannot see from this
file, which is the kind CLAUDE.md keeps.

**`RedisModule` is `@Global()`**, so this provider would resolve `RedisService` with no import
edge at all — the exact invisible-availability shape `docs/tech-debt.md` entry 2 is about, and
this refactor would quietly add a sixth consumer of it. **Decision: add
`imports: [RedisModule]` to `SalesModule` now.** It is free (Nest instantiates a module class
once however many importers it has, so there is no second client and no second connection), it
is already the precedent one module over — `src/api/season-passes/season-passes.module.ts`
reads `imports: [SeasonPassesDbModule, RedisModule]` — and it means that when entry 2 is acted
on and `@Global()` is dropped, `SalesModule` needs no edit. Not doing it would leave a new
provider depending on a property of another module that is scheduled for deletion.

This does not resolve entry 2, and this design does not touch `@Global()`. It just declines to
add to the debt while editing the file anyway.

Naming note: the method is `afterWrite`, not `invalidateAfterWrite` — the class name already
says "invalidator". Call sites read `this.salesCacheInvalidator.afterWrite(userId, { … })`.

## D5 — `getProfit` splits into a pure function plus an unchanged interface method

`getProfit` is on the public `ISalesService` **and** used internally by `addSale` and
`updateSale`. No external caller exists (`SalesController` never calls it; nor does
`scripts/ungift-sale.ts`), but the interface is part of the contract this refactor promises
not to touch.

- The arithmetic moves to `computeProfit(price: ListedPrice): Profit` in
  `src/api/sales/shared/profit.util.ts`, importing `PSG_COMMISSION` exactly as today.
- `SalesService.getProfit` stays on the class and on `ISalesService` as a one-line delegate.
- `UpdateSaleUsecase` imports `computeProfit` directly. No back-call.

## D6 — void: `flattenGift` no longer exists

The first draft decided that `flattenGift` stays put because only the read paths use it. The
2026-09-17 rebase deleted it, along with `SaleResponse`: the wire shape is now the stored
shape, `getSale` returns `Sale`, and `formatSale` calls `omit` directly. Nothing to move and
nothing to decide. Retained as a numbered section only so the D-numbers in the plan and in
review comments keep pointing at the same things.

## D7 — The delegate, and the untouched interface

```ts
async updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void> {
    return this.updateSaleUsecase.execute(userId, payload);
}
```

Nothing else. No guard, no logging, no re-shaping of arguments — a thin delegate is what
CLAUDE.md requires, and anything else becomes a second place to look for `updateSale`'s rules.

`ISalesService` does not change: same nine abstract members, same signatures. `SalesModule`
keeps `{ provide: ISalesService, useClass: SalesService }`, so the controller and the ungift
script are untouched files.

**The usecase gets no abstract-class token.** It is module-internal, has one consumer, and is
registered as the concrete class (`providers: [..., UpdateSaleUsecase]`), injected as
`private readonly updateSaleUsecase: UpdateSaleUsecase`. The repo's abstract-class tokens
decouple across module boundaries (`src/api` ↔ `src/db`, controller ↔ service); an interface
file here would be a third name for one thing with no second implementation in sight.

## D8 — What moves into the usecase, verbatim

Into `src/api/sales/usecases/update-sale/update-sale.usecase.ts`:

- `updateSale`'s body → `execute(userId: UserId, payload: UpdateSaleDto): Promise<void>`,
  starting from the `getOneSale` / `SALE_NOT_FOUND` check and including `const target =
  payload.status;`
- private methods `resolveNewGiftRecipient`, `resolveExistingGiftRecipient`,
  `assertOwnedRecipient`;
- module-scope `LEGAL_TRANSITIONS`, `isLegalTransition`, `assertLegalTransition`,
  `assertNotAfterKickoff`, `isKickoffGuarded` — **five**, not six. `resolveTargetStatus` was
  deleted upstream with the deprecated `sold` alias; `updateSale` now reads `payload.status`
  directly. Any prose about "two payload spellings" describes code that no longer exists.

All five have exactly one consumer, which is this operation, so they stay module-scope in the
usecase file rather than earning a `update-sale.rules.ts` of their own.

**Every comment on those blocks moves with the code it explains, unedited.** They are not
decoration: the `LEGAL_TRANSITIONS` comment carries the D5 revision history, the
`isKickoffGuarded` comment records why guarding on the target alone is wrong, the
`assertLegalTransition` comment pins the guard order, and the two comments inside `updateSale`'s
routing describe two silent-drop shapes the code exists to refuse. Deleting them loses
knowledge that exists nowhere else; expanding them is out of scope for a refactor. Copy them
across as they are.

`src/api/sales/sales.service.ts` goes from 398 lines to roughly 180, and the imports that came
with the moved code go with it (`IRecipientsDbService`, `GiftRecipientInput`,
`normalizeRecipientName`, `RawSaleStatus`, `SaleStatusTarget`, `CACHE_KEYS`, `RedisService`,
`IMatchesDbService`, `ISeasonPassesDbService`, `PSG_COMMISSION`).

## D9 — How the 1301-line spec file splits

New file: `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts`, top-level
`describe('UpdateSaleUsecase')`. Jest picks it up with no config change (`testRegex:
'.*\\.spec\\.ts$'`, `rootDir: 'src'`).

**Moves to the usecase spec** (line numbers as of `43bc57d` — re-derive before editing, the
file has moved twice already):

| `describe` | Line | Why it is the usecase's |
|---|---|---|
| `updateSale kickoff guard` | 225 | `assertNotAfterKickoff`, plus its nested `when the target sale does not exist` (l.268), which asserts the `SALE_NOT_FOUND` check that moves with `execute` |
| `updateSale status transitions` | 284 | `LEGAL_TRANSITIONS` and recipient resolution |
| `routing a write to the db layer` | 761 | the three-way `giftSale` / `updateGift` / `updateSale` routing |
| `updateSale recipients cache invalidation` | 958 | the `recipientChanged` derivation |
| `updateSale allocations` | 1240 | `updateSale`'s call into the validator |

**Stays in `sales.service.spec.ts`:** `getCurrentSeasonSales` (144), `reading a sale` (161),
`ungiftSale` (914), `deleteSale` (1083), `addSale allocations` (1168).

**Rules for the move:**

- Assertion bodies are not rewritten. The only edit inside a moved block is the call under
  test: `service.updateSale(userId, payload)` → `usecase.execute(userId, payload)`. Same
  arguments, same expectations, same `ErrorCode`s, same `toHaveBeenCalledWith`.
- The usecase spec's `Test.createTestingModule` provides `UpdateSaleUsecase`, a
  `mockDeep<SalesDb>()` under `IUpdateSaleUsecaseDb`, a `mockDeep<RecipientsDb>()` under
  `IRecipientsDbService`, and the **real** `SaleAllocationsValidator` and
  `SalesCacheInvalidator` over mocked `IMatchesDbService`, `ISeasonPassesDbService` and
  `RedisService`. Real collaborators are what keep the moved assertions — which reach through
  to `redisService.invalidatePattern` and `seasonPassesDbService.findById` — valid with no
  edit.
- The `beforeEach` defaults (`giftSale` / `updateGift` resolving `{ recipientId: 'r-default' }`)
  and their explaining comment, and `module.useLogger(false)`, move with them.
- **One test is added, not moved:** in `sales.service.spec.ts`, a `describe('updateSale')`
  asserting the service delegates to `UpdateSaleUsecase.execute` with `(userId, payload)` and
  does nothing else. New coverage for new code; it asserts no behaviour that was not already
  true.

**Shared fixtures** (`saleFixture`, `giftFixture`, `matchFixture`, `passFixture` and the
`userId` / `saleId` / `matchId` / `passId` constants, currently lines 35–102) move to
`src/api/sales/test-support/sales.fixtures.ts`, imported by both specs — roughly 100 lines
that would otherwise be duplicated and drift. The folder is `test-support/`, not `shared/`, so
nobody mistakes it for the production collaborators of D3–D5.

Two traps there:

- **`.spec.ts` files are exempt from `no-orm-outside-db`; a fixtures file is not**, and the
  upstream `\.db\.ts$` clause does not help it either. `saleFixture`'s default parameter
  currently uses the `SaleStatus` enum as a value. In the fixtures file it must be
  `import type { SaleStatus } from '@prisma/client'` with `'PENDING' as SaleStatus`, which the
  rule's `dependencyTypesNot: ['type-only']` allows. Inside the two spec files `SaleStatus` can
  keep being used as a value exactly as today.
- `tsconfig.build.json` excludes only `**/*spec.ts`, so this file **is** compiled into `dist`.
  Accepted: it is inert. Adding `**/*.fixtures.ts` to the build exclude is a build-config
  change this repo has been burnt by before (widening the root `tsconfig` "include" once moved
  the Nest output to `dist/src/` and broke `start:prod`), so it is filed as tech debt rather
  than smuggled into a refactor that promises no behaviour change.

## D10 — Follow-ups

These were recorded in `docs/tech-debt.md` in that file's format (what / why deferred / cost
to act). This section is a pointer, not the system of record.

1. **~~`IUpdateSaleUsecaseDb` is an interim shape~~ — done.** `PSG-16` extracted
   `ungiftSale`/`deleteSale` into usecases first; `updateSale` then landed directly as Option
   C (D1), so there was no interim shape to replace. No longer a tech-debt entry.
2. **~~`ungiftSale` and `deleteSale` as usecase candidates~~ — done (`PSG-16`).** No longer a
   tech-debt entry.
3. **Test fixtures compiled into `dist`** (D9), and why the obvious fix touches build config.
   Still open — unrelated to the D1 shape question, unaffected by this revision.

Not duplicated, because they are already there: entry 2 (`RedisModule` is `@Global()`) — D4
pre-pays part of it by adding the explicit import and says so; entry 1 (return-type lint rules
not actually enabled) — this refactor follows the convention by hand, like the rest of the
repo.

## The pattern, as it actually applies in this repo

For the next usecase, given the rules as they stand on 2026-09-17:

1. `src/api/<module>/usecases/<operation>/<operation>.usecase.ts` — the business logic, one
   public `execute(...)`, plus the private helpers and module-scope rules that belong to this
   operation and nothing else.
2. Its db access takes one of two legal shapes, and the choice is about entanglement:
   - **Interface-only** `<operation>.usecase.db.ts` in the same folder: an abstract class
     naming the db methods this usecase uses, declared by indexed access into the existing
     `src/db/**/*.db.interface.ts` so signatures cannot drift, bound in the owning module with
     a typed `useFactory` returning the existing db provider. Reach for this when the queries
     you need are tangled with queries other methods still use.
   - **A real, self-contained db class** owning its own `PrismaService`/`RedisService` and
     `$transaction` calls. Reach for this when the queries are genuinely separable. It can live
     colocated under `src/api/<module>/usecases/<operation>/` — `PSG-16`'s
     `ungiftSale`/`deleteSale` and this refactor's `updateSale` all do — as long as the module
     that registers it is covered by `no-prisma-service-outside-db`'s `pathNot` (as of
     `PSG-16`, that rule's `pathNot` includes `'\.module\.ts$'`, wide enough for a shared
     `<module>-usecases.module.ts` to register several usecases' db classes without a
     per-usecase `*.usecase.db.module.ts`). If a usecase's one real shared read would
     otherwise get duplicated (a cached, non-trivial query another caller also needs), inject
     the existing db service for that read alone rather than forking the query — see `updateSale`'s
     `getOneSale` delegation (D1) for a worked example.
   Skip the artifact entirely when the token you would narrow is already minimal for your use.
3. Anything two callers need — a validator, a cache invalidator, a pure calculation — becomes
   a sibling leaf under `src/api/<module>/shared/`, declared in the owning module and injected
   by both. The usecase never calls back into its owning service; the service's public method
   is a one-line delegate.
4. Declare every module edge the new providers need, including `RedisModule`, even where
   `@Global()` currently makes it optional. `src/app.module.spec.ts` compiles the whole graph
   and will fail the build if an edge is missing.
5. The usecase's tests live beside it in `<operation>.usecase.spec.ts`, provide the real shared
   collaborators over mocked db tokens, and leave the owning service's spec with a single
   delegation test.
