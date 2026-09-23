# PSG-27: Extract `AskService.ask` into `AskQuestionUsecase` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `AskService.ask` and everything that exists only to serve it (6 private
helpers, 2 constants, the logger, the config read) into
`src/api/ask/usecases/ask-question/`, changing no behaviour whatsoever.
`AskService.ask` becomes a one-line delegate; `IAskService`, `AskController`, the DTO,
types, prompts, `context/`, `src/db/**`, `.dependency-cruiser.cjs` and `web/**` are
untouched.

**Architecture:** One new usecase file (`ask-question.usecase.ts`, class
`AskQuestionUsecase`, abstract token `IAskQuestionUsecase`) plus one colocated Nest module
(`ask-question.usecase.module.ts`, class `AskQuestionUsecaseModule`) that imports exactly
`AccountingModule`, `MatchesModule`, `LlmModule`, `RedisModule` and exports only the token
— the PSG-24 one-module-per-usecase shape, which supersedes the ticket's literal "register
in ask.module.ts" wording (spec D3). **There is no `.usecase.db.ts`** (spec D2): this
usecase is service-composition only, and redis here is a rate limiter, not persistence.
Task 1 proves the move is verbatim by running the 21 existing tests, assertion-untouched,
against the delegating service. Task 2 then relocates those tests.

**Tech Stack:** NestJS 12 + Prisma 6 (`src/`), **Vitest 5** + `vitest-mock-extended`
(`npm test` = `vitest run`), `dependency-cruiser` for layering rules. No new dependencies —
if a task seems to need one, stop and escalate.

**Spec of record:** `docs/specs/2026-09-22-psg-27-ask-usecase-extraction-design.md`.
Read D2 (no db file), D4 (comments move verbatim) and D7 (test strategy) before Task 1.

## Global Constraints

- **Pure refactor. No behaviour change.** No new `ErrorCode`, no changed guard order, no
  changed rate-limit key, no changed DTO, no changed signature on `IAskService`. If a task
  appears to require one, stop and escalate — it is a misreading.
- **Comments move with the code they explain, unedited.** Every comment currently on
  `rateLimitKey`'s call site (hour-bucket computed once), above `completeOrReleaseSlot`
  (refund contract), on `releaseRateLimitSlot`, on `enforceRateLimit`'s config note, on the
  season-pinning `Promise.all` entry, and above `toFigures` (figures from context, never the
  model) is load-bearing. Copy verbatim: no deletions, no rewording, no expansion. Write no
  new comments beyond the ones this plan names explicitly.
- **Files never edited in any task:** `src/api/ask/interfaces/ask.service.interface.ts`,
  `src/api/ask/ask.controller.ts`, `src/api/ask/dto/**`, `src/api/ask/types/**`,
  `src/api/ask/prompts/**`, `src/api/ask/context/**`, `src/db/**`, `src/llm/**`,
  `src/redis/**`, `web/**`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`.
- Explicit return types on every function and method, including `Promise<void>`.
  Constructor-injected dependencies are `private readonly` (the `ConfigService` parameter
  is deliberately not `private` — it is read once in the constructor body; keep it that
  way). No single-letter locals. No inline `if` — always braced.
- Jest/vitest structure: a `describe` per condition, `it` titles state only the outcome.
  **Moved blocks keep their existing titles and bodies exactly.**
- **Line numbers drift — re-read every file before editing it.** Refer to symbols, not
  line numbers.
- **Gate after every task, green before proceeding:**
  `npm run lint && npm run typecheck && npm test`. Task 3 adds `npm run lint:deps`,
  `npm run build` and `test -f dist/main.js`. **No task may end with a red suite.** This is
  a refactor and the suite is the only proof it is one.
- Commit after each task (conventional-commits style, `commitlint` is active).

---

## Parallelism

**Backend only. No frontend work exists in this plan — `web/` is not touched by any task.**
There is nothing to parallelise: Tasks 1–2 both edit `ask.service.spec.ts` and build on each
other's wiring. Run sequentially: 1 → 2 → 3.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/api/ask/usecases/ask-question/ask-question.usecase.ts` | `AskQuestionUsecase.execute(...)` + the 6 private helpers + 2 constants + logger + config read |
| `src/api/ask/usecases/ask-question/ask-question.usecase.module.ts` | `AskQuestionUsecaseModule` — imports the 4 service modules, exports `IAskQuestionUsecase` |
| `src/api/ask/usecases/ask-question/ask-question.usecase.spec.ts` | The 21 moved behavioural tests |

