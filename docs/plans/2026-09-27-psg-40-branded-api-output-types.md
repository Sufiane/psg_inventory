# PSG-40: Brand the five outlier API-output types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retype the numeric fields of five backend API-output types (plus their db-row enabler and the one unbranded frontend mirror field) from plain `number` to the existing branded types, threading every mapping/serialization site so brands carry straight through instead of being narrowed/widened at boundaries.

**Architecture:** Pure type-level refactor. Brands (`SeasonYear`, `SeasonPassPrice`, `Profit`, `Invest`, `ListedPrice`, `TicketCount`) live in `shared/src/*.d.ts` and are imported via `@psg/shared/*`. The db `SeasonPass` row type gains the brands first (enabling pass-through services), then each API-output type is retyped and its producers/aggregators get a single cast where a value is computed (never where it is merely read). The frontend mirror change is one field in one file and is fully independent of the backend.

**Tech Stack:** TypeScript 6 (strict, `exactOptionalPropertyTypes`), NestJS backend (`src/`), SvelteKit frontend (`web/`), Vitest, ESLint, commitlint (conventional).

**Spec:** `docs/specs/2026-09-27-psg-40-branded-api-output-types-design.md` — this plan argues from the spec; executors read both.

## Global Constraints

- **Type-level only.** No runtime behavior may change: no JSON shape, cache key, TTL, decorator, formula, or control-flow change. `as` casts and type annotations emit no JavaScript; the only non-type edits allowed are *deleting* now-identity casts.
- **Cast convention:** cast once, at the point the value is first produced (computed aggregate, zero literal, raw-year derivation) — never cast at consumers. Keep the file's existing comment style next to any non-obvious cast (see `build-context.ts` `totalSales` for the house pattern).
- **Branded imports** come from `@psg/shared/time` (`SeasonYear`), `@psg/shared/money` (`SeasonPassPrice`, `Profit`, `Invest`, `ListedPrice`), `@psg/shared/counts` (`TicketCount`), always `import type`.
- **Do NOT "fix" the deliberate plain-`number` survivors** listed in the spec's Non-goals/Verification (`Amortization.remaining/progress/surplus`, `AskAmortization.*`, `AskAccounting.*`, `AskExtreme.price`, `CACHE_KEYS` params, `AmortizationCard.svelte` prop, `web/src/routes/+page.server.ts` showcase field, `scripts/seed-e2e.ts`).
- **Commits:** conventional format, one per task, e.g. `refactor(psg-40): <what changed>` (commitlint config-conventional; `refactor` is a valid type, scope is free-form).
- **Verification commands** (run from repo root unless noted):
  - Backend: `npm run typecheck && npm run lint && npm run lint:deps && npm test`
  - Frontend: `cd web && npm run typecheck && npm run check && npm test`
- Task order: Task 1 must land before Tasks 2–5 (it is the structural enabler). Tasks 2, 3, 4, 5 are independent of each other but each is verified green before the next starts. Task 6 (frontend) is independent of Tasks 1–5 and may run in parallel. Task 7 is last.

---

### Task 1: db `SeasonPass` row carries `SeasonYear` / `SeasonPassPrice`

**Files:**
- Modify: `src/db/season-passes/type/season-pass.type.ts`
- Modify (typecheck fallout): `src/api/sales/test-support/sales.fixtures.ts:64-78`
- Modify (typecheck fallout): `src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts:36-49`
- Modify (typecheck fallout): `src/api/sales/sales.service.spec.ts:252`, `src/api/sales/shared/sale-allocations.validator.spec.ts:41,94,126`, `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts:909`, `src/api/sales-import/sales-import.service.spec.ts:127`, `src/api/sales-import/shared/import-passes.validator.spec.ts:80`

