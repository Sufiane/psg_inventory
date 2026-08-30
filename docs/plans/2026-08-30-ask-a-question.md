# Ask a Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user type a natural-language question about their own ticket-sale data and get a grounded prose answer, backed by the figures it was computed from.

**Architecture:** No RAG, no NL-to-SQL. A pure builder flattens the results of the existing `IAccountingService` and `IMatchesService` methods into a small `AskContext` object; that context plus the question go to Google Gemini in one non-streaming call; the endpoint returns the model's prose *and* the context figures so the UI renders authoritative numbers from the database rather than from model output. The Gemini SDK is confined to one file (`src/llm/llm.service.ts`), mirroring how `FootballDataService` already isolates the football-data API.

**Tech Stack:** NestJS 10, Prisma 6 (untouched — no schema change), Redis (existing, for rate limiting), `@google/genai`, SvelteKit 2 + Svelte 5 runes, Jest.

## Global Constraints

- **Dependency pinning:** every `package.json` entry is an exact version — no `^`, no `~`. After `npm install`, read the resolved version from `package-lock.json` and rewrite the `package.json` entry to that exact string.
- **Hexagonal split:** `*.service.ts` holds business logic and must not import Prisma or the LLM SDK. `src/llm/llm.service.ts` is the only file in the repo permitted to import `@google/genai`. The `ask` module performs no direct database access, so per project convention it has no `*.db.ts`.
- **Provider isolation:** `ILlmService`, `LlmCompletionRequest`, and `LlmCompletionResult` are provider-agnostic and must not gain any Gemini-specific field. Every Gemini detail stays inside `llm.service.ts`.
- **Explicit return types on every backend function and method**, including `Promise<void>`.
- **No single-letter variable names** except `i`/`j`/`k` in indexed `for` loops. Catch parameters are `(error)`, never `(e)`.
- **No inline `if`** — always braced, body on its own line.
- **Blank line before `if`, `for`, `while`, `return`, `throw`** unless it is the first statement in its block.
- **Constructor parameter properties are `readonly`** (`private readonly db: FooDb`).
- **No double negation** (`!!x`); use `x != null` or `Boolean(x)`.
- **Jest structure:** one `describe` per conditional branch, titled "when ...". `it` titles state only the outcome and never repeat the condition. Shared setup goes in that `describe`'s own `beforeEach`.
- **Model:** `gemini-3.7-flash`, non-streaming. Do not substitute a different model without updating spec §3.3.
- **Do not invent SDK identifiers.** Task 5 Step 2 introspects the installed `@google/genai` type declarations and is the authority for the generate-content method name, config field names, and usage field names. Where Step 4's code and Step 2's findings disagree, Step 2 wins and `npm run typecheck` is the gate.
- **Currency is EUR throughout.**
- **Git:** commit after every task. Do not push.

---

## Pre-flight

- [ ] **Confirm the working tree is clean of unrelated changes**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git status --short
```

At the time this plan was written, `package.json` and `package-lock.json` carried an **unrelated, uncommitted NestJS 10 -> 11 major upgrade** (`@nestjs/common` 10.4.8 -> 11.2.1, plus a new `@nestjs/observe` dependency). That change is not part of this feature. Resolve it — commit it separately, or revert it with `git restore package.json package-lock.json && npm ci` — **before** starting Task 1. Installing a new dependency on top of a half-applied major upgrade will produce a `package-lock.json` diff that is impossible to review.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/llm/llm.service.ts` | **Create.** Only file importing `@google/genai`. One method: `complete()`. Maps provider failures to `DomainException`. |
| `src/llm/llm.service.interface.ts` | **Create.** Provider-agnostic abstract class DI token + request/result types. |
| `src/llm/llm.module.ts` | **Create.** Provides and exports `ILlmService`. |
| `src/api/ask/types/context.type.ts` | **Create.** The `AskContext` shape sent to the model. |
| `src/api/ask/context/build-context.ts` | **Create.** Pure function: service results in, `AskContext` out. Allow-list, no I/O. |
| `src/api/ask/context/build-context.spec.ts` | **Create.** Shape, null branches, no-identity-fields assertion. |
| `src/api/ask/prompts/system-prompt.ts` | **Create.** Frozen prompt text. |
| `src/api/ask/ask.service.ts` | **Create.** Orchestration: rate limit, fetch, build context, call, assemble. |
| `src/api/ask/ask.service.spec.ts` | **Create.** All LLM calls mocked. No network in CI. |
| `src/api/ask/interfaces/ask.service.interface.ts` | **Create.** DI token. |
| `src/api/ask/types/ask-answer.type.ts` | **Create.** Endpoint response shape. |
| `src/api/ask/dto/ask-question.dto.ts` | **Create.** `class-validator` length bounds. |
| `src/api/ask/ask.controller.ts` | **Create.** `POST /ask`, `@User()` scoped. |
| `src/api/ask/ask.module.ts` | **Create.** Wires the above. |
| `src/env.schema.ts` | **Modify.** Add `GEMINI_API_KEY` (required), `ASK_RATE_LIMIT_PER_HOUR` (optional). |
| `src/redis/redis.service.ts` | **Modify.** Add atomic `incrementWithTtl()`. |
| `src/redis/CACHE_KEYS.ts` | **Modify.** Add `askRateLimit()`. |
| `src/common/exceptions/error-codes.enum.ts` | **Modify.** Three new codes. |
| `src/common/exceptions/http-exception.mapper.ts` | **Modify.** Map the three new codes. |
| `src/api/accounting/accounting.module.ts` | **Modify.** Export `IAccountingService`. |
| `src/api/matches/matches.module.ts` | **Modify.** Export `IMatchesService`. |
| `src/app.module.ts` | **Modify.** Register `AskModule`; redact API-key headers in pino. |
| `web/src/lib/types.ts` | **Modify.** Add `AskAnswer` / `AskFigures`. |
| `web/src/lib/ui/AskCard.svelte` | **Create.** Input, chips, answer, figures panel. |
| `web/src/routes/(app)/dashboard/+page.server.ts` | **Modify.** Add the `ask` form action. |
| `web/src/routes/(app)/dashboard/+page.svelte` | **Modify.** Mount `AskCard`. |

**Backend/frontend split:** Tasks 1–7 are backend-only and touch no file under `web/`. Task 8 is frontend-only and touches no file under `src/`. Task 8 depends only on the response contract, which is fully specified in Task 6's **Produces** block — so it can be built in parallel against that contract rather than waiting for Task 7. The provider swap does not change this: the frontend never learns which model answered.

---

## Task 1: Configuration and dependency

**Files:**
- Modify: `package.json`
- Modify: `src/env.schema.ts`
- Modify: `.env.example`
- Modify: `src/app.module.ts` (pino redact paths only)

**Interfaces:**
- Consumes: nothing.
- Produces: `GEMINI_API_KEY: string` and `ASK_RATE_LIMIT_PER_HOUR?: string` readable via `ConfigService`. The `@google/genai` package installed at a pinned exact version.

- [ ] **Step 1: Install the SDK and pin it**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npm install @google/genai
```

Then read the resolved version and rewrite `package.json` to the exact string:

```bash
node -p "require('./node_modules/@google/genai/package.json').version"
```

Edit `package.json` so the `dependencies` entry has **no caret**, e.g. `"@google/genai": "1.30.0"` (use whatever version the command above printed). Place it first in `dependencies`, before `@nestjs/common`, matching the file's existing alphabetical ordering.

- [ ] **Step 2: Add the env vars to the schema**

In `src/env.schema.ts`, add to the `EnvironmentVariables` class, after `FOOTBALL_DATA_API_KEY`:

```typescript
    @IsString()
    GEMINI_API_KEY!: string;
```

and after `FRONTEND_ORIGIN`:

```typescript
    // Max /ask questions per user per hour. Defaults to 20 when unset.
    @IsOptional()
    @IsString()
    ASK_RATE_LIMIT_PER_HOUR?: string;
