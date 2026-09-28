# Brand the five outlier API-output types (PSG-40) — Design

**Date:** 2026-09-27
**Status:** Draft (awaiting review)
**Issue:** PSG-40
**Type:** Type-level refactor (backend + one frontend mirror file). Net-zero at runtime: no API payload, cache-key, TTL, or behavior change. Brands are erased at every JSON boundary.

## Problem

The codebase brands its numeric domains in `shared/src/time.d.ts` (`SeasonYear`) and `shared/src/money.d.ts` (`SeasonPassPrice`, plus `Profit`/`Invest`/`ListedPrice`/…), all built on `Brand<number, …> = number & { readonly [brand]: … }`. Convergence has already happened at three layers:

- **db inputs** — `CreateSeasonPassInput`, `ISeasonPassesDbService.findBySeason(seasonStartYear: SeasonYear)`, `getHomeMatchesForSeason(seasonStartYear: SeasonYear)`, etc.;
- **most backend API-output types** — `Accounting`/`MaxMinData` (every money field branded), `AskFigures`, `GetSeasonMatchesDto`, ask's `season.startYear`;
- **the frontend mirror** — `web/src/lib/types.ts` brands `SeasonInvestment`, `TimePeriodAccounting`, `Amortization`, `SeasonPass` (numeric fields).

Five backend API-output types still declare plain `number` where those branded types exist, so mapping code must narrow (cast plain → brand) or widen (brand → plain) at the boundary instead of carrying the brand straight through. This issue retypes them and threads the change through every mapping/serialization site.

## Field-by-field mapping (ground truth)

Numeric fields only — string/ID branding (`PassLabel`, `SeasonPassId`, …) is out of scope (see Non-goals).

| # | Type | File | Field(s) | From → To |
|---|---|---|---|---|
| 1a | `Amortization` | `src/api/accounting/types/amortization.type.ts:28,29,31` | `seasonStartYear` / `passPrice` / `totalRealized` | `number` → `SeasonYear` / `SeasonPassPrice` / `Profit` |
| 1b | `AmortizationPass` | same file `:24` | `price` | `number` → `SeasonPassPrice` |
| 2a | `SeasonInvestment` | `src/api/accounting/types/time-period-accounting.type.ts:6,7` | `price` / `seasonStartYear` | `number` → `SeasonPassPrice` / `SeasonYear` |
| 2b | `TimePeriodAccounting` | same file `:20` | `totalSeasonInvestment` | `number` → `SeasonPassPrice` |
| 3a | api `SeasonPass` | `src/api/season-passes/types/season-pass.type.ts:10,11` | `seasonStartYear` / `price` | `number` → `SeasonYear` / `SeasonPassPrice` |
| 3b | db `SeasonPass` (enabler, see D2) | `src/db/season-passes/type/season-pass.type.ts:5` | `Override` gains the two fields | `number` → `SeasonYear` / `SeasonPassPrice` |
| 4 | `AskSeasonPass` (nested in `AskContext` → `AskPeriod`) | `src/api/ask/types/context.type.ts:39,43` | `price` / `seasonStartYear` | `number` → `SeasonPassPrice` / `SeasonYear` |
| 5a | `PreviewResponse` | `src/api/sales-import/dto/preview-response.dto.ts:15` | `seasonStartYear` | `number` → `SeasonYear` |
| 5b | `DraftRowDto` | `src/api/sales-import/dto/draft-row.dto.ts:46,50,54` | `listedPrice` / `nbTickets` / `invest` | `number` → `ListedPrice` / `TicketCount` / `Invest` |
| 5c | `DraftAllocationDto` | `src/api/sales-import/dto/draft-allocation.dto.ts:9` | `nbTickets` | `number` → `TicketCount` |
| 6 (frontend) | web `PreviewResponse` | `web/src/lib/types/sales-import.ts:55` | `seasonStartYear` | `number` → `SeasonYear` |

Note on the issue's bullets: `TimePeriodAccounting` has no `seasonStartYear` of its own (the bullet means its `SeasonInvestment` rows); `AskContext` has no top-level `seasonStartYear` (the plain one is `AskSeasonPass.seasonStartYear`; `season.startYear` is already `SeasonYear`); the sales-import DTO has no field literally named `price` (it is `DraftRowDto.listedPrice`).

## Non-goals