**Modified:**

| File | Change |
|---|---|
| `src/api/ask/ask.service.ts` | Loses `ask`'s body, 6 helpers, 2 constants, logger, all deps except the usecase; delegates |
| `src/api/ask/ask.module.ts` | `imports` becomes `[AskQuestionUsecaseModule]`; controller and provider unchanged |
| `src/api/ask/ask.service.spec.ts` | Task 1: wiring only (still 21 tests). Task 2: replaced by a single delegation test |

**Untouched (assert this in Task 3):** the never-edited list in Global Constraints, zero
changed lines in all of them.

---

## Task 1 — Create the usecase + module, make `AskService` a delegate

This is the behaviour-preservation proof. Beyond the three spec-file **wiring** edits, no
assertion and no test title changes in this task — all 21 tests must pass against the
delegating service.

**Files:**
- Create: `src/api/ask/usecases/ask-question/ask-question.usecase.ts`
- Create: `src/api/ask/usecases/ask-question/ask-question.usecase.module.ts`
- Modify: `src/api/ask/ask.service.ts`
- Modify: `src/api/ask/ask.module.ts`
- Modify: `src/api/ask/ask.service.spec.ts` (wiring only)

**Interfaces:**
- Consumes (all already exist, unchanged): `IAccountingService`
  (`src/api/accounting/interfaces/accounting.service.interface.ts`), `IMatchesService`,
  `ILlmService` (`src/llm/llm.service.interface.ts`), `RedisService` + `CACHE_KEYS`
  (`src/redis/`), `ConfigService` (global `ConfigModule`), `buildAskContext`
  (`src/api/ask/context/build-context.ts`), `SYSTEM_PROMPT` (`src/api/ask/prompts/`),
  `AskAnswer`/`AskFigures` (`src/api/ask/types/ask-answer.type.ts`), `AskContext`,
  `formatMatch` (`src/api/matches/formatters/format-match.formatter.ts`),
  `getCurrentSeasonDate` (`src/shared/utils/season.utils.ts`), modules `AccountingModule`,
  `MatchesModule`, `LlmModule`, `RedisModule`.
- Produces (Task 2 relies on these exact names): class `AskQuestionUsecase`,
  abstract token `IAskQuestionUsecase` with
  `execute(userId: UserId, question: string): Promise<AskAnswer>`, module class
  `AskQuestionUsecaseModule`.

- [ ] **Step 1: Create `ask-question.usecase.ts` with the operation moved verbatim**

Create `src/api/ask/usecases/ask-question/ask-question.usecase.ts` as the current contents
of `src/api/ask/ask.service.ts` transformed exactly as follows — nothing else changes. Full
target content:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheKey } from '@psg/shared/cache';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import {
    ILlmService,
    LlmCompletionRequest,
    LlmCompletionResult,
} from '../../../../llm/llm.service.interface';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { RedisService } from '../../../../redis/redis.service';
import { getCurrentSeasonDate } from '../../../../shared/utils/season.utils';
import { IAccountingService } from '../../../accounting/interfaces/accounting.service.interface';
import { formatMatch } from '../../../matches/formatters/format-match.formatter';
import { IMatchesService } from '../../../matches/interfaces/matches.service.interface';
import { buildAskContext } from '../../context/build-context';
import { SYSTEM_PROMPT } from '../../prompts/system-prompt';
import { AskAnswer, AskFigures } from '../../types/ask-answer.type';
import { AskContext } from '../../types/context.type';