```

`GEMINI_API_KEY` is deliberately required, not optional: a misconfigured deploy must fail at boot rather than 500 on the first question. The key is read through `ConfigService` and passed explicitly to the SDK constructor, so this name is our own convention and does not depend on the SDK's environment auto-discovery behavior.

- [ ] **Step 3: Document them in `.env.example`**

Append to `.env.example`:

```
# Google Gemini API key for the /ask endpoint.
# Free key, no credit card required: https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_key_here

# Max /ask questions per user per hour (optional, defaults to 20).
# The free tier quota is shared across all users of this deployment, so this
# cap protects the whole allowance, not just one user's spend.
ASK_RATE_LIMIT_PER_HOUR=20
```

- [ ] **Step 4: Redact key-bearing headers from logs**

In `src/app.module.ts`, inside the `LoggerModule.forRoot` `redact.paths` array, add two entries after `'req.body.refreshToken'`:

```typescript
                        'req.headers["x-goog-api-key"]',
                        'req.headers["x-api-key"]',
```

- [ ] **Step 5: Verify the app still boots and typechecks**

Set a dummy key first so validation passes locally:

```bash
cd /Users/sufianesouissi/Development/psg_inventory
grep -q GEMINI_API_KEY .env || echo "GEMINI_API_KEY=dummy-key-for-local" >> .env
npm run typecheck
```

Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add package.json package-lock.json src/env.schema.ts .env.example src/app.module.ts
git commit -m "chore: add gemini sdk and ask endpoint configuration"
```

---

## Task 2: Error codes for the ask flow

**Files:**
- Modify: `src/common/exceptions/error-codes.enum.ts`
- Modify: `src/common/exceptions/http-exception.mapper.ts`

**Interfaces:**
- Consumes: `DomainException`, `ErrorCode` from `src/common/exceptions/`.
- Produces: `ErrorCode.ASK_LLM_UNAVAILABLE` (-> 502), `ErrorCode.ASK_RATE_LIMITED` (-> 429), `ErrorCode.ASK_UNANSWERABLE` (-> 422). Throwing `new DomainException(ErrorCode.ASK_RATE_LIMITED)` anywhere now yields a 429 through the existing `AllExceptionsFilter`.

- [ ] **Step 1: Add the codes**

In `src/common/exceptions/error-codes.enum.ts`, add three members at the end of the enum, after `USER_NOT_FOUND`:

```typescript
    ASK_LLM_UNAVAILABLE = 'ask_llm_unavailable',
    ASK_RATE_LIMITED = 'ask_rate_limited',
    ASK_UNANSWERABLE = 'ask_unanswerable',
```