- **No runtime change of any kind.** Brands are type-level; JSON payloads, Redis cache keys/TTLs, class-validator behavior, and all computed values stay byte-identical.
- **Fields the mirror keeps plain stay plain:** `Amortization.remaining`, `progress`, `surplus`; `AmortizationMatchRow.matchProfit`/`cumulative`. The existing comments on `AskFigures.amortizationRemaining` and `AskAmortization.remaining` ("unbranded upstream") remain accurate and are not touched.
- **Other `Ask*` numerics stay plain** (`AskAccounting.totalProfit`/`totalInvest`/`average*`, `AskAmortization.passPrice`/`totalRealized`/`surplus`): `AskContext` is an LLM-facing flattening with no mirror to converge against, and the issue names only its `seasonStartYear`. Reading a now-branded upstream value into a plain field is a widening — free, no cast, no mapping code.
- **String/ID fields stay plain** on these five types (api `SeasonPass.label: string`, `SeasonInvestment.id: string`, …). The mirror brands them, but PSG-40 is scoped to `number`.
- **`src/redis/CACHE_KEYS.ts` param types stay `number`** (`amortization(userId, seasonStartYear: number)`, `seasonPassesBySeason`). Branded arguments widen freely; retyping them would touch the shared key factory for no mapping benefit.
- **Web components/server loads beyond the one mirror field** (`AmortizationCard.svelte`'s `seasonStartYear: number` prop, `+page.server.ts` showcase) — they only receive branded values (widening), so they compile and behave as-is.
- **`e2e/`, `scripts/`** — verified not to use these five types; root `tsc` covers `scripts/**` and will confirm.

## Design decisions

### D1 — Scope rule (resolved on judgment): mirror parity, not the literal bullet list

The issue's field lists are shorthand and not literally executable as written (see the bullet notes above), while the issue's *thesis* — "these five types are now the outliers [versus db + `web/src/lib/types.ts`]" — names the mirror as the convergence target. Scope rule adopted:

> For each of the five types, every **numeric** field whose frontend mirror (`web/src/lib/types.ts` / `web/src/lib/types/sales-import.ts`) or whose direct upstream already declares a branded type gets that brand.

Consequence: the field table above includes the named fields **plus** `Amortization.passPrice`/`totalRealized`/`passes[].price`, `SeasonInvestment.price`, `TimePeriodAccounting.totalSeasonInvestment`, `SeasonPass.seasonStartYear`, `AskSeasonPass.price`, `DraftRowDto.invest`/`nbTickets`, `DraftAllocationDto.nbTickets`. The only plus-listed field with no mirror at all is `AskSeasonPass.price` (the `Ask*` types are LLM-facing and unmirrored); it is branded anyway because `build-context.ts:104` maps it directly from the now-branded `SeasonInvestment.price` on the line adjacent to `seasonStartYear` — leaving it plain would recreate the incoherence this issue is fixing.

**Alternative rejected:** taking the bullets literally (brand only the listed fields). It would leave, e.g., `SeasonPass.price: SeasonPassPrice` next to `SeasonPass.seasonStartYear: number` inside one type — the exact incoherence that produced this issue, and the first thing the next audit would re-flag. If the reviewer prefers the literal reading, the delta is dropping the plus-listed fields from the table; everything else (threading, D2–D6) stands.

### D2 — db `SeasonPass` row type gains the two brands (prerequisite, type-level only)

`SeasonPassesService` is a pure pass-through (`return this.db.findBySeason(...)` etc., no mapping). The api `SeasonPass` can only carry the brands if the db row type does: `number`-typed db rows are not assignable to brand-typed api fields. Fix is the established pattern — db `Sale` already does `Override<SaleRow, { … invest: Invest; profit: Profit; listedPrice: ListedPrice … }>` (`src/db/sales/type/sale.type.ts`):

```ts
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

The Prisma call sites in `season-passes.db.ts` already assert `as SeasonPass` (plain → brand is a legal assertion because the brand widens to plain), so this is 2 fields + 2 imports and zero runtime code. It also makes the issue's premise ("db layer converged") true for rows, not only inputs. `passFixture`-style spec fixtures that return a bare literal (no assertion) pick up the cast.

### D3 — Cast placement: cast once, where the value is first produced

Straight-from-db field reads need **no** cast after D2 (the whole point of the change). Casts appear only where a value is *computed*, following the file-local convention (cf. `leadDays() as LeadDays`, `raw.totalSales as unknown as TotalListedValue`):

- `get-amortization.usecase.ts` — `passPrice` (`reduce` → `as SeasonPassPrice`), `totalRealized` (`cumulative` → `as Profit`), and `emptyAmortization`'s two zero literals.
- `get-season-accounting.usecase.ts` — the `totalSeasonInvestment` ternary (both branches reduce to `number`) wrapped once with `as SeasonPassPrice`, plus the redis-miss fallback `0`.
- `build-context.ts` `toPeriod` — `AskPeriod.totalSeasonInvestment` stays `TotalInvestment` (semantic brand for the LLM context), upstream is now `SeasonPassPrice`, and the two brands are not comparable in one step, so the existing single cast becomes `as unknown as TotalInvestment` with its comment refreshed (double-cast precedent: `totalSales` two lines above in the same file).
- `sales-import.resolver.ts` — the three identity casts in `validateCommitRows` (`row.listedPrice as ListedPrice`, `row.nbTickets as TicketCount`, `row.invest as Invest`) are **deleted** (fields now already branded); `buildAllocations`'s `nbTickets: 1` literal becomes `1 as TicketCount`.
- `import-passes.validator.ts` — declare `new Set<SeasonYear>()` so the trailing `as SeasonYear` return cast disappears.

### D4 — AskContext scope: `AskSeasonPass` only, comment rewritten

`AskSeasonPass.seasonStartYear: number` (context.type.ts:40–43) exists with the comment "Unbranded to match its actual upstream source (TimePeriodAccounting's seasonInvestments, itself seasonStartYear: number)". After 2a lands, that statement is false; the field becomes `SeasonYear` and the comment is replaced with one stating the fields now carry their upstream brands. `AskSeasonPass.price` → `SeasonPassPrice` (same reasoning, mapped on the adjacent line from `SeasonInvestment.price`). `season.startYear`, `AskAmortization`, `AskAccounting`: unchanged (see Non-goals).

### D5 — sales-import preview DTO

- `PreviewResponse.seasonStartYear` → `SeasonYear`. `SalesImportService.preview` already holds a `SeasonYear` from `ImportPassesValidator.validate`, so the return object literal flows straight through — the widening that exists today disappears.
- `DraftRowDto.listedPrice`/`invest`/`nbTickets` and `DraftAllocationDto.nbTickets` → branded. `RawImportRow` (`sales-import.csv.ts`) already brands exactly these, so `resolveDraftRows` flows them straight through and `validateCommitRows`'s casts are deleted. Decorators (`@IsInt() @Min(0) …`) are untouched: validation is runtime, brands are type-level.
- `CommitRequestDto` round-trip: incoming JSON is `plainToInstance`d into `DraftRowDto` — runtime plain numbers typed as brands, the same accepted pattern as Prisma rows asserted `as SeasonPass`. Class-validator is unaffected by TS brands.
- Spec fallout is one strictly-typed literal (`validDto` in `commit-sales-import.usecase.spec.ts`) needing an `as DraftRowDto` on its row; other fixtures already end in `as DraftRowDto` / `as SeasonPass`.

### D6 — Frontend: exactly one field

`web/src/lib/types/sales-import.ts` `PreviewResponse.seasonStartYear` → `SeasonYear` (+ import from `@psg/shared/time`). The rest of the frontend mirror is already converged (`types.ts` brands all four domain types; `DraftRow` brands `listedPrice`/`invest`/`nbTickets`). No web code reads `preview.seasonStartYear` today (`ImportSalesModal`/`ImportSalesDraft` read `rows`/`missingMatches`/`summary` only), and the fetch boundary is an unchecked `as` cast in `web/src/lib/api/sales-import.ts:26`, so this change cannot break the build or the UI even in isolation.

### D7 — Backend and frontend work are independent

Verified: no file under `web/` imports anything from `src/` (grep for cross-imports: none; both sides import only `@psg/shared`), the JSON boundary is untyped, and neither change compiles against the other. Either can land first, in either order, and both can run **in parallel**. Backend is the substance (~12 files + specs); frontend is 1 file.

## Files affected

### Backend — modified

| File | Change |
|---|---|
| `src/db/season-passes/type/season-pass.type.ts` | `Override` gains `seasonStartYear: SeasonYear; price: SeasonPassPrice` (+ imports) |
| `src/api/accounting/types/amortization.type.ts` | `Amortization.seasonStartYear/passPrice/totalRealized`, `AmortizationPass.price` branded (+ imports) |
| `src/api/accounting/types/time-period-accounting.type.ts` | `SeasonInvestment.price/seasonStartYear`, `TimePeriodAccounting.totalSeasonInvestment` branded (+ imports) |
| `src/api/accounting/usecases/get-amortization/get-amortization.usecase.ts` | casts at `passPrice` reduce, `totalRealized`, `emptyAmortization` zeros |
| `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts` | cast on `totalSeasonInvestment` ternary + redis-miss fallback |
| `src/api/season-passes/types/season-pass.type.ts` | `seasonStartYear`/`price` branded (+ imports); `SeasonPassesService` unchanged (pass-through becomes exact) |
| `src/api/ask/types/context.type.ts` | `AskSeasonPass.price/seasonStartYear` branded; stale comment rewritten |
| `src/api/ask/context/build-context.ts` | `totalSeasonInvestment` cast → `as unknown as TotalInvestment` + comment; `AskSeasonPass` mapping unchanged (straight-through) |
| `src/api/sales-import/dto/preview-response.dto.ts` | `seasonStartYear: SeasonYear` (+ import) |
| `src/api/sales-import/dto/draft-row.dto.ts` | `listedPrice`/`invest`/`nbTickets` branded (+ imports); decorators untouched |
| `src/api/sales-import/dto/draft-allocation.dto.ts` | `nbTickets: TicketCount` (+ import) |
| `src/api/sales-import/sales-import.resolver.ts` | delete 3 identity casts in `validateCommitRows`; `1 as TicketCount` in `buildAllocations` |
| `src/api/sales-import/shared/import-passes.validator.ts` | `Set<SeasonYear>`; drop return cast |
| Specs (typecheck-driven fallout) | `sales/test-support/sales.fixtures.ts` (bare literal → `as SeasonPass`), seven `passFixture({ seasonStartYear: N })` override sites across five specs (`sales.service.spec`, `sale-allocations.validator.spec` ×3, `update-sale.usecase.spec`, `sales-import.service.spec`, `import-passes.validator.spec`), `get-amortization.usecase.spec.ts`'s `pass(price)` helper, `accounting.service.spec.ts` (×3 `totalSeasonInvestment` literals), `get-season-accounting.usecase.spec.ts` (×1), `commit-sales-import.usecase.spec.ts` (`validDto` row), plus any further literal-vs-brand errors `tsc` reports in the listed areas |

### Frontend — modified

| File | Change |
|---|---|
| `web/src/lib/types/sales-import.ts` | `PreviewResponse.seasonStartYear: SeasonYear` (+ import from `@psg/shared/time`) |

### Unchanged

Controllers and service interfaces (all signatures already take/return `SeasonYear`/`SeasonPassPrice` at their boundaries or delegate unchanged); `CACHE_KEYS`; `AskFigures`/`AskAnswer`; `web/**` beyond the one field; `e2e/**`; `scripts/**`.

## Verification

Backend (root):

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build
```

Frontend (`web/`):

```bash
npm run typecheck && npm run check && npm test && npm run build
```

Load-bearing greps (no plain-`number` remnants in the retyped fields):

```bash
grep -rn "seasonStartYear: number" src/api src/db web/src/lib/types.ts web/src/lib/types/  # expect: no matches
grep -rn "totalSeasonInvestment: number" src/ web/src/           # expect: no matches
grep -rn "as ListedPrice" src/api/sales-import/sales-import.resolver.ts  # expect: no matches (identity casts deleted)
```

Deliberate plain-`number` survivors these greps must NOT be "fixed" on: `AskExtreme.price`, `AskAmortization.passPrice`, `AskAccounting.*`, `Amortization.remaining/progress/surplus` (see Non-goals), `CACHE_KEYS` params, `web/src/lib/ui/AmortizationCard.svelte`'s prop, `web/src/routes/+page.server.ts`'s showcase field, and `scripts/seed-e2e.ts`.

Runtime-equivalence check: the change is type-level; `npm test` (existing suites, no new behavior to test) plus `npm run build` are the regression net. No new test cases are warranted — there is no behavior change to observe; the compiler is the test.