const DEFAULT_RATE_LIMIT_PER_HOUR = 20;
const HOUR_IN_SECONDS = 3600;

export abstract class IAskQuestionUsecase {
    abstract execute(userId: UserId, question: string): Promise<AskAnswer>;
}

@Injectable()
export class AskQuestionUsecase implements IAskQuestionUsecase {
    private readonly logger = new Logger(AskQuestionUsecase.name);
    private readonly rateLimitPerHour: number;

    constructor(
        private readonly accountingService: IAccountingService,
        private readonly matchesService: IMatchesService,
        private readonly llmService: ILlmService,
        private readonly redisService: RedisService,
        configService: ConfigService<{ ASK_RATE_LIMIT_PER_HOUR?: number }, true>,
    ) {
        // env.schema.ts validates this as a positive integer at boot, so any
        // value that reaches here is already trustworthy — no parsing or
        // fallback guard needed, just a default for when it's unset.
        this.rateLimitPerHour =
            configService.get('ASK_RATE_LIMIT_PER_HOUR', { infer: true }) ??
            DEFAULT_RATE_LIMIT_PER_HOUR;
    }

    async execute(userId: UserId, question: string): Promise<AskAnswer> {
        // Computed once and threaded through both the increment and the
        // (possible) release below, rather than each call recomputing
        // `new Date()` independently. A request that starts near the top of
        // an hour and fails seconds (or longer) later, after the hour has
        // rolled over, must still release the same bucket it incremented —
        // recomputing at release time would target the next hour's key
        // instead, either silently skipping the refund or stealing a slot
        // from a concurrent request that legitimately started in the new
        // window.
        const rateLimitKey = this.rateLimitKey(userId);

        await this.enforceRateLimit(rateLimitKey);

        const generatedAt = new Date();
        const seasonWindow = getCurrentSeasonDate();
        const seasonStartYear = seasonWindow.start.getUTCFullYear() as SeasonYear;

        const [currentSeason, allTime, amortization, seasonMatches] = await Promise.all([
            this.accountingService.getCurrentSeason(userId),
            this.accountingService.getAllTime(userId),
            this.accountingService.getAmortization(userId, seasonStartYear),
            // Pinned to the same seasonStartYear as getAmortization above, so
            // the match list and the amortization figures cannot disagree
            // about which season the answer is about.
            this.matchesService.getSeasonMatches(seasonStartYear, true),
        ]);

        const matches = seasonMatches.map((match) => formatMatch(match, true));

        const askContext = buildAskContext({
            currentSeason,
            allTime,
            amortization,
            matches,
            seasonWindow,
            generatedAt,
        });

        const completion = await this.completeOrReleaseSlot(rateLimitKey, {
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

    private async enforceRateLimit(rateLimitKey: CacheKey<number>): Promise<void> {
        const count = await this.redisService.incrementWithTtl(
            rateLimitKey,
            HOUR_IN_SECONDS,
        );

        if (count > this.rateLimitPerHour) {
            this.logger.warn(`ask rate limit exceeded count=${count}`);

            throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
        }
    }

    // A failed model call still consumed an hourly slot for zero answers, so
    // give the slot back on every complete() failure, no exceptions.
    // enforceRateLimit() is the only legitimate source of a deliberate
    // non-refund, and it always throws before complete() is ever invoked —
    // so this catch can never see our own limiter's ASK_RATE_LIMITED. The
    // only thing that can throw ASK_RATE_LIMITED from inside complete() is
    // llm.service.ts mapping a Gemini-side 429 (their shared quota across
    // all users, not this user's fault), which should be refunded exactly
    // like a transient 5xx/network error.
    private async completeOrReleaseSlot(
        rateLimitKey: CacheKey<number>,
        request: LlmCompletionRequest,
    ): Promise<LlmCompletionResult> {
        try {
            return await this.llmService.complete(request);
        } catch (error) {
            await this.releaseRateLimitSlot(rateLimitKey);

            throw error;
        }
    }

    private async releaseRateLimitSlot(rateLimitKey: CacheKey<number>): Promise<void> {
        try {
            await this.redisService.decrement(rateLimitKey);
        } catch (error) {
            this.logger.warn(
                `failed to release rate limit slot for key=${rateLimitKey}`,
                error,
            );
        }
    }

    private rateLimitKey(userId: UserId): CacheKey<number> {
        const hourBucket = new Date().toISOString().slice(0, 13);

        return CACHE_KEYS.askRateLimit(userId, hourBucket);
    }

    private buildUserMessage(askContext: AskContext, question: string): string {
        return `Here is the data:\n\n${JSON.stringify(askContext, null, 2)}\n\nQuestion: ${question}`;
    }

    // Figures come straight from the context, never parsed out of the model's
    // prose. The UI renders these, so the authoritative numbers on screen are
    // the database's, not the model's. netProfit is computed once in
    // build-context.ts and shared here, so the tile and the model's prose
    // can never disagree about what "profit" means for a period.
    // AskContext is already correctly branded at the source (build-context.ts
    // casts each value once, where it's actually produced from the
    // already-typed accounting/matches service results) — so this is a plain
    // field mapping with no casts of its own. AskFigures is the wire contract
    // the frontend consumes; it never has to trust a cast made here, because
    // none is made here.
    private toFigures(askContext: AskContext): AskFigures {
        return {
            seasonStartYear: askContext.season.startYear,
            currentSeasonProfit: askContext.currentSeason.netProfit,
            currentSeasonSales:
                askContext.currentSeason.realized?.totalListedValue ?? null,
            currentSeasonTickets:
                askContext.currentSeason.realized?.totalNbTickets ?? null,
            allTimeProfit: askContext.allTime.netProfit,
            allTimeSales: askContext.allTime.realized?.totalListedValue ?? null,
            pendingSales: askContext.currentSeason.pending?.totalListedValue ?? null,
            totalSeasonInvestment: askContext.currentSeason.totalSeasonInvestment,
            amortizationRemaining: askContext.amortization.remaining,
            brokeEven: askContext.amortization.brokeEven,
        };
    }
}
```

The only differences from today's `ask.service.ts` are: class renamed
`AskService` → `AskQuestionUsecase`, method `ask` → `execute`, the `implements` clause, the
abstract token added above the class, `Logger(AskService.name)` →
`Logger(AskQuestionUsecase.name)`, and import paths re-derived for the deeper directory.
**Read the current file first and diff your output against it comment-for-comment** — the
six comments must be byte-identical.

- [ ] **Step 2: Create `ask-question.usecase.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { LlmModule } from '../../../../llm/llm.module';
import { RedisModule } from '../../../../redis/redis.module';
import { AccountingModule } from '../../../accounting/accounting.module';
import { MatchesModule } from '../../../matches/matches.module';
import { AskQuestionUsecase, IAskQuestionUsecase } from './ask-question.usecase';

@Module({
    imports: [AccountingModule, MatchesModule, LlmModule, RedisModule],
    providers: [{ provide: IAskQuestionUsecase, useClass: AskQuestionUsecase }],
    exports: [IAskQuestionUsecase],
})
export class AskQuestionUsecaseModule {}
```

`RedisModule` is mandatory — it is no longer `@Global()`. `ConfigService` needs no import
edge (global `ConfigModule`, same as today).

- [ ] **Step 3: Replace `ask.service.ts` with the thin delegate**

Full target content of `src/api/ask/ask.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';

import { IAskService } from './interfaces/ask.service.interface';
import { AskAnswer } from './types/ask-answer.type';
import { IAskQuestionUsecase } from './usecases/ask-question/ask-question.usecase';

@Injectable()
export class AskService implements IAskService {
    constructor(private readonly askQuestionUsecase: IAskQuestionUsecase) {}

    async ask(userId: UserId, question: string): Promise<AskAnswer> {
        return this.askQuestionUsecase.execute(userId, question);
    }
}
```

(Abstract tokens resolve in Nest without `@Inject` because `emitDecoratorMetadata` emits
the class reference itself as the design-time type — exactly how `SalesService` injects
`IUngiftSaleUsecase` today.)

- [ ] **Step 4: Rewire `ask.module.ts`**

Full target content of `src/api/ask/ask.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { IAskService } from './interfaces/ask.service.interface';
import { AskQuestionUsecaseModule } from './usecases/ask-question/ask-question.usecase.module';

@Module({
    imports: [AskQuestionUsecaseModule],
    controllers: [AskController],
    providers: [{ provide: IAskService, useClass: AskService }],
})
export class AskModule {}
```

The four former imports (`AccountingModule`, `MatchesModule`, `LlmModule`, `RedisModule`)
are removed — they fed only the dependencies that moved (spec D5).

- [ ] **Step 5: Rewire the three construction sites in `ask.service.spec.ts` (wiring only)**

In `describe('AskService')`'s single `beforeEach`, replace:

```ts
service = new AskService(
    accounting,
    matches,
    llm,
    redis,
    new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: 20 }),
);
```

with:

```ts
service = new AskService(
    new AskQuestionUsecase(
        accounting,
        matches,
        llm,
        redis,
        new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: 20 }),
    ),
);
```

In `describe('when ASK_RATE_LIMIT_PER_HOUR is configured')`'s `beforeEach`, replace
`service = new AskService(accounting, matches, llm, redis, new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: 2 }));`
with the same wrap: `service = new AskService(new AskQuestionUsecase(accounting, matches, llm, redis, new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: 2 })));`.

In `describe('when ASK_RATE_LIMIT_PER_HOUR is unset')`'s `beforeEach`, same wrap around
`new ConfigService({})`.

Add the import: `import { AskQuestionUsecase } from './usecases/ask-question/ask-question.usecase';`

**Change no assertion, no title, no fixture in this task.**

- [ ] **Step 6: Run the gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green; `ask.service.spec.ts`'s 21 tests pass with zero assertion edits —
that is the proof the move was verbatim. `src/app.module.spec.ts > …resolves…` passing is
the proof the module wiring is complete (it compiles the whole DI graph, so a forgotten
`RedisModule` edge here fails it).

- [ ] **Step 7: Commit**

```bash
git add src/api/ask/
git commit -m "refactor(ask): extract ask into AskQuestionUsecase with its own module (PSG-27)"
```

**Done when:** the suite is green with assertion-untouched tests running against the
one-line delegate, and `ask.service.ts` is 20 lines.

---

## Task 2 — Move the 21 behavioural tests to the usecase spec; shrink the service spec

**Files:**
- Create: `src/api/ask/usecases/ask-question/ask-question.usecase.spec.ts`
- Modify: `src/api/ask/ask.service.spec.ts`

**Interfaces:**
- Consumes: `AskQuestionUsecase` and `IAskQuestionUsecase` from Task 1 (same constructor
  order: `accounting, matches, llm, redis, configService`).

- [ ] **Step 1: Record the current test count**

Run: `npm test 2>&1 | grep -E "Tests|Test Files"` (or read the vitest summary line).
Write the total `Tests N passed` figure down — after this task it must be exactly **N + 1**.

- [ ] **Step 2: Create `ask-question.usecase.spec.ts` by moving the eight describe blocks**

Copy the entire current body of `src/api/ask/ask.service.spec.ts` (fixtures + all eight
top-level describes) into the new file at
`src/api/ask/usecases/ask-question/ask-question.usecase.spec.ts`, then apply **only**
these edits:

1. **Imports** — adjusted paths only, same symbols:

```ts
import { ConfigService } from '@nestjs/config';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { UserId } from '@psg/shared/ids';