**Interfaces:**
- Consumes: `SeasonPasses` (Prisma model), `Override` from `@psg/shared/brand`, `SeasonYear`/`SeasonPassPrice` from `@psg/shared/*`.
- Produces: db `SeasonPass` with `seasonStartYear: SeasonYear` and `price: SeasonPassPrice` — every later task (2–5) that reads a pass field relies on this. Structurally identical to the api `SeasonPass` retyped in Task 4, which is what makes `SeasonPassesService`'s pass-throughs type-exact.

- [x] **Step 1: Retype the db row**

Replace `src/db/season-passes/type/season-pass.type.ts` with:

```ts
import { SeasonPasses } from '@prisma/client';
import type { Override } from '@psg/shared/brand';
import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';

export type SeasonPass = Override<
    SeasonPasses,
    {
        id: SeasonPassId;
        userId: UserId;
        seasonStartYear: SeasonYear;
        price: SeasonPassPrice;
    }
>;
```

- [x] **Step 2: Run typecheck and read the fallout**

Run: `npm run typecheck`
Expected: errors ONLY in these three shapes (nothing else should break — every other `SeasonPass` fixture already ends in `as SeasonPass`, and the Prisma call sites in `season-passes.db.ts` already assert):
1. `sales.fixtures.ts` `passFixture` — bare literal no longer assignable to `SeasonPass`.
2. `get-amortization.usecase.spec.ts` `pass(price: number)` — `price` plain vs branded field.
3. The seven `passFixture({ seasonStartYear: <n> })` override call sites listed in Step 5 — plain number into `Partial<SeasonPass>` (three of them are multiline call sites, which is why they are enumerated rather than grepped).

- [x] **Step 3: Fix `sales.fixtures.ts`**

In `passFixture` (line 64), append ` as SeasonPass` to the returned object literal (the object already ends `};` — it becomes `} as SeasonPass;`), matching the `as SeasonPass` pattern used by the other four fixtures in the repo. No import changes needed.

- [x] **Step 4: Fix `get-amortization.usecase.spec.ts`'s `pass` helper**

Change line 41 from `price,` to:

```ts
        price: price as SeasonPassPrice,
```

Add at the top: `import type { SeasonPassPrice } from '@psg/shared/money';`

- [x] **Step 5: Fix the seven plain-override call sites**

Each site is a `passFixture({ seasonStartYear: <n> })` override passing a bare
number; fix each by casting the literal (add
`import type { SeasonYear } from '@psg/shared/time';` to any file that lacks it):

| # | File | Line | Literal |
|---|------|------|---------|
| 1 | `src/api/sales/sales.service.spec.ts` | 252 | `2023` |
| 2 | `src/api/sales/shared/sale-allocations.validator.spec.ts` | 41 | `2024` |
| 3 | `src/api/sales/shared/sale-allocations.validator.spec.ts` | 94 (multiline object, 92–95) | `2024` |
| 4 | `src/api/sales/shared/sale-allocations.validator.spec.ts` | 126 | `2024` |
| 5 | `src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts` | 909 | `2023` |
| 6 | `src/api/sales-import/sales-import.service.spec.ts` | 127 (multiline object, 125–128) | `2024` |
| 7 | `src/api/sales-import/shared/import-passes.validator.spec.ts` | 80 (multiline object, 78–81) | `2023` |

Pattern: `passFixture({ seasonStartYear: 2024 })` → `passFixture({ seasonStartYear: 2024 as SeasonYear })`.

If `npm run typecheck` reports any further plain-number-into-brand errors in files that construct `SeasonPass` objects, fix each the same way: cast the literal at its site.

- [x] **Step 6: Verify green**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean — no runtime code changed, so all suites pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/db/season-passes/type/season-pass.type.ts src/api/sales/test-support/sales.fixtures.ts \
  src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts \
  src/api/sales/sales.service.spec.ts src/api/sales/shared/sale-allocations.validator.spec.ts \
  src/api/sales/usecases/update-sale/update-sale.usecase.spec.ts \
  src/api/sales-import/sales-import.service.spec.ts src/api/sales-import/shared/import-passes.validator.spec.ts
