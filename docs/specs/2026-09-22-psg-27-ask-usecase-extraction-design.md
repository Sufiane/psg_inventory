# Extract `AskService.ask` into a dedicated usecase — Design

**Date:** 2026-09-22
**Status:** Draft
**Issue:** PSG-27
**Type:** Backend-only refactor. Net-zero at runtime. No API, behavior, or test-contract change.

## Problem

`AskService` (`src/api/ask/ask.service.ts`) is a single method, `ask(userId, question)`,
backed by six private helpers that exist only to serve it — `enforceRateLimit`,
`completeOrReleaseSlot`, `releaseRateLimitSlot`, `rateLimitKey`, `buildUserMessage`,
`toFigures` (the ticket says "5"; the code has 6 — all move either way) — orchestrating
across three injected services (`IAccountingService`,
`IMatchesService`, `ILlmService`) plus redis-backed rate limiting via `RedisService` and a
`ConfigService`-read limit. That is a usecase by the bar the sales module established
(PSG-16 → PSG-17 → PSG-24): one operation that composes collaborators and owns its private
helpers, extractable without changing behavior.

The ticket notes the ask module "isn't expected to grow much further for now". That is not a
reason to skip the extraction — the convention's value is that every operation has the same
shape, not that each operation anticipates siblings. The blast radius is small now, which is
exactly when the move is cheapest.

## Non-goals

- Changing the API request/response shape, rate-limit semantics, cache keys, error codes,
  prompts, or any runtime behavior.
- Extracting anything else (there is nothing else in the ask module).
- Adding a `ask-question.usecase.db.ts` — see D2; the ticket explicitly left this open.
- Frontend changes. None exist — confirmed backend-only (`web/` untouched).
- Touching historical specs (`docs/specs/2026-08-30-ask-a-question-design.md` etc.).

## Design decisions

### D1 — Location and naming: `src/api/ask/usecases/ask-question/`

```
src/api/ask/usecases/ask-question/
  ask-question.usecase.ts          # AskQuestionUsecase class + IAskQuestionUsecase token
  ask-question.usecase.module.ts   # AskQuestionUsecaseModule
  ask-question.usecase.spec.ts     # the moved behavioral tests
```

- Class `AskQuestionUsecase`, token `IAskQuestionUsecase`, module `AskQuestionUsecaseModule`
  — the `<name>` is `ask-question`, matching `AskQuestionDto` and the operation's meaning
  (asking one question), and mirroring the sales naming (`ungift-sale` → `UngiftSaleUsecase`).
- The `usecases/` directory sits inside the api module (`src/api/ask/usecases/`), exactly as
  on sales (`src/api/sales/usecases/`). One usecase per directory, one directory per usecase.

### D2 — No `.usecase.db.ts`: service-composition only (the ticket's open question, answered)

The ticket asked whether a db file is needed at all, or whether "this usecase is
service-composition only". **It is service-composition only.** The usecase injects
`IAccountingService`, `IMatchesService`, `ILlmService`, `RedisService`, and
`ConfigService` directly. Rationale:

1. **There is no ORM access anywhere in this flow.** Every read goes through other api
   services that own their own db tokens. The one persistent-state mutation — the rate-limit
   `incrementWithTtl`/`decrement` — goes through `RedisService`, not Prisma.
2. **Redis here is a rate limiter, not persistence.** In `ungift-sale`/`delete-sale` the
   `.usecase.db.ts` wraps `ISalesDbService` because that is where the data lives. An
   `ask-question.usecase.db.ts` whose entire content is pass-through calls to
   `redisService.incrementWithTtl`/`decrement` would be a file with no boundary of its own —
   it hides nothing and separates nothing. The rate limiter is an application concern *of
   asking a question*: it guards entry to the operation and is refunded when the operation's
   model call fails. It belongs with the operation.
3. **YAGNI, reversible.** If ask ever gains direct Prisma access, the db file is added at
   that point (dependency-cruiser already exempts `*.usecase.db.ts` anywhere in the tree).
   Creating an empty-shaped file now to satisfy a template would be ceremony.

### D3 — Each usecase owns its own colocated module (PSG-24 shape), superseding the ticket's literal wording

The ticket says "register the usecase as a provider in `ask.module.ts`". The repo's newest
convention — PSG-24 (2026-09-22), which split the sales shared usecase module into one
module per usecase — supersedes that wording. **Confirmed with the requester: option A,
colocated `ask-question.usecase.module.ts`.**

```ts
// ask-question.usecase.module.ts
@Module({
    imports: [AccountingModule, MatchesModule, LlmModule, RedisModule],
    providers: [{ provide: IAskQuestionUsecase, useClass: AskQuestionUsecase }],
    exports: [IAskQuestionUsecase],
})
export class AskQuestionUsecaseModule {}
```