import { AskQuestionUsecase } from './ask-question.usecase';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { IAccountingService } from '../../../accounting/interfaces/accounting.service.interface';
import { IMatchesService } from '../../../matches/interfaces/matches.service.interface';
import { ILlmService } from '../../../../llm/llm.service.interface';
import { RedisService } from '../../../../redis/redis.service';
import type { TimePeriodAccounting } from '../../../accounting/types/time-period-accounting.type';
import type { Amortization } from '../../../accounting/types/amortization.type';
```

2. Top-level `describe('AskService')` → `describe('AskQuestionUsecase')`.
3. `let service: AskService;` → `let usecase: AskQuestionUsecase;`.
4. The three `new AskService(...)` constructions from Task 1 Step 5 become
   `usecase = new AskQuestionUsecase(...)` with the **same five arguments in the same
   order** (the Task 1 wrap is unwrapped one level — the spec now builds the usecase
   directly, no `AskService` in this file at all).
5. **The only edit permitted inside a moved block:** every `service.ask(` becomes
   `usecase.execute(` — same arguments. Every `expect`, every `ErrorCode`, every
   `toHaveBeenCalledWith`, every fake-timer block, every fixture stays byte-identical.
6. The `AskService` import disappears (unused). `import { AskService } from './ask.service'`
   must not appear.

The eight blocks that move, titles verbatim:
`when the question is within the rate limit`, `when the user has exceeded the hourly rate
limit`, `when ASK_RATE_LIMIT_PER_HOUR is configured`, `when ASK_RATE_LIMIT_PER_HOUR is
unset`, `the profit figures`, `when the model call fails` (including both nested describes:
`when releasing the slot also fails`, `when the hour rolls over while the model call is in
flight`), `when fetching matches for the context`, `when the model call fails with a
Gemini-side (provider) rate-limited error`. The explanatory comment above the
Gemini-side block and the one above the `ASK_RATE_LIMIT_PER_HOUR is configured` block move
with them, unedited.

- [ ] **Step 3: Replace `ask.service.spec.ts` with the delegation test**

Full target content of `src/api/ask/ask.service.spec.ts`:

```ts
import { mock, MockProxy } from 'vitest-mock-extended';
import type { UserId } from '@psg/shared/ids';

import { AskService } from './ask.service';
import { IAskQuestionUsecase } from './usecases/ask-question/ask-question.usecase';
import type { AskAnswer } from './types/ask-answer.type';

const USER_ID = 'user-1' as UserId;

describe('AskService', () => {
    let usecase: MockProxy<IAskQuestionUsecase>;
    let service: AskService;

    beforeEach(() => {
        usecase = mock<IAskQuestionUsecase>();
        usecase.execute.mockResolvedValue({
            question: 'How is the season going?',
            answer: 'The season is going.',
            figures: {} as AskAnswer['figures'],
            generatedAt: new Date(),
        });
        service = new AskService(usecase);
    });

    describe('ask', () => {
        it('delegates to the ask-question usecase with the same arguments', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            expect(usecase.execute).toHaveBeenCalledOnceWith(
                USER_ID,
                'How is the season going?',
            );
        });
    });
});
```

- [ ] **Step 4: Run the gate and check the count**

Run: `npm run lint && npm run typecheck && npm test`
Expected: green, and the total `Tests` count is exactly **N + 1** (recorded in Step 1):
21 moved + 1 new delegation test. If the count differs, a block was dropped or duplicated —
diff the moved file against the old one and fix the file, never an assertion.

- [ ] **Step 5: Commit**

```bash
git add src/api/ask/
git commit -m "test(ask): move ask behaviour tests to AskQuestionUsecase spec (PSG-27)"
```

**Done when:** both spec files are green, every `ask` behaviour is asserted against
`usecase.execute`, and the count is N + 1.

---

## Task 3 — Full verification, sweeps, final commit

**Files:** none created or edited — this task reads and runs only. (If a sweep fails, fix
the offending file in the task where the failure belongs, then re-run.)

- [ ] **Step 1: Run the full gate**

Run:
```bash
npm run lint && npm run typecheck && npm run lint:deps && npm test && npm run build
test -f dist/main.js
```
Expected: all green, `dist/main.js` exists (not `dist/src/main.js`). `lint:deps` confirms
no layering violation in the new directory; `npm test` includes `src/app.module.spec.ts`,
the DI-graph net.

- [ ] **Step 2: Comment sweep**

Run: `git diff origin/main... -- src/api/ask/ask.service.ts | grep '^-' | grep '^\s*-\s*//'`
(adjust base to the branch point if not `origin/main`). Every comment line deleted from
`ask.service.ts` must appear, byte-identical, in
`src/api/ask/usecases/ask-question/ask-question.usecase.ts`. Cross-check with
`grep -c '//' src/api/ask/usecases/ask-question/ask-question.usecase.ts` — no comment may
simply disappear.

- [ ] **Step 3: Untouched-list sweep**

Run: `git diff --stat origin/main...` (adjust base as above). Confirm **zero changed
lines** in: `src/api/ask/interfaces/ask.service.interface.ts`,
`src/api/ask/ask.controller.ts`, `src/api/ask/dto/**`, `src/api/ask/types/**`,
`src/api/ask/prompts/**`, `src/api/ask/context/**`, `src/db/**`, `src/llm/**`,
`src/redis/**`, `web/**`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `package.json`.
The only changed files under `src/api/ask/` should be `ask.service.ts`,
`ask.module.ts`, `ask.service.spec.ts` plus the three new usecase files.

- [ ] **Step 4: Leftover-reference sweep**

Run: `grep -n "redisService\|CACHE_KEYS\|ConfigService\|Logger\|enforceRateLimit\|toFigures\|buildUserMessage\|rateLimitKey" src/api/ask/ask.service.ts`
Expected: no matches — every one of those now lives only in the usecase file. Also
`grep -rn "AskService" src/api/ask/usecases/` → no matches (the usecase spec must not
reference the service).

- [ ] **Step 5: Confirm no tech-debt entry is needed**

This extraction defers nothing: there is no db file to justify (spec D2 answers it), no
interim interface, no duplicated helper. If, during the tasks, you encountered a genuine
deferral not covered by the spec, **stop and escalate** rather than silently appending to
`docs/tech-debt.md`.

- [ ] **Step 6: Final commit (if any sweep-driven fix landed)**

```bash
git add -A
git status --porcelain  # empty → nothing to commit; skip this step
git commit -m "refactor(ask): finish ask usecase extraction verification (PSG-27)"
```

**Done when:** all six checks are green, the sweeps hold, and the branch is committed.

---

## Self-Review (plan vs spec)

1. **Spec coverage:** D1 → Task 1 Steps 1–2 (location, naming, module). D2 → no db file
   anywhere in the plan (Global Constraints imply it; the file-structure table lists only
   three new files). D3 → Task 1 Steps 2 & 4 (colocated module supersedes ticket wording;
   `AskModule` imports shrink). D4 → Task 1 Step 1 (verbatim move, 6 helpers, 2 constants,
   logger, config) + Task 3 Step 2 (comment sweep). D5 → Task 1 Steps 3–4 (delegate,
   interface/controller untouched) + Task 2 Step 3 (delegation test). D6 → Task 1 Step 1
   (token signature). D7 → Task 1 Step 5 (wiring-only proof) and Task 2 (move + net +1).
   Verification section → Task 3. Covered.
2. **Placeholder scan:** no TBD/TODO; every code step carries full content or an exact
   mechanical rule keyed to content that exists in the repo (Task 2 Step 2's move rule).
3. **Type consistency:** `IAskQuestionUsecase.execute(userId, question): Promise<AskAnswer>`
   identical in Task 1 (definition), Task 1 Step 3 (delegate call), Task 2 (mock). Constructor
   order `(accounting, matches, llm, redis, configService)` consistent in Task 1 Steps 1/5
   and Task 2 Steps 2/3. `AskQuestionUsecaseModule` name consistent in Tasks 1 and 3.