git commit -m "refactor(psg-40): brand db SeasonPass row seasonStartYear and price"
```

---

### Task 2: `SeasonInvestment` / `TimePeriodAccounting` + ask-context threading

**Files:**
- Modify: `src/api/accounting/types/time-period-accounting.type.ts`
- Modify: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts:87-96,119`
- Modify: `src/api/ask/types/context.type.ts:36-44`
- Modify: `src/api/ask/context/build-context.ts:90-94`
- Modify (typecheck fallout): `src/api/accounting/accounting.service.spec.ts:72,107,139`, `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts:231`

**Interfaces:**
- Consumes: branded db `SeasonPass` (Task 1) — the `seasonInvestments` map and the filter/reduce read `pass.price`/`pass.seasonStartYear` straight through.
- Produces: `SeasonInvestment { price: SeasonPassPrice; seasonStartYear: SeasonYear }`, `TimePeriodAccounting { totalSeasonInvestment: SeasonPassPrice }`, `AskSeasonPass { price: SeasonPassPrice; seasonStartYear: SeasonYear }`. Task 3's build-context reads are unaffected (they widen); Task 7's greps check this task.

- [x] **Step 1: Retype the accounting types**

In `src/api/accounting/types/time-period-accounting.type.ts`, add:

```ts
import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
```

and change:

```ts
export type SeasonInvestment = {
    id: string;
    price: SeasonPassPrice;
    seasonStartYear: SeasonYear;
    label: string;
    category: string;
    row: string;
    seat: string;
};
```

and in `TimePeriodAccounting`: `totalSeasonInvestment: SeasonPassPrice;`

- [x] **Step 2: Run typecheck to see the full fallout**

Run: `npm run typecheck`
Expected errors in: `get-season-accounting.usecase.ts` (ternary + fallback), `build-context.ts` (`SeasonPassPrice` → `TotalInvestment` is not a legal single-step assertion), `accounting.service.spec.ts` (×3), `get-season-accounting.usecase.spec.ts` (×1). The `seasonInvestments` map in the usecase must NOT error — if it does, Task 1 did not land.

- [x] **Step 3: Cast the computed total in the usecase**

In `get-season-accounting.usecase.ts`, wrap the existing ternary assignment (lines 88–96) so the cast happens once where the value is produced:

```ts
const totalSeasonInvestment = (
    seasonStartYear === null
        ? allPasses
              .filter(
                  (pass) =>
                      pass.seasonStartYear <= currentSeasonStartYear,
              )
              .reduce((sum, pass) => sum + pass.price, 0)
        : seasonInvestments.reduce((sum, pass) => sum + pass.price, 0)
) as SeasonPassPrice;
```

Leave the `seasonInvestments` map (lines 71–81) byte-identical. In the redis-miss fallback (line 119) change `totalSeasonInvestment: 0,` to `totalSeasonInvestment: 0 as SeasonPassPrice,`. Add `import type { SeasonPassPrice } from '@psg/shared/money';`.

- [x] **Step 4: Brand `AskSeasonPass` and refresh its comment**

In `src/api/ask/types/context.type.ts`, replace `AskSeasonPass` (lines 36–44) with:

```ts
export type AskSeasonPass = {
    label: string;
    category: string;
    price: SeasonPassPrice;
    // Carries its upstream brand: TimePeriodAccounting's seasonInvestments
    // was branded in PSG-40, so these fields map straight through from it
    // with no cast (same reasoning as AskAmortization.remaining below,
    // whose upstream is still unbranded).
    seasonStartYear: SeasonYear;
};
```

Add `SeasonPassPrice` to the existing `from '@psg/shared/money'` import (line 2).

- [x] **Step 5: Fix the `TotalInvestment` cast in `build-context.ts`**