- **Imports exactly the four modules whose services the usecase injects.** `RedisModule` is
  required explicitly: it lost `@Global()` in the 2026-09-18 deglobalize refactor, and the
  PSG-24 lesson (D2) is that a usecase module imports precisely what it needs.
- **`ConfigService` needs no import.** It is resolved from the globally registered
  `ConfigModule` — `AskService` already injects it today with no `ConfigModule` edge in
  `AskModule`.
- **Exports only `IAskQuestionUsecase`** (D5). The token is all `AskService` needs; there is
  no db token to keep module-internal because of D2.
- Legal under dependency-cruiser: `no-prisma-service-outside-db` exempts `*.module.ts` and
  nothing here touches Prisma at all; `no-orm-outside-db` has no Prisma imports to catch.

### D4 — Everything moves with the operation, comments verbatim

Moved into `ask-question.usecase.ts` unchanged in substance:

| From `ask.service.ts` | To the usecase |
|---|---|
| `ask()` body | `execute(userId, question)` body |
| `enforceRateLimit`, `completeOrReleaseSlot`, `releaseRateLimitSlot`, `rateLimitKey`, `buildUserMessage`, `toFigures` | private methods of `AskQuestionUsecase`, same names |
| `DEFAULT_RATE_LIMIT_PER_HOUR`, `HOUR_IN_SECONDS` | module-scope constants in the usecase file |
| `Logger` + the `ask answered …` log, the `rate limit exceeded` warn, the `failed to release …` warn | the usecase's own `Logger` (`AskQuestionUsecase.name`) |
| `ConfigService` read of `ASK_RATE_LIMIT_PER_HOUR` | the usecase constructor |