- [ ] **Step 2: Run typecheck to see the mapper break**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npm run typecheck
```

Expected: FAIL. `map` in `http-exception.mapper.ts` is typed `Record<ErrorCode, () => HttpException>`, so adding enum members without map entries is a compile error naming the three missing properties. This is the type system enforcing exhaustiveness — the failure is the test.

- [ ] **Step 3: Map the codes to HTTP statuses**

In `src/common/exceptions/http-exception.mapper.ts`, extend the import from `@nestjs/common` to include `BadGatewayException`, `HttpStatus`, and `UnprocessableEntityException`, preserving the file's existing alphabetical ordering:

```typescript
import {
    BadGatewayException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
```

Then add three entries at the end of the `map` object, after the `USER_NOT_FOUND` entry:

```typescript
    [ErrorCode.ASK_LLM_UNAVAILABLE]: () =>
        new BadGatewayException(ErrorCode.ASK_LLM_UNAVAILABLE),
    [ErrorCode.ASK_RATE_LIMITED]: () =>
        new HttpException(ErrorCode.ASK_RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS),
    [ErrorCode.ASK_UNANSWERABLE]: () =>
        new UnprocessableEntityException(ErrorCode.ASK_UNANSWERABLE),
```

- [ ] **Step 4: Run typecheck to verify it passes**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npm run typecheck
```

Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/common/exceptions/error-codes.enum.ts src/common/exceptions/http-exception.mapper.ts
git commit -m "feat: add error codes for the ask endpoint"
```

---

## Task 3: Redis rate-limit primitive

**Files:**
- Modify: `src/redis/redis.service.ts`
- Modify: `src/redis/CACHE_KEYS.ts`

**Interfaces:**
- Consumes: `BaseRedis` (`protected readonly redis: RedisClientType`), `CacheKey<T>` from `@psg/shared/cache`.
- Produces: `RedisService.incrementWithTtl(key: CacheKey<number>, ttlSeconds: number): Promise<number>` — returns the post-increment count, sets the TTL only on the first increment so the window is fixed rather than sliding. `CACHE_KEYS.askRateLimit(userId: string, hourBucket: string): CacheKey<number>`.

- [ ] **Step 1: Add the cache key builder**

In `src/redis/CACHE_KEYS.ts`, add this entry to the default-exported object, immediately after the `amortization` entry:

```typescript
    askRateLimit: (userId: string, hourBucket: string): CacheKey<number> =>
        `ask:user:id:${userId}:hour:${hourBucket}` as CacheKey<number>,
```

- [ ] **Step 2: Add the atomic increment to RedisService**

In `src/redis/redis.service.ts`, add this method to the `RedisService` class, immediately after `set()`:

```typescript
    // Fixed-window counter. INCR is atomic, so concurrent questions cannot
    // both read a stale count and slip past the cap. The TTL is set only when
    // the counter is created (count === 1) — re-expiring on every hit would
    // turn this into a sliding window that never resets for an active user.
    async incrementWithTtl(key: CacheKey<number>, ttlSeconds: number): Promise<number> {
        const count = await this.redis.incr(key);

        if (count === 1) {
            await this.redis.expire(key, ttlSeconds);
        }

        return count;
    }
```

- [ ] **Step 3: Verify it typechecks**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npm run typecheck
```

Expected: exit 0, no output.

There is no unit test here on purpose: the method is two `redis` calls with no branching logic of our own beyond the `count === 1` guard, and the existing Redis code in this repo is likewise covered through its consumers. Task 6 tests the guard behavior through `AskService` with a mocked `RedisService`.

- [ ] **Step 4: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/redis/redis.service.ts src/redis/CACHE_KEYS.ts
git commit -m "feat: add fixed-window counter to redis service"
```

---

## Task 4: The ask context builder

**Files:**
- Create: `src/api/ask/types/context.type.ts`
- Create: `src/api/ask/context/build-context.ts`
- Test: `src/api/ask/context/build-context.spec.ts`

**Interfaces:**
- Consumes: `TimePeriodAccounting` from `src/api/accounting/types/time-period-accounting.type`, `Amortization` from `src/api/accounting/types/amortization.type`, `FormattedMatch` from `src/api/matches/types/formatted-match.type`.
- Produces: `AskContext` type and `buildAskContext(input: BuildAskContextInput): AskContext`. `AskContext` is what Task 6 serializes into the user message and what Task 6 derives the `figures` block from.

- [ ] **Step 1: Write the failing test**

Create `src/api/ask/context/build-context.spec.ts`:

```typescript
import { buildAskContext } from './build-context';
import type { BuildAskContextInput } from './build-context';
import type { TimePeriodAccounting } from '../../accounting/types/time-period-accounting.type';
import type { Amortization } from '../../accounting/types/amortization.type';
import type { FormattedMatch } from '../../matches/types/formatted-match.type';

const emptyPeriod = {
    realized: null,
    unrealized: null,
    pending: null,
    seasonInvestments: [],
    totalSeasonInvestment: 0,
    leadTime: null,
} as unknown as TimePeriodAccounting;

const populatedPeriod = {
    realized: {
        totalSales: 12,
        totalProfit: 840,
        totalInvest: 300,
        totalNbTickets: 24,
        averageTicketPrice: 95,
        averageProfit: 70,
        highest: {
            price: 260,
            profit: 180,
            match: {
                opponent: 'Marseille',
                date: new Date('2026-03-15T20:00:00.000Z'),
                atHome: true,
                competition: 'CHAMPIONSHIP',
            },
        },
        lowest: {
            price: 60,
            profit: 5,
            match: {
                opponent: 'Lorient',
                date: new Date('2026-01-10T18:00:00.000Z'),
                atHome: true,
                competition: 'CHAMPIONSHIP',
            },
        },
    },
    unrealized: null,
    pending: null,
    seasonInvestments: [
        {
            id: 'pass-1',
            price: 900,
            seasonStartYear: 2025,
            label: 'Auteuil',
            category: 'CAT1',
            row: 'D',
            seat: '12',
        },
    ],
    totalSeasonInvestment: 900,
    leadTime: {
        soldCount: 12,
        avgLeadDays: 6.5,
        medianLeadDays: 5,
        minLeadDays: 1,
        maxLeadDays: 21,
    },
} as unknown as TimePeriodAccounting;

const amortization = {
    seasonStartYear: 2025,
    passPrice: 900,
    hasPass: true,
    totalRealized: 840,
    progress: 0.93,
    remaining: 60,
    surplus: 0,
    breakEven: null,
    perMatch: [],
    passes: [{ id: 'pass-1', label: 'Auteuil', price: 900 }],
} as unknown as Amortization;

const matches: FormattedMatch[] = [
    {
        id: 'match-1',
        date: '2026-03-15T20:00:00.000Z',
        atHome: true,
        competition: 'CHAMPIONSHIP',
        opponent: 'Marseille',
        result: { isWin: true, score: '2-0' },
    },
    {
        id: 'match-2',
        date: '2026-09-01T20:00:00.000Z',
        atHome: false,
        competition: 'CHAMPIONS_LEAGUE',
        opponent: 'Arsenal',
        result: undefined,
    },
];

function makeInput(overrides: Partial<BuildAskContextInput> = {}): BuildAskContextInput {
    return {
        currentSeason: populatedPeriod,
        allTime: populatedPeriod,
        amortization,
        matches,
        seasonWindow: {
            start: new Date('2025-08-01T00:00:00.000Z'),
            end: new Date('2026-07-31T00:00:00.000Z'),
        },
        generatedAt: new Date('2026-03-20T12:00:00.000Z'),
        ...overrides,
    };
}

describe('buildAskContext', () => {
    describe('when the user has sales, a pass and fixtures', () => {
        it('reports the resolved season window as ISO strings', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.season.startDate).toBe('2025-08-01T00:00:00.000Z');
            expect(askContext.season.endDate).toBe('2026-07-31T00:00:00.000Z');
            expect(askContext.season.startYear).toBe(2025);
        });

        it('marks the currency and generation time', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.currency).toBe('EUR');
            expect(askContext.generatedAt).toBe('2026-03-20T12:00:00.000Z');
        });

        it('carries the realized totals for the current season', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.currentSeason.realized).toEqual({
                totalSales: 12,
                totalProfit: 840,
                totalInvest: 300,
                totalNbTickets: 24,
                averageTicketPrice: 95,
                averageProfit: 70,
                highest: {
                    price: 260,
                    profit: 180,
                    opponent: 'Marseille',
                    date: '2026-03-15T20:00:00.000Z',
                    atHome: true,
                    competition: 'CHAMPIONSHIP',
                },
                lowest: {
                    price: 60,
                    profit: 5,
                    opponent: 'Lorient',
                    date: '2026-01-10T18:00:00.000Z',
                    atHome: true,
                    competition: 'CHAMPIONSHIP',
                },
            });
        });

        it('carries the amortization progress', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.amortization).toEqual({
                passPrice: 900,
                hasPass: true,
                totalRealized: 840,
                progress: 0.93,
                remaining: 60,
                surplus: 0,
                brokeEven: false,
            });
        });

        it('splits fixtures into played and upcoming relative to generatedAt', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.matches.played).toEqual([
                {
                    date: '2026-03-15T20:00:00.000Z',
                    opponent: 'Marseille',
                    atHome: true,
                    competition: 'CHAMPIONSHIP',
                    score: '2-0',
                    isWin: true,
                },
            ]);
            expect(askContext.matches.upcoming).toEqual([
                {
                    date: '2026-09-01T20:00:00.000Z',
                    opponent: 'Arsenal',
                    atHome: false,
                    competition: 'CHAMPIONS_LEAGUE',
                },
            ]);
        });

        it('carries the lead time', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.currentSeason.leadTime).toEqual({
                soldCount: 12,
                avgLeadDays: 6.5,
                medianLeadDays: 5,
                minLeadDays: 1,
                maxLeadDays: 21,
            });
        });

        it('never leaks identity fields into the payload', () => {
            const serialized = JSON.stringify(buildAskContext(makeInput()));

            expect(serialized).not.toContain('userId');
            expect(serialized).not.toContain('user_id');
            expect(serialized).not.toContain('email');
            expect(serialized).not.toContain('password');
        });
    });

    describe('when the user has no sales and no pass', () => {
        const input = makeInput({
            currentSeason: emptyPeriod,
            allTime: emptyPeriod,
            amortization: { ...amortization, hasPass: false, passPrice: 0 },
        });

        it('reports null accounting blocks rather than zeroed ones', () => {
            const askContext = buildAskContext(input);

            expect(askContext.currentSeason.realized).toBeNull();
            expect(askContext.currentSeason.unrealized).toBeNull();
            expect(askContext.currentSeason.pending).toBeNull();
        });

        it('reports no season investment', () => {
            const askContext = buildAskContext(input);

            expect(askContext.currentSeason.totalSeasonInvestment).toBe(0);
            expect(askContext.currentSeason.seasonPasses).toEqual([]);
        });

        it('reports the pass as absent', () => {
            const askContext = buildAskContext(input);

            expect(askContext.amortization.hasPass).toBe(false);
        });
    });

    describe('when the season pass has been paid off', () => {
        it('marks brokeEven true', () => {
            const askContext = buildAskContext(
                makeInput({
                    amortization: {
                        ...amortization,
                        breakEven: {
                            matchId: 'match-1',
                            date: new Date('2026-03-15T20:00:00.000Z'),
                            opponent: 'Marseille',
                            cumulative: 910,
                        },
                    } as unknown as Amortization,
                }),
            );

            expect(askContext.amortization.brokeEven).toBe(true);
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npx jest src/api/ask/context/build-context.spec.ts
```

Expected: FAIL — `Cannot find module './build-context'`.

- [ ] **Step 3: Write the context type**

Create `src/api/ask/types/context.type.ts`. Every member type is prefixed `Ask` so the names stay unambiguous when imported elsewhere.

```typescript
export type AskExtreme = {
    price: number;
    profit: number;
    opponent: string;
    date: string;
    atHome: boolean;
    competition: string;
};

export type AskAccounting = {
    totalSales: number;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: number;
    averageTicketPrice: number;
    averageProfit: number;
    highest: AskExtreme | null;
    lowest: AskExtreme | null;
};

export type AskLeadTime = {
    soldCount: number;
    avgLeadDays: number;
    medianLeadDays: number;
    minLeadDays: number;
    maxLeadDays: number;
};

export type AskSeasonPass = {
    label: string;
    category: string;
    price: number;
    seasonStartYear: number;
};

export type AskPeriod = {
    realized: AskAccounting | null;
    unrealized: AskAccounting | null;
    pending: AskAccounting | null;
    seasonPasses: AskSeasonPass[];
    totalSeasonInvestment: number;
    leadTime: AskLeadTime | null;
};

export type AskAmortization = {
    passPrice: number;
    hasPass: boolean;
    totalRealized: number;
    progress: number;
    remaining: number;
    surplus: number;
    brokeEven: boolean;
};

export type AskPlayedMatch = {
    date: string;
    opponent: string;
    atHome: boolean;
    competition: string;
    score: string | undefined;
    isWin: boolean | undefined;
};

export type AskUpcomingMatch = {
    date: string;
    opponent: string;
    atHome: boolean;
    competition: string;
};

// The complete set of facts the model is permitted to reason from. Named for
// its role in the LLM call rather than as a generic point-in-time copy.
export type AskContext = {
    generatedAt: string;
    currency: 'EUR';
    season: {
        startYear: number;
        startDate: string;
        endDate: string;
    };
    currentSeason: AskPeriod;
    allTime: AskPeriod;
    amortization: AskAmortization;
    matches: {
        played: AskPlayedMatch[];
        upcoming: AskUpcomingMatch[];
    };
};
```

- [ ] **Step 4: Write the builder**

Create `src/api/ask/context/build-context.ts`:

```typescript
import type { Amortization } from '../../accounting/types/amortization.type';
import type { TimePeriodAccounting } from '../../accounting/types/time-period-accounting.type';
import type { FormattedMatch } from '../../matches/types/formatted-match.type';
import type {
    AskAccounting,
    AskContext,
    AskExtreme,
    AskPeriod,
    AskPlayedMatch,
    AskUpcomingMatch,
} from '../types/context.type';

export type BuildAskContextInput = {
    currentSeason: TimePeriodAccounting;
    allTime: TimePeriodAccounting;
    amortization: Amortization;
    matches: FormattedMatch[];
    seasonWindow: { start: Date; end: Date };
    generatedAt: Date;
};

type RawExtreme = {
    price: number;
    profit: number;
    match: {
        opponent: string;
        date: Date;
        atHome: boolean;
        competition: string;
    };
};

function toExtreme(raw: RawExtreme | null | undefined): AskExtreme | null {
    if (raw == null) {
        return null;
    }

    return {
        price: raw.price,
        profit: raw.profit,
        opponent: raw.match.opponent,
        date: new Date(raw.match.date).toISOString(),
        atHome: raw.match.atHome,
        competition: raw.match.competition,
    };
}

// Field-by-field allow-list, never a spread of the service result. This is what
// guarantees no identity field can reach the model, and that adding a column to
// Accounting later cannot silently widen what leaves the process.
function toAccounting(raw: TimePeriodAccounting['realized']): AskAccounting | null {
    if (raw == null) {
        return null;
    }

    return {
        totalSales: raw.totalSales,
        totalProfit: raw.totalProfit,
        totalInvest: raw.totalInvest,
        totalNbTickets: raw.totalNbTickets,
        averageTicketPrice: raw.averageTicketPrice,
        averageProfit: raw.averageProfit,
        highest: toExtreme(raw.highest as unknown as RawExtreme),
        lowest: toExtreme(raw.lowest as unknown as RawExtreme),
    };
}

function toPeriod(period: TimePeriodAccounting): AskPeriod {
    return {
        realized: toAccounting(period.realized),
        unrealized: toAccounting(period.unrealized),
        pending: toAccounting(period.pending),
        seasonPasses: period.seasonInvestments.map((pass) => ({
            label: pass.label,
            category: pass.category,
            price: pass.price,
            seasonStartYear: pass.seasonStartYear,
        })),
        totalSeasonInvestment: period.totalSeasonInvestment,
        leadTime:
            period.leadTime == null
                ? null
                : {
                      soldCount: period.leadTime.soldCount,
                      avgLeadDays: period.leadTime.avgLeadDays,
                      medianLeadDays: period.leadTime.medianLeadDays,
                      minLeadDays: period.leadTime.minLeadDays,
                      maxLeadDays: period.leadTime.maxLeadDays,
                  },
    };
}

export function buildAskContext(input: BuildAskContextInput): AskContext {
    const now = input.generatedAt.getTime();
    const played: AskPlayedMatch[] = [];
    const upcoming: AskUpcomingMatch[] = [];

    for (const match of input.matches) {
        const date = new Date(match.date).toISOString();

        if (new Date(match.date).getTime() <= now) {
            played.push({
                date,
                opponent: match.opponent,
                atHome: match.atHome,
                competition: match.competition,
                score: match.result?.score,
                isWin: match.result?.isWin,
            });

            continue;
        }

        upcoming.push({
            date,
            opponent: match.opponent,
            atHome: match.atHome,
            competition: match.competition,
        });
    }

    return {
        generatedAt: input.generatedAt.toISOString(),
        currency: 'EUR',
        season: {
            startYear: input.seasonWindow.start.getUTCFullYear(),
            startDate: input.seasonWindow.start.toISOString(),
            endDate: input.seasonWindow.end.toISOString(),
        },
        currentSeason: toPeriod(input.currentSeason),
        allTime: toPeriod(input.allTime),
        amortization: {
            passPrice: input.amortization.passPrice,
            hasPass: input.amortization.hasPass,
            totalRealized: input.amortization.totalRealized,
            progress: input.amortization.progress,
            remaining: input.amortization.remaining,
            surplus: input.amortization.surplus,
            brokeEven: input.amortization.breakEven != null,
        },
        matches: { played, upcoming },
    };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npx jest src/api/ask/context/build-context.spec.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/api/ask/types/context.type.ts src/api/ask/context/
git commit -m "feat: add ask context builder"
```

---

## Task 5: The Gemini client module

**Files:**
- Create: `src/llm/llm.service.interface.ts`
- Create: `src/llm/llm.service.ts`
- Create: `src/llm/llm.module.ts`

**Interfaces:**
- Consumes: `ConfigService` (`GEMINI_API_KEY` from Task 1), `DomainException` + the three codes from Task 2.
- Produces: abstract class `ILlmService` with `complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>`, where `LlmCompletionRequest = { systemPrompt: string; userMessage: string }` and `LlmCompletionResult = { text: string; inputTokens: number; outputTokens: number }`. `LlmModule` exports `ILlmService`. Task 6 injects and mocks this token.

> **This task contains the only unverified SDK surface in the plan.** Step 2 exists to resolve it from the installed package rather than from recall. Do not skip it.

- [ ] **Step 1: Define the interface and types**

Create `src/llm/llm.service.interface.ts`. Nothing here is Gemini-specific — that is deliberate, so a future provider swap touches only `llm.service.ts`.

```typescript
export type LlmCompletionRequest = {
    systemPrompt: string;
    userMessage: string;
};

export type LlmCompletionResult = {
    text: string;
    inputTokens: number;
    outputTokens: number;
};

export abstract class ILlmService {
    abstract complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
```

- [ ] **Step 2: Introspect the installed SDK and record the real names**

Four things must be established from the installed package before writing the client. Do not proceed on memory.

```bash
cd /Users/sufianesouissi/Development/psg_inventory

# a) The generate-content entry point and its parameter shape
grep -rn "generateContent" node_modules/@google/genai/dist/*.d.ts | head -20

# b) The config field that carries a system instruction
grep -rn "systemInstruction" node_modules/@google/genai/dist/*.d.ts | head -10

# c) The config field that caps output tokens
grep -rn "maxOutputTokens" node_modules/@google/genai/dist/*.d.ts | head -10

# d) The response's token usage fields
grep -rn "usageMetadata\|promptTokenCount\|candidatesTokenCount" node_modules/@google/genai/dist/*.d.ts | head -20
```

If `dist/*.d.ts` is not the right path for the installed version, locate the declarations first:

```bash
node -p "require('./node_modules/@google/genai/package.json').types || require('./node_modules/@google/genai/package.json').typings"
find node_modules/@google/genai -name "*.d.ts" | head
```

Write the four answers down before continuing. Step 4's code is written against the expected names; where the installed package differs, the package wins, and `npm run typecheck` in Step 5 is the gate that proves it.

- [ ] **Step 3: Create the module**

Create `src/llm/llm.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { ILlmService } from './llm.service.interface';
import { LlmService } from './llm.service';

@Module({
    providers: [{ provide: ILlmService, useClass: LlmService }],
    exports: [ILlmService],
})
export class LlmModule {}
```

- [ ] **Step 4: Implement the client**

Create `src/llm/llm.service.ts`. This is the only file in the repo that may import `@google/genai`.

The import and constructor below are confirmed. The `generateContent` call shape and the usage-field reads are written against the names Step 2 looked for — **reconcile them with what Step 2 actually found before running typecheck.**

```typescript
import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DomainException } from '../common/exceptions/domain.exception';
import { ErrorCode } from '../common/exceptions/error-codes.enum';
import {
    ILlmService,
    LlmCompletionRequest,
    LlmCompletionResult,
} from './llm.service.interface';

const MODEL = 'gemini-3.7-flash';

// The system prompt caps answers at a few sentences, so this bounds a runaway
// generation without any risk of truncating a legitimate answer.
const MAX_OUTPUT_TOKENS = 2000;

const TOO_MANY_REQUESTS = 429;

// Provider failures are classified by HTTP status, not by SDK exception class
// name, so this stays correct regardless of how @google/genai names its error
// types across versions.
function extractStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const candidate = error as { status?: unknown; code?: unknown };

    if (typeof candidate.status === 'number') {
        return candidate.status;
    }

    if (typeof candidate.code === 'number') {
        return candidate.code;
    }

    return null;
}

@Injectable()
export class LlmService extends ILlmService {
    private readonly logger = new Logger(LlmService.name);
    private readonly client: GoogleGenAI;

    constructor(configService: ConfigService<{ GEMINI_API_KEY: string }, true>) {
        super();

        // Key passed explicitly rather than relying on SDK env auto-discovery,
        // so GEMINI_API_KEY is our own convention and validated at boot.
        this.client = new GoogleGenAI({
            apiKey: configService.get('GEMINI_API_KEY'),
        });
    }

    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
        const startedAt = Date.now();

        try {
            const response = await this.client.models.generateContent({
                model: MODEL,
                contents: request.userMessage,
                config: {
                    systemInstruction: request.systemPrompt,
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                },
            });

            const text = response.text?.trim() ?? '';

            if (text.length === 0) {
                this.logger.warn('Model returned no text; treating as unanswerable');

                throw new DomainException(ErrorCode.ASK_UNANSWERABLE);
            }

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            this.logger.log(
                `ask completion ok model=${MODEL} in=${inputTokens} out=${outputTokens} ms=${Date.now() - startedAt}`,
            );

            return { text, inputTokens, outputTokens };
        } catch (error) {
            if (error instanceof DomainException) {
                throw error;
            }

            const status = extractStatus(error);

            if (status === TOO_MANY_REQUESTS) {
                this.logger.warn('Provider rate limit hit');

                throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
            }

            this.logger.error(
                `Gemini call failed status=${status ?? 'unknown'}`,
                error,
            );

            throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
        }
    }
}
```

Note the `error instanceof DomainException` re-throw guard first: without it, the `ASK_UNANSWERABLE` thrown inside the `try` would fall through to the classifier below and be reported as a 502.

- [ ] **Step 5: Verify it typechecks**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npm run typecheck
```

Expected: exit 0, no output.

If this fails on `models.generateContent`, `systemInstruction`, `maxOutputTokens`, `response.text`, or `usageMetadata`, the installed package uses different names — go back to Step 2's output and substitute the real ones. Do **not** silence a mismatch with `as any` or by deleting the config: the config carries the system prompt, and losing it silently removes grounding layer 3 from spec §3.4.

- [ ] **Step 6: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/llm/
git commit -m "feat: add gemini llm client module"
```

---

## Task 6: The ask service

**Files:**
- Create: `src/api/ask/prompts/system-prompt.ts`
- Create: `src/api/ask/types/ask-answer.type.ts`
- Create: `src/api/ask/interfaces/ask.service.interface.ts`
- Create: `src/api/ask/ask.service.ts`
- Test: `src/api/ask/ask.service.spec.ts`

**Interfaces:**
- Consumes: `buildAskContext` + `AskContext` (Task 4), `ILlmService` (Task 5), `RedisService.incrementWithTtl` + `CACHE_KEYS.askRateLimit` (Task 3), `IAccountingService`, `IMatchesService`, `getCurrentSeasonDate` from `src/shared/utils/season.utils`.
- Produces: abstract class `IAskService` with `ask(userId: UserId, question: string): Promise<AskAnswer>`. **`AskAnswer` is the endpoint response contract Task 8 renders:**

```typescript
type AskFigures = {
    seasonStartYear: number;
    currentSeasonProfit: number | null;
    currentSeasonSales: number | null;
    currentSeasonTickets: number | null;
    allTimeProfit: number | null;
    allTimeSales: number | null;
    pendingSales: number | null;
    totalSeasonInvestment: number;
    amortizationRemaining: number;
    brokeEven: boolean;
};

type AskAnswer = {
    question: string;
    answer: string;
    figures: AskFigures;
    generatedAt: string;
};
```

- [ ] **Step 1: Write the frozen system prompt**

Create `src/api/ask/prompts/system-prompt.ts`. It must contain no timestamps, IDs, or per-request values — those belong in the user message.

```typescript
// Frozen text. Do not interpolate dates, user data, or any per-request value
// into this string: it is sent as the system instruction on every request and
// must stay identical across calls and across users.
export const SYSTEM_PROMPT = `You answer questions about a single user's Paris Saint-Germain ticket resale inventory.

You will receive a JSON payload containing that user's accounting figures, season pass information, and fixture list. Answer the user's question using only that payload.

Rules:
- Use only values present in the JSON payload. Never estimate, extrapolate, or invent a number.
- If the payload does not contain what is needed to answer, say so plainly and name what is missing. Do not guess. This is a correct and expected outcome, not a failure.
- Never predict future revenue, future sales, or future results. The payload describes what has happened, not what will happen.
- All monetary values are in euros. Format them with a euro sign, for example EUR 1,240.
- Treat the payload's "generatedAt" field as the current date and time.
- "realized" means sales that completed and were paid. "unrealized" means listed value not yet sold. "pending" means sales in progress.
- A season runs from 1 August to 31 July. The exact window is in the payload's "season" field; use it rather than assuming calendar years.
- Answer in two to four sentences of plain prose. No markdown, no bullet points, no headings.
- Be direct and factual. Do not add encouragement, congratulations, or commentary on whether the numbers are good.`;
```

- [ ] **Step 2: Write the answer type and the service interface**

Create `src/api/ask/types/ask-answer.type.ts`:

```typescript
export type AskFigures = {
    seasonStartYear: number;
    currentSeasonProfit: number | null;
    currentSeasonSales: number | null;
    currentSeasonTickets: number | null;
    allTimeProfit: number | null;
    allTimeSales: number | null;
    pendingSales: number | null;
    totalSeasonInvestment: number;
    amortizationRemaining: number;
    brokeEven: boolean;
};

export type AskAnswer = {
    question: string;
    answer: string;
    figures: AskFigures;
    generatedAt: string;
};
```

Create `src/api/ask/interfaces/ask.service.interface.ts`:

```typescript
import type { UserId } from '@psg/shared/ids';
import { AskAnswer } from '../types/ask-answer.type';

export abstract class IAskService {
    abstract ask(userId: UserId, question: string): Promise<AskAnswer>;
}
```

- [ ] **Step 3: Write the failing test**

Create `src/api/ask/ask.service.spec.ts`. Note that it mocks `ILlmService` and therefore knows nothing about Gemini — this test is unchanged by any provider swap.

```typescript
import { ConfigService } from '@nestjs/config';
import { mock, MockProxy } from 'jest-mock-extended';
import type { UserId } from '@psg/shared/ids';

import { AskService } from './ask.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IAccountingService } from '../accounting/interfaces/accounting.service.interface';
import { IMatchesService } from '../matches/interfaces/matches.service.interface';
import { ILlmService } from '../../llm/llm.service.interface';
import { RedisService } from '../../redis/redis.service';
import type { TimePeriodAccounting } from '../accounting/types/time-period-accounting.type';
import type { Amortization } from '../accounting/types/amortization.type';

const USER_ID = 'user-1' as UserId;

const period = {
    realized: {
        totalSales: 12,
        totalProfit: 840,
        totalInvest: 300,
        totalNbTickets: 24,
        averageTicketPrice: 95,
        averageProfit: 70,
        highest: null,
        lowest: null,
    },
    unrealized: null,
    pending: {
        totalSales: 2,
        totalProfit: 40,
        totalInvest: 0,
        totalNbTickets: 3,
        averageTicketPrice: 80,
        averageProfit: 20,
        highest: null,
        lowest: null,
    },
    seasonInvestments: [],
    totalSeasonInvestment: 900,
    leadTime: null,
} as unknown as TimePeriodAccounting;

const amortization = {
    seasonStartYear: 2025,
    passPrice: 900,
    hasPass: true,
    totalRealized: 840,
    progress: 0.93,
    remaining: 60,
    surplus: 0,
    breakEven: null,
    perMatch: [],
    passes: [],
} as unknown as Amortization;

describe('AskService', () => {
    let accounting: MockProxy<IAccountingService>;
    let matches: MockProxy<IMatchesService>;
    let llm: MockProxy<ILlmService>;
    let redis: MockProxy<RedisService>;
    let service: AskService;

    beforeEach(() => {
        accounting = mock<IAccountingService>();
        matches = mock<IMatchesService>();
        llm = mock<ILlmService>();
        redis = mock<RedisService>();

        accounting.getCurrentSeason.mockResolvedValue(period);
        accounting.getAllTime.mockResolvedValue(period);
        accounting.getAmortization.mockResolvedValue(amortization);
        matches.getCurrentSeason.mockResolvedValue([]);
        redis.incrementWithTtl.mockResolvedValue(1);
        llm.complete.mockResolvedValue({
            text: 'You have made EUR 840 this season.',
            inputTokens: 900,
            outputTokens: 40,
        });

        service = new AskService(
            accounting,
            matches,
            llm,
            redis,
            new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: '20' }),
        );
    });

    describe('when the question is within the rate limit', () => {
        it('returns the model answer', async () => {
            const result = await service.ask(USER_ID, 'How is the season going?');

            expect(result.answer).toBe('You have made EUR 840 this season.');
        });

        it('echoes the question back', async () => {
            const result = await service.ask(USER_ID, 'How is the season going?');

            expect(result.question).toBe('How is the season going?');
        });

        it('scopes every accounting call to the requesting user', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            expect(accounting.getCurrentSeason).toHaveBeenCalledWith(USER_ID);
            expect(accounting.getAllTime).toHaveBeenCalledWith(USER_ID);
            expect(accounting.getAmortization).toHaveBeenCalledWith(
                USER_ID,
                expect.any(Number),
            );
        });

        it('returns figures taken from the context, not from the model', async () => {
            const result = await service.ask(USER_ID, 'How is the season going?');

            expect(result.figures.currentSeasonProfit).toBe(840);
            expect(result.figures.currentSeasonSales).toBe(12);
            expect(result.figures.currentSeasonTickets).toBe(24);
            expect(result.figures.allTimeProfit).toBe(840);
            expect(result.figures.pendingSales).toBe(2);
            expect(result.figures.totalSeasonInvestment).toBe(900);
            expect(result.figures.amortizationRemaining).toBe(60);
            expect(result.figures.brokeEven).toBe(false);
        });

        it('never sends identity fields to the model', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            const sent = llm.complete.mock.calls[0][0].userMessage;

            expect(sent).not.toContain(USER_ID);
            expect(sent).not.toContain('userId');
            expect(sent).not.toContain('password');
        });

        it('sends the question and the context in the user message', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            const sent = llm.complete.mock.calls[0][0].userMessage;

            expect(sent).toContain('How is the season going?');
            expect(sent).toContain('"currency": "EUR"');
        });

        it('sends the frozen system prompt', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            const sent = llm.complete.mock.calls[0][0].systemPrompt;

            expect(sent).toContain('Never estimate, extrapolate, or invent a number');
        });
    });

    describe('when the user has exceeded the hourly rate limit', () => {
        beforeEach(() => {
            redis.incrementWithTtl.mockResolvedValue(21);
        });

        it('throws a rate limited domain exception', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                new DomainException(ErrorCode.ASK_RATE_LIMITED),
            );
        });

        it('does not call the model', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow();

            expect(llm.complete).not.toHaveBeenCalled();
        });

        it('does not query accounting', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow();

            expect(accounting.getCurrentSeason).not.toHaveBeenCalled();
        });
    });

    describe('when the model call fails', () => {
        beforeEach(() => {
            llm.complete.mockRejectedValue(
                new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE),
            );
        });

        it('propagates the domain exception unchanged', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE),
            );
        });
    });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npx jest src/api/ask/ask.service.spec.ts
```

Expected: FAIL — `Cannot find module './ask.service'`.

- [ ] **Step 5: Implement the service**

Create `src/api/ask/ask.service.ts`. It imports neither Prisma nor the Gemini SDK.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { ILlmService } from '../../llm/llm.service.interface';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { IAccountingService } from '../accounting/interfaces/accounting.service.interface';
import { IMatchesService } from '../matches/interfaces/matches.service.interface';
import { IAskService } from './interfaces/ask.service.interface';
import { buildAskContext } from './context/build-context';
import { SYSTEM_PROMPT } from './prompts/system-prompt';
import { AskAnswer, AskFigures } from './types/ask-answer.type';
import { AskContext } from './types/context.type';

const DEFAULT_RATE_LIMIT_PER_HOUR = 20;
const HOUR_IN_SECONDS = 3600;

@Injectable()
export class AskService extends IAskService {
    private readonly logger = new Logger(AskService.name);
    private readonly rateLimitPerHour: number;

    constructor(
        private readonly accountingService: IAccountingService,
        private readonly matchesService: IMatchesService,
        private readonly llmService: ILlmService,
        private readonly redisService: RedisService,
        configService: ConfigService<{ ASK_RATE_LIMIT_PER_HOUR?: string }, true>,
    ) {
        super();

        const configured = configService.get('ASK_RATE_LIMIT_PER_HOUR', {
            infer: true,
        });

        this.rateLimitPerHour =
            configured == null
                ? DEFAULT_RATE_LIMIT_PER_HOUR
                : parseInt(configured, 10);
    }

    async ask(userId: UserId, question: string): Promise<AskAnswer> {
        await this.enforceRateLimit(userId);

        const generatedAt = new Date();
        const seasonWindow = getCurrentSeasonDate();
        const seasonStartYear = seasonWindow.start.getUTCFullYear() as SeasonYear;

        const [currentSeason, allTime, amortization, matches] = await Promise.all([
            this.accountingService.getCurrentSeason(userId),
            this.accountingService.getAllTime(userId),
            this.accountingService.getAmortization(userId, seasonStartYear),
            this.matchesService.getCurrentSeason(true),
        ]);

        const askContext = buildAskContext({
            currentSeason,
            allTime,
            amortization,
            matches,
            seasonWindow,
            generatedAt,
        });

        const completion = await this.llmService.complete({
            systemPrompt: SYSTEM_PROMPT,
            userMessage: this.buildUserMessage(askContext, question),
        });

        this.logger.log(
            `ask answered questionChars=${question.length} in=${completion.inputTokens} out=${completion.outputTokens}`,
        );

        return {
            question,
            answer: completion.text,
            figures: this.toFigures(askContext),
            generatedAt: askContext.generatedAt,
        };
    }

    private async enforceRateLimit(userId: UserId): Promise<void> {
        const hourBucket = new Date().toISOString().slice(0, 13);
        const key = CACHE_KEYS.askRateLimit(userId, hourBucket);
        const count = await this.redisService.incrementWithTtl(key, HOUR_IN_SECONDS);

        if (count > this.rateLimitPerHour) {
            this.logger.warn(`ask rate limit exceeded count=${count}`);

            throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
        }
    }

    private buildUserMessage(askContext: AskContext, question: string): string {
        return `Here is the data:\n\n${JSON.stringify(askContext, null, 2)}\n\nQuestion: ${question}`;
    }

    // Figures come straight from the context, never parsed out of the model's
    // prose. The UI renders these, so the authoritative numbers on screen are
    // the database's, not the model's.
    private toFigures(askContext: AskContext): AskFigures {
        return {
            seasonStartYear: askContext.season.startYear,
            currentSeasonProfit: askContext.currentSeason.realized?.totalProfit ?? null,
            currentSeasonSales: askContext.currentSeason.realized?.totalSales ?? null,
            currentSeasonTickets:
                askContext.currentSeason.realized?.totalNbTickets ?? null,
            allTimeProfit: askContext.allTime.realized?.totalProfit ?? null,
            allTimeSales: askContext.allTime.realized?.totalSales ?? null,
            pendingSales: askContext.currentSeason.pending?.totalSales ?? null,
            totalSeasonInvestment: askContext.currentSeason.totalSeasonInvestment,
            amortizationRemaining: askContext.amortization.remaining,
            brokeEven: askContext.amortization.brokeEven,
        };
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npx jest src/api/ask/ask.service.spec.ts
```

Expected: PASS, 13 tests. No network call is made — `ILlmService` is fully mocked.

- [ ] **Step 7: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/api/ask/
git commit -m "feat: add ask service with grounded context and rate limiting"
```

---

## Task 7: Controller, DTO and module wiring

**Files:**
- Create: `src/api/ask/dto/ask-question.dto.ts`
- Create: `src/api/ask/ask.controller.ts`
- Create: `src/api/ask/ask.module.ts`
- Modify: `src/api/accounting/accounting.module.ts`
- Modify: `src/api/matches/matches.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `IAskService` (Task 6), `LlmModule` (Task 5), `@User()` decorator and `AuthenticatedUser` from `src/shared/`.
- Produces: `POST /ask` accepting `{ "question": string }` and returning the `AskAnswer` JSON from Task 6. Protected by the global `JwtAuthGuard`; no `RolesGuard`.

- [ ] **Step 1: Write the DTO**

Create `src/api/ask/dto/ask-question.dto.ts`:

```typescript
import { IsString, Length } from 'class-validator';

export class AskQuestionDto {
    // Bounded before any provider call: an empty or oversized question is
    // rejected by validation and never consumes free-tier quota.
    @IsString()
    @Length(3, 500)
    question!: string;
}
```

- [ ] **Step 2: Write the controller**

Create `src/api/ask/ask.controller.ts`, following the shape of `AccountingController`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';

import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { AskQuestionDto } from './dto/ask-question.dto';
import { IAskService } from './interfaces/ask.service.interface';
import { AskAnswer } from './types/ask-answer.type';

@Controller('ask')
export class AskController {
    constructor(private readonly askService: IAskService) {}

    @Post('/')
    async ask(
        @User() user: AuthenticatedUser,
        @Body() { question }: AskQuestionDto,
    ): Promise<AskAnswer> {
        return await this.askService.ask(user.id, question);
    }
}
```

- [ ] **Step 3: Export the services the ask module needs**

`AccountingModule` and `MatchesModule` currently provide their services without exporting them, so nothing outside those modules can inject them. Add an `exports` array to each.

In `src/api/accounting/accounting.module.ts`, add after the `providers` array:

```typescript
    exports: [IAccountingService],
```

In `src/api/matches/matches.module.ts`, add after the `providers` array:

```typescript
    exports: [IMatchesService],
```

- [ ] **Step 4: Create the ask module**

Create `src/api/ask/ask.module.ts`. `RedisModule` is `@Global()`, so `RedisService` needs no import here.

```typescript
import { Module } from '@nestjs/common';

import { LlmModule } from '../../llm/llm.module';
import { AccountingModule } from '../accounting/accounting.module';
import { MatchesModule } from '../matches/matches.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { IAskService } from './interfaces/ask.service.interface';

@Module({
    imports: [AccountingModule, MatchesModule, LlmModule],
    controllers: [AskController],
    providers: [{ provide: IAskService, useClass: AskService }],
})
export class AskModule {}
```

- [ ] **Step 5: Register it in the app module**

In `src/app.module.ts`, add the import at the top alongside the other module imports:

```typescript
import { AskModule } from './api/ask/ask.module';
```

and add `AskModule,` to the `imports` array, after `HealthModule,`.

- [ ] **Step 6: Verify the whole suite and the build**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: typecheck exit 0, lint exit 0 with no warnings, all Jest suites passing, `nest build` succeeding. A Nest DI resolution error at build time means a missing `exports` entry from Step 3.

- [ ] **Step 7: Smoke test the endpoint against a running server**

Get a free key from https://aistudio.google.com/apikey, put it in `.env` as `GEMINI_API_KEY`. With a seeded database and `npm run start:dev` running, obtain a JWT via the login route and then:

```bash
curl -s -X POST http://localhost:7777/ask \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is my all-time revenue?"}' | jq
```

Expected: HTTP 200, a JSON body with `question`, `answer` (two to four sentences of prose), `figures`, and `generatedAt`. Cross-check `figures.allTimeProfit` against the `/accounting/all-time` response — they must be identical, since both come from the same service method.

Then run the eight acceptance questions from spec §4.1, including the refusal case:

```bash
curl -s -X POST http://localhost:7777/ask \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"question":"What will next seasons revenue be?"}' | jq -r .answer
```

Expected: an explicit statement that this cannot be answered from the available data, containing no invented figure.

- [ ] **Step 8: Check the real free-tier quota**

Open the Google AI Studio dashboard for the key and read the actual per-minute and per-day request limits. Spec §6 open question 5 flags that the default `ASK_RATE_LIMIT_PER_HOUR=20` was chosen conservatively without knowing them. If the real quota is materially lower, lower the default in `.env.example` and note the observed numbers in the spec so the next person is not guessing either.

- [ ] **Step 9: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add src/api/ask/ src/api/accounting/accounting.module.ts src/api/matches/matches.module.ts src/app.module.ts
git commit -m "feat: expose POST /ask endpoint"
```

---

## Task 8: Frontend entry point

**Files:**
- Modify: `web/src/lib/types.ts`
- Create: `web/src/lib/ui/AskCard.svelte`
- Modify: `web/src/routes/(app)/dashboard/+page.server.ts`
- Modify: `web/src/routes/(app)/dashboard/+page.svelte`

**Interfaces:**
- Consumes: the `AskAnswer` contract from Task 6, the `api` helper from `$lib/api`, `Button` and `Spinner` from `$lib/ui/`.
- Produces: an "Ask" card on the dashboard. No new route.

This task is provider-agnostic — nothing here knows or cares that Gemini produced the prose.

- [ ] **Step 1: Add the response types**

In `web/src/lib/types.ts`, append:

```typescript
export type AskFigures = {
    seasonStartYear: number;
    currentSeasonProfit: number | null;
    currentSeasonSales: number | null;
    currentSeasonTickets: number | null;
    allTimeProfit: number | null;
    allTimeSales: number | null;
    pendingSales: number | null;
    totalSeasonInvestment: number;
    amortizationRemaining: number;
    brokeEven: boolean;
};

export type AskAnswer = {
    question: string;
    answer: string;
    figures: AskFigures;
    generatedAt: string;
};
```

- [ ] **Step 2: Add the form action**

In `web/src/routes/(app)/dashboard/+page.server.ts`, add the imports and an `actions` export. Keep the existing `load` untouched.

```typescript
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { api } from '$lib/api';
import type { AskAnswer, FormattedMatch, TimePeriodAccounting } from '$lib/types';

export const load: PageServerLoad = (event) => {
    // Streamed: both fly to the client independently and the page shell
    // renders immediately with skeletons in their slots.
    const accounting = api<TimePeriodAccounting>(event, '/accounting/current-season');
    const matches = api<FormattedMatch[]>(
        event,
        '/matches/current-season?withResult=true',
    );

    return { accounting, matches };
};

export const actions: Actions = {
    ask: async (event) => {
        const form = await event.request.formData();
        const question = String(form.get('question') ?? '').trim();

        if (question.length < 3) {
            return fail(400, { question, message: 'Ask a longer question.' });
        }

        try {
            const answer = await api<AskAnswer>(event, '/ask', {
                method: 'POST',
                json: { question },
            });

            return { answer };
        } catch (error) {
            const status = (error as { status?: number }).status ?? 500;
            const message =
                status === 429
                    ? 'Too many questions for now. Try again in a little while.'
                    : 'Could not answer that right now. Try again.';

            return fail(status, { question, message });
        }
    },
};
```

- [ ] **Step 3: Build the card**

Create `web/src/lib/ui/AskCard.svelte`. The figures panel is the anti-hallucination backstop from spec §3.4 — it renders numbers from structured data, never parsed from the prose.

```svelte
<script lang="ts">
    import { enhance } from '$app/forms';
    import Button from '$lib/ui/Button.svelte';
    import Spinner from '$lib/ui/Spinner.svelte';
    import type { AskAnswer } from '$lib/types';

    let {
        answer = null,
        message = null,
        question = '',
    }: {
        answer?: AskAnswer | null;
        message?: string | null;
        question?: string;
    } = $props();

    let pending = $state(false);
    let value = $state(question);

    const examples = [
        'How is the current season going?',
        'What is my all-time revenue?',
        'Have I broken even on my season pass?',
    ];

    function money(amount: number | null): string {
        if (amount === null) {
            return '—';
        }

        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
        }).format(amount);
    }
</script>

<section class="rounded-2xl border border-subtle bg-surface p-5">
    <h2 class="text-sm font-semibold text-ink">Ask about your data</h2>

    <form
        method="POST"
        action="?/ask"
        class="mt-3 flex gap-2"
        use:enhance={() => {
            pending = true;

            return async ({ update }) => {
                await update({ reset: false });
                pending = false;
            };
        }}
    >
        <input
            name="question"
            bind:value
            placeholder="How is the current season going?"
            maxlength="500"
            class="min-w-0 flex-1 rounded-lg border border-subtle bg-transparent px-3 py-2 text-sm text-ink"
        />
        <Button type="submit" disabled={pending}>
            {#if pending}
                <Spinner />
            {:else}
                Ask
            {/if}
        </Button>
    </form>

    <div class="mt-2 flex flex-wrap gap-2">
        {#each examples as example (example)}
            <button
                type="button"
                onclick={() => (value = example)}
                class="rounded-full border border-subtle px-3 py-1 text-xs text-ink-muted hover:text-ink"
            >
                {example}
            </button>
        {/each}
    </div>

    {#if message}
        <p class="mt-4 text-sm text-negative">{message}</p>
    {/if}

    {#if answer}
        <p class="mt-4 text-sm leading-relaxed text-ink">{answer.answer}</p>

        <!-- Rendered from the API's structured figures, not from the prose
             above, so the numbers on screen are always the database's. -->
        <dl class="mt-4 grid grid-cols-2 gap-3 border-t border-subtle pt-4 sm:grid-cols-4">
            <div>
                <dt class="text-xs text-ink-muted">Season profit</dt>
                <dd class="text-sm font-medium text-ink">
                    {money(answer.figures.currentSeasonProfit)}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-ink-muted">All-time profit</dt>
                <dd class="text-sm font-medium text-ink">
                    {money(answer.figures.allTimeProfit)}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-ink-muted">Season sales</dt>
                <dd class="text-sm font-medium text-ink">
                    {answer.figures.currentSeasonSales ?? '—'}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-ink-muted">Left to amortize</dt>
                <dd class="text-sm font-medium text-ink">
                    {money(answer.figures.amortizationRemaining)}
                </dd>
            </div>
        </dl>
    {/if}
</section>
```

If `border-subtle`, `bg-surface`, `text-ink`, `text-ink-muted`, or `text-negative` are not the token names this project's Tailwind theme uses, substitute the equivalents already used in `web/src/lib/ui/AccountingCard.svelte` rather than inventing new ones.

- [ ] **Step 4: Mount it on the dashboard**

In `web/src/routes/(app)/dashboard/+page.svelte`, add to the `<script>` block:

```typescript
    import AskCard from '$lib/ui/AskCard.svelte';
    import type { ActionData } from './$types';
```

Extend the props destructure to take the form result:

```typescript
    let { data, form }: { data: PageData; form: ActionData } = $props();
```

Then place the card near the top of the page markup, above the accounting cards:

```svelte
<AskCard
    answer={form && 'answer' in form ? form.answer : null}
    message={form && 'message' in form ? form.message : null}
    question={form && 'question' in form ? form.question : ''}
/>
```

- [ ] **Step 5: Verify the frontend builds**

```bash
cd /Users/sufianesouissi/Development/psg_inventory/web
npm run check && npm run build
```

Expected: `svelte-check` reporting 0 errors, and a successful build.

- [ ] **Step 6: Verify it works in the browser**

With the backend running and logged in, open the dashboard. Click the "What is my all-time revenue?" chip, submit, and confirm: prose appears within a few seconds, the figures panel populates, and the "All-time profit" tile matches the number shown on the accounting page. Submit an empty question and confirm the validation message appears without a network call to the provider.

- [ ] **Step 7: Commit**

```bash
cd /Users/sufianesouissi/Development/psg_inventory
git add web/src/lib/types.ts web/src/lib/ui/AskCard.svelte "web/src/routes/(app)/dashboard/+page.server.ts" "web/src/routes/(app)/dashboard/+page.svelte"
git commit -m "feat: add ask card to the dashboard"
```

---

## Spec Coverage Check

| Spec section | Covered by |
|---|---|
| §1 RAG rejected, context-stuffing chosen | Architecture of Tasks 4–6: `AskContext` + single call, no vector store, no SQL generation |
| §2.1 `POST /ask`, per-user scoping | Task 7 (controller, `@User()`, no `RolesGuard`) |
| §2.1 One question, no history | Task 6 (`ask()` takes a single question; no conversation state) |
| §2.2 Read-only, no writes | No task grants the model tools; the model only receives text |
| §3.1 Module layout, SDK isolation | Tasks 5–7 |
| §3.2 `AskContext`, allow-list, no identity fields | Task 4 (builder + leak test), Task 6 (service-level leak test) |
| §3.3 Provider, client init, model, generation config | Task 5 (Step 2 introspection resolves the unverified names) |
| §3.4 Grounding layers 1–3 | Layer 1: Task 6 service composition. Layer 2: `figures` in Tasks 6 and 8. Layer 3: Task 6 system prompt, asserted in Task 6 Step 3 |
| §3.5 Auth and scoping | Task 7 |
| §3.6 Failure handling, rate limiting, logging | Tasks 2, 3, 5, 6 |
| §3.7 Configuration | Task 1 |
| §3.8 Frontend entry point | Task 8 |
| §4.1 Eight acceptance questions | Task 7 Step 7 (live), Task 6 (deterministic parts) |
| §4.2 Test strategy | Tasks 4 and 6 |
| §5 Phasing | Phase 1 only; `ILlmService` is shaped so phase 3 adds a method rather than replacing the module |
| §6 open question 4 (SDK surface) | Task 5 Step 2 |
| §6 open question 5 (free-tier limits) | Task 7 Step 8 |