Replace lines 90–94 (`toPeriod`'s comment + cast) with:

```ts
    // Upstream is now SeasonPassPrice (PSG-40); AskPeriod's semantic brand
    // for this figure is TotalInvestment. The two brands have no direct
    // relationship, so a double step is required — same reasoning as
    // totalSales → TotalListedValue in toAccounting above.
    const totalSeasonInvestment =
        period.totalSeasonInvestment as unknown as TotalInvestment;
```

The `seasonPasses: period.seasonInvestments.map(...)` block stays byte-identical — after Step 4 it is straight-through.

- [x] **Step 6: Fix the four spec literals**

Change `totalSeasonInvestment: 0,` → `totalSeasonInvestment: 0 as SeasonPassPrice,` at:
- `src/api/accounting/accounting.service.spec.ts:72`, `:107`, `:139`
- `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.spec.ts:231`

Add `import type { SeasonPassPrice } from '@psg/shared/money';` to each file that lacks it. Re-run `npm run typecheck` and fix any remaining literal-vs-brand error in these specs with the same pattern (cast at the literal).

- [x] **Step 7: Verify green**

Run: `npm run typecheck && npm run lint && npx vitest run src/api/accounting src/api/ask && npm test`
Expected: all clean. `build-context.spec.ts` and `ask-question.usecase.spec.ts` fixtures already use `as unknown as TimePeriodAccounting` and need no change.

- [ ] **Step 8: Commit**

```bash
git add src/api/accounting/types/time-period-accounting.type.ts \
  src/api/accounting/usecases/get-season-accounting/ \
  src/api/ask/types/context.type.ts src/api/ask/context/build-context.ts \
  src/api/accounting/accounting.service.spec.ts
git commit -m "refactor(psg-40): brand SeasonInvestment/TimePeriodAccounting and thread ask context"
```

---

### Task 3: `Amortization` + `get-amortization` threading

**Files:**
- Modify: `src/api/accounting/types/amortization.type.ts`
- Modify: `src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts:35,70,110-123`
- Modify (typecheck fallout, if any): `src/api/accounting/usecases/get-amortization/get-amortization.usecase.spec.ts`

**Interfaces:**
- Consumes: branded db `SeasonPass` (Task 1) — `passes[].price` and the `passPrice` reduce read straight.
- Produces: `Amortization { seasonStartYear: SeasonYear; passPrice: SeasonPassPrice; totalRealized: Profit }`, `AmortizationPass { price: SeasonPassPrice }`. `build-context.ts`'s `AskAmortization` reads widen freely (no edit needed); `emptyAmortization(seasonStartYear: SeasonYear)` already takes the brand (PSG-36 landed).

- [x] **Step 1: Retype the type**

In `src/api/accounting/types/amortization.type.ts`, add:

```ts
import type { Profit, SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
```

and change:

```ts
export type AmortizationPass = {
    id: SeasonPassId;
    label: string;
    price: SeasonPassPrice;
};

export type Amortization = {
    seasonStartYear: SeasonYear;
    passPrice: SeasonPassPrice;
    hasPass: boolean;
    totalRealized: Profit;
    progress: number;
    remaining: number;
    surplus: number;
    breakEven: AmortizationBreakEven | null;
    perMatch: AmortizationMatchRow[];
    passes: AmortizationPass[];
};
```

Leave `AmortizationMatchRow` untouched (`matchProfit`/`cumulative` stay plain — mirror parity, see spec Non-goals).

- [x] **Step 2: Run typecheck to see the fallout**

Run: `npm run typecheck`
Expected errors in: `get-amortization.usecase.ts` — the `passPrice` reduce (returns `number`), `totalRealized = cumulative`, and `emptyAmortization`'s two zero literals. `passSummaries` (`price: pass.price`) must NOT error. No other file should break (`build-context.ts` widens; `CACHE_KEYS` is a type parameter; `accounting.service` passes through).

- [x] **Step 3: Cast where values are produced**

In `get-amortization.usecase.ts`:

```ts
// line 35 — the reduce sums SeasonPassPrice into a plain accumulator
const passPrice = passes.reduce(
    (sum, pass) => sum + pass.price,
    0,
) as SeasonPassPrice;
```

```ts
// line 70 — cumulative is the running plain sum; brand it once here
const totalRealized = cumulative as Profit;
```

In `emptyAmortization` (lines 110–123): `passPrice: 0 as SeasonPassPrice,` and `totalRealized: 0 as Profit,`. Add `import type { Profit, SeasonPassPrice } from '@psg/shared/money';`.

The arithmetic that consumes these (`passPrice > 0`, `totalRealized / passPrice`, `passPrice - totalRealized`) compiles unchanged — brands are `number`-based and this exact pattern already exists in `build-context.ts`'s `toNetProfit`.

- [x] **Step 4: Fix any spec literals**

Run: `npm run typecheck`. If `get-amortization.usecase.spec.ts` reports literal-vs-brand errors (e.g. a strictly-typed `Amortization` expectation with `passPrice: 1000`), cast at the literal (`passPrice: 1000 as SeasonPassPrice`) and add the import. `cachedValue` there is untyped and `expect(...).toEqual(...)` is unchecked — if typecheck is silent, no spec edit is needed.

- [x] **Step 5: Verify green**

Run: `npm run typecheck && npm run lint && npx vitest run src/api/accounting && npm test`
Expected: all clean; amortization behavior assertions unchanged (no behavior change).

- [ ] **Step 6: Commit**

```bash
git add src/api/accounting/types/amortization.type.ts \
  src/api/accounting/usecases/get-amortization/
git commit -m "refactor(psg-40): brand Amortization numeric fields and thread the usecase"
```

---

### Task 4: api `SeasonPass` type

**Files:**
- Modify: `src/api/season-passes/types/season-pass.type.ts`

**Interfaces:**
- Consumes: db `SeasonPass` (Task 1) — `SeasonPassesService` returns db rows directly.
- Produces: api `SeasonPass { seasonStartYear: SeasonYear; price: SeasonPassPrice }` — consumed by `season-passes.controller.ts` and `season-passes.service.interface.ts` (signatures unchanged).

- [x] **Step 1: Retype the type**

In `src/api/season-passes/types/season-pass.type.ts`, add:

```ts
import type { SeasonPassPrice } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
```

and change the two fields:

```ts
export type SeasonPass = {
    id: SeasonPassId;
    userId: UserId;
    seasonStartYear: SeasonYear;
    price: SeasonPassPrice;
    label: string;
    category: string;
    row: string;
    seat: string;
    createdAt: Date;
    updatedAt: Date;
};
```

Extend the existing comment above the type with one line: `// Numeric fields carry the same brands as the db row (PSG-40), so the service pass-throughs are type-exact.`

- [x] **Step 2: Verify green**

Run: `npm run typecheck && npm run lint && npx vitest run src/api/season-passes src/api/sales src/api/sales-import && npm test`
Expected: clean with **zero** further edits — the controller/service/interface are pass-throughs, the db row (Task 1) is now structurally identical on these fields, and no spec constructs this type directly. If typecheck surprises you with an error, fix it with a cast at the literal and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/api/season-passes/types/season-pass.type.ts
git commit -m "refactor(psg-40): brand api SeasonPass seasonStartYear and price"
```

---

### Task 5: sales-import preview DTOs + resolver/validator threading

**Files:**
- Modify: `src/api/sales-import/dto/preview-response.dto.ts`
- Modify: `src/api/sales-import/dto/draft-row.dto.ts:44-54`
- Modify: `src/api/sales-import/dto/draft-allocation.dto.ts`
- Modify: `src/api/sales-import/sales-import.resolver.ts:150-178,198-209`
- Modify: `src/api/sales-import/shared/import-passes.validator.ts:22,40`
- Modify (typecheck fallout): `src/api/sales-import/usecases/commit-sales-import/commit-sales-import.usecase.spec.ts:55-71`

**Interfaces:**
- Consumes: `RawImportRow` already-branded fields (`sales-import.csv.ts`), `ImportPassesValidator.validate(): Promise<SeasonYear>` (already returns the brand).
- Produces: `PreviewResponse { seasonStartYear: SeasonYear }`, `DraftRowDto`/`DraftAllocationDto` with branded numeric fields — mirrored 1:1 by `web/src/lib/types/sales-import.ts` (Task 6). `validateCommitRows`/`resolveDraftRows` are the only producers of these rows.

- [x] **Step 1: Retype `PreviewResponse`**

In `preview-response.dto.ts`, add `import type { SeasonYear } from '@psg/shared/time';` and change line 15 to `seasonStartYear: SeasonYear;`. (`SalesImportService.preview` already returns a `SeasonYear` — the literal becomes straight-through; no service edit.)

- [x] **Step 2: Retype `DraftRowDto` (decorators untouched)**

In `draft-row.dto.ts`, add:

```ts
import type { Invest, ListedPrice } from '@psg/shared/money';
import type { TicketCount } from '@psg/shared/counts';
```

and change:

```ts
    @IsInt()
    @Min(0)
    listedPrice!: ListedPrice;

    @IsInt()
    @Min(1)
    nbTickets!: TicketCount;

    @IsInt()
    @Min(0)
    invest!: Invest;
```

All other fields (`rowIndex`, `date`, `soldAt?`, `recipient?`, `matchId?`, `status`, `rowStatus`) stay as they are.

- [x] **Step 3: Retype `DraftAllocationDto`**

In `draft-allocation.dto.ts` add `import type { TicketCount } from '@psg/shared/counts';` and change `nbTickets!: number;` → `nbTickets!: TicketCount;` (keep `@IsInt() @Min(1)`).

- [x] **Step 4: Delete the identity casts in `validateCommitRows`**

In `sales-import.resolver.ts` (lines 203–205), replace:

```ts
            listedPrice: row.listedPrice as ListedPrice,
            nbTickets: row.nbTickets as TicketCount,
            invest: row.invest as Invest,
```

with:

```ts
            listedPrice: row.listedPrice,
            nbTickets: row.nbTickets,
            invest: row.invest,
```

Then delete the now-unused `import type { Invest, ListedPrice } from '@psg/shared/money';` line (both names become unused in this file — `noUnusedLocals` will flag it). Keep the `import type { TicketCount } from '@psg/shared/counts';` line: Step 5 reuses `TicketCount` in `buildAllocations`.

- [x] **Step 5: Type `buildAllocations` on the brand**

In `sales-import.resolver.ts` change `function buildAllocations(nbTickets: number, ...)` → `function buildAllocations(nbTickets: TicketCount, ...)` (its only caller passes `raw.nbTickets`, already `TicketCount`), and inside its first branch change `nbTickets: 1` → `nbTickets: 1 as TicketCount`. The second branch (`nbTickets,`) then flows straight through. If `resolveSoldAtStatus`/`isInvalidRow` report any new mismatch, do not widen them back — the params already accept the branded values (brands widen to `number`).

- [x] **Step 6: Drop the return cast in `ImportPassesValidator`**

In `import-passes.validator.ts` change line 22 `const years = new Set<number>();` → `const years = new Set<SeasonYear>();` and line 40 `return [...years][0]! as SeasonYear;` → `return [...years][0]!;`. (`years.add(pass.seasonStartYear)` is already branded after Task 1; the `SeasonYear` import already exists.)

- [x] **Step 7: Run typecheck and fix the `validDto` literal**

Run: `npm run typecheck`
Expected: `commit-sales-import.usecase.spec.ts` errors on `validDto` (line 55) — its row literal has plain `listedPrice`/`nbTickets`/`invest` checked against the now-branded `DraftRowDto`. Fix by asserting the row object: change the row literal's closing `}` (line 69) to `} as DraftRowDto,` and add `import type { DraftRowDto } from './dto/draft-row.dto';`. The later `CommitRequestDto` literals in that file spread `validDto.rows[0]!` and are contextually typed — they need no edit. `sales-import.service.spec.ts`'s `rows: []` and `resolver.spec.ts`'s `makeDraftRow` (already `as DraftRowDto`) are unaffected.

- [x] **Step 8: Verify green**

Run: `npm run typecheck && npm run lint && npx vitest run src/api/sales-import && npm test`
Expected: all clean. Runtime is untouched: class-validator decorators still validate plain numbers, `plainToInstance` on `CommitRequestDto` still yields plain runtime values, and `resolveDraftRows`/`validateCommitRows` produce byte-identical rows.

- [ ] **Step 9: Commit**

```bash
git add src/api/sales-import/
git commit -m "refactor(psg-40): brand sales-import preview DTOs and thread the resolver"
```

---

### Task 6 (frontend, independent — can run in parallel with Tasks 1–5): mirror `PreviewResponse`

**Files:**
- Modify: `web/src/lib/types/sales-import.ts:4,55`

**Interfaces:**
- Consumes: the backend `PreviewResponse` shape (contract unchanged — brand is type-level; the fetch boundary is an unchecked `as` cast in `web/src/lib/api/sales-import.ts:26`).
- Produces: web `PreviewResponse { seasonStartYear: SeasonYear }` — read by nobody today (`ImportSalesModal`/`ImportSalesDraft` use `rows`/`missingMatches`/`summary`), so no consumer edits.

- [ ] **Step 1: Brand the field**

In `web/src/lib/types/sales-import.ts`, change line 4 from:

```ts
import type { IsoDateString } from '@psg/shared/time';
```

to:

```ts
import type { IsoDateString, SeasonYear } from '@psg/shared/time';
```

and line 55 from `seasonStartYear: number;` → `seasonStartYear: SeasonYear;`.

- [ ] **Step 2: Verify green**

Run (in `web/`): `npm run typecheck && npm run check && npm test`
Expected: all clean with no other edits. If `svelte-check` reports a consumer (there should be none — grep `seasonStartYear` under `web/src` shows only `pass.seasonStartYear` reads of the already-branded `SeasonPass` mirror), fix that consumer with a cast at its literal, not by widening the mirror field back.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types/sales-import.ts
git commit -m "refactor(psg-40): brand frontend sales-import PreviewResponse.seasonStartYear"
```