**All comments move unedited.** They are load-bearing: the hour-bucket-computed-once
rationale on `rateLimitKey` threading, the refund-vs-non-refund contract above
`completeOrReleaseSlot` (why our own `ASK_RATE_LIMITED` can never land in that catch but a
Gemini-side 429 must be refunded), and the `toFigures` provenance comment (figures come from
the context, never the model's prose). No comment may be deleted, reworded, or expanded; no
new comments beyond what the move requires.

The only mechanical substitutions inside the moved code are `this.` targets staying the same
(the helpers are now usecase methods calling usecase-injected collaborators of the same
names) and import paths re-derived for the deeper directory
(`../../../../common/...`, `../../../accounting/...`, etc.).

### D5 — `AskService` becomes a thin delegate; `IAskService` and the controller are untouched

```ts
// ask.service.ts (post-extraction)
@Injectable()
export class AskService implements IAskService {
    constructor(private readonly askQuestionUsecase: IAskQuestionUsecase) {}

    async ask(userId: UserId, question: string): Promise<AskAnswer> {
        return this.askQuestionUsecase.execute(userId, question);
    }
}
```

- `IAskService` keeps its single abstract method with the identical signature — the file is
  not edited.
- `AskController` continues to call `IAskService` — not edited. The controller stays thin and
  never sees usecases, matching the sales D3 decision.
- `AskService` loses every other dependency and its `Logger` (it no longer does anything that
  is logged). Explicit return type kept (`async … : Promise<AskAnswer>`), per the PSG-5
  lint rule.

**`AskModule` shrinks to:**

```ts
@Module({
    imports: [AskQuestionUsecaseModule],
    controllers: [AskController],
    providers: [{ provide: IAskService, useClass: AskService }],
})
export class AskModule {}
```

Its current four imports (`AccountingModule`, `MatchesModule`, `LlmModule`, `RedisModule`)
fed only the constructor dependencies that moved into the usecase module. Keeping them would
contradict the PSG-24 principle that module imports state what that module's providers
actually resolve — and would leave `AskModule` reading as though `AskService` still touches
those services. The usecase module imports them itself (D3).

### D6 — `execute` has the same signature as `ask`

```ts
export abstract class IAskQuestionUsecase {
    abstract execute(userId: UserId, question: string): Promise<AskAnswer>;
}
```

Same inputs, same output, same order. No options bag, no context object — nothing about the
extraction changes the operation's contract.

### D7 — Test strategy: move the behavior, prove the delegate, net +1

**Behavior-preservation proof (first).** The existing 21 tests in
`ask.service.spec.ts` run against `AskService` constructed directly with mocks. The first
change wires the real usecase under the service in the spec's `beforeEach` —

```ts
usecase = new AskQuestionUsecase(accounting, matches, llm, redis, configService);
service = new AskService(usecase);
```

— and **edits no assertion and no title**. All 21 tests passing against the one-line
delegate proves the move was verbatim before any test file is reorganized.

**Then move the tests.** All eight describe blocks move to
`ask-question.usecase.spec.ts` with titles and bodies unchanged; the only permitted edit
inside a moved block is `service.ask(…)` → `usecase.execute(…)` (same arguments) and the
top-level `describe('AskService')` → `describe('AskQuestionUsecase')`. The fixtures
(`USER_ID`, `period`, `amortization`) and the `ASK_RATE_LIMIT_PER_HOUR` configured/unset
reconstruction blocks move with them — the config tests belong to the usecase because the
config read moved (D4). The fake-timer hour-rollover test moves as-is.

**`ask.service.spec.ts` afterwards:** one new describe with one test — `ask` delegates to
`IAskQuestionUsecase.execute(userId, question)` once, with the same arguments (mock via
`mock<IAskQuestionUsecase>()`, the existing `vitest-mock-extended` style).

**Counts:** 21 tests move + 1 new delegation test = **22 (net +1)**. Direct class
construction (`new AskQuestionUsecase(…)`) is kept over a Nest testing module — it matches
the existing spec's style and there is no DI behavior to exercise here beyond what
`src/app.module.spec.ts` already covers for the full graph.

## Files affected

### Created

| File | Purpose |
|---|---|
| `src/api/ask/usecases/ask-question/ask-question.usecase.ts` | `AskQuestionUsecase` + `IAskQuestionUsecase`; owns `execute`, the 6 helpers, both constants, the logger |
| `src/api/ask/usecases/ask-question/ask-question.usecase.module.ts` | `AskQuestionUsecaseModule`; imports the four service modules, exports the token |
| `src/api/ask/usecases/ask-question/ask-question.usecase.spec.ts` | The 21 moved behavioral tests |

### Modified

| File | Change |
|---|---|
| `src/api/ask/ask.service.ts` | Loses `ask`'s body, 6 private helpers, 2 constants, logger, 4 deps + ConfigService; delegates to the usecase |
| `src/api/ask/ask.module.ts` | `imports` becomes `[AskQuestionUsecaseModule]`; provider and controller unchanged |
| `src/api/ask/ask.service.spec.ts` | Loses the 8 moved describe blocks and fixtures; gains one delegation test |

### Unchanged

| File | Reason |
|---|---|
| `src/api/ask/interfaces/ask.service.interface.ts` | Same single abstract method |
| `src/api/ask/ask.controller.ts` | Calls `IAskService`, which delegates transparently |
| `src/api/ask/dto/**`, `types/**`, `prompts/**`, `context/**` | Input/output contract and pure helpers stay put; the usecase imports them from `../../../…` |
| `src/db/**`, `src/llm/**`, `src/redis/**`, other api modules | Consumers/providers, not participants |
| `.dependency-cruiser.cjs` | No rule change needed — no Prisma anywhere in this flow |
| `web/**` | Backend-only |

## Data flow (post-extraction)

```
AskController.ask(user.id, question)
  → IAskService.ask(userId, question)
    → AskQuestionUsecase.execute(userId, question)
      → rateLimitKey(userId)                                  [hour bucket, computed once]
      → enforceRateLimit(key)                                 [redis incrementWithTtl → maybe ASK_RATE_LIMITED]
      → Promise.all([
            accountingService.getCurrentSeason(userId),
            accountingService.getAllTime(userId),
            accountingService.getAmortization(userId, seasonStartYear),
            matchesService.getSeasonMatches(seasonStartYear, true),
        ])
      → buildAskContext(...)                                  [pure, stays in ask/context]
      → completeOrReleaseSlot(key, { SYSTEM_PROMPT, buildUserMessage(...) })
            └─ on llm failure: releaseRateLimitSlot(key) then rethrow
      → logger.log("ask answered …")
      → { question, answer, figures: toFigures(context), generatedAt }
```

Identical to today's flow — only the owning class of each step changed.

## Verification

Every phase runs the same gate:

```bash
npm run lint && npm run typecheck && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```

Load-bearing checks:

- **`src/app.module.spec.ts`** compiles the entire DI graph — a missing `imports` entry in
  `AskQuestionUsecaseModule` (e.g. forgetting `RedisModule` now that it is not `@Global()`)
  or a forgotten export fails it with an unresolved dependency.
- **The 21 existing tests pass against the delegating service before any test moves** (D7) —
  that is the behavior-preservation proof, not the final green suite.
- **Test count ends at exactly 22** (21 moved + 1 delegation).
- **Comment sweep:** every comment removed from `ask.service.ts` must appear, identical, in
  `ask-question.usecase.ts`. No comment may simply disappear.
- **Untouched-list sweep:** zero changed lines in `ask.controller.ts`,
  `interfaces/ask.service.interface.ts`, `dto/**`, `types/**`, `prompts/**`, `context/**`,
  `src/db/**`, `web/**`, `.dependency-cruiser.cjs`.

No tsconfig changes. No migration. No new dependencies. No runtime behavior change.