---

### Task 7: Final verification (both packages + greps)

**Files:** none (verification only).

**Interfaces:**
- Consumes: all of Tasks 1–6.
- Produces: the evidence the coordinator/QA needs to accept the change.

- [x] **Step 1: Backend full gate**

Run from repo root:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Frontend full gate**

Run:

```bash
cd web && npm run typecheck && npm run check && npm test && npm run build && cd ..
```

Expected: every command exits 0.

- [ ] **Step 3: Load-bearing greps**

```bash
grep -rn "seasonStartYear: number" src/api src/db web/src/lib/types.ts web/src/lib/types/   # expect: no output
grep -rn "totalSeasonInvestment: number" src/ web/src/                                      # expect: no output
grep -rn "as ListedPrice" src/api/sales-import/sales-import.resolver.ts                     # expect: no output
```

If any of the three prints a match, a field was missed — retype it per the spec's field table (not by deleting the grep).

- [ ] **Step 4: Confirm the deliberate survivors were not "fixed"**

```bash
grep -n "remaining: number" src/api/accounting/types/amortization.type.ts   # expect: match (stays plain)
grep -n "seasonStartYear: number" web/src/lib/ui/AmortizationCard.svelte    # expect: match (stays plain)
```

Both must still match — changing them violates the spec's Non-goals.

- [ ] **Step 5: Report**

No commit is produced by this task. Summarize for the coordinator: gates run, greps output, and confirmation that no runtime file changed beyond cast add/remove (spot-check with `git diff --stat HEAD~6` that only `.ts`/`.svelte` type annotations and assertions are in the diff).
