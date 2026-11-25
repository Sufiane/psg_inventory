# PSG-108 Accounting `totalSales` rename plus `salesCount` Implementation Plan

Spec: `docs/specs/2026-11-25-psg-108-accounting-total-sales-rename-design.md`. Backend only, one PR, about 110 lines,
no ticket split (web is PSG-109, already separate and blocked by this). Branch `psg-108`.

Rules: explicit return types, no single-letter names, braced `if`, no barrels, no comments unless a non-obvious why,
pinned deps (none added), conventional commit, stage and stop for `/crit`. Tests: nested `describe` per condition.
Gate: `npm run lint && npm run typecheck && npm test && npm run build && test -f dist/main.js`.

### Task 1: types and db (count enters)

Files: `src/db/accounting/types/get-accounting.type.ts`, `src/db/accounting/accounting.db.ts`,
`src/api/accounting/types/aggregate-payload.type.ts`.

- [ ] Test first: new `src/db/accounting/accounting.db.spec.ts` (mock `PrismaService`, as `sales.db.spec.ts`):
  `getAccounting` calls `sales.aggregate` with `_count: { _all: true }`; when `_sum.listedPrice` is null returns `null`.
- [ ] `AccountingAggregate` add `_count: { _all: number }`; `AggregatePayload` add `count: number`.
- [ ] `AccountingDb.getAccounting` add `_count: { _all: true }` to the aggregate call.

### Task 2: formatter and public types (rename)

Files: `src/api/accounting/utils/format-aggregate.util.ts` (+ spec), `types/accounting.type.ts`,
`types/formatted-aggregate.type.ts`.

- [ ] Test first: update `format-aggregate.util.spec.ts` expected object: `totalListedValue: payload.sum.listedPrice`,
  `salesCount: payload.count`; payload fixture gets `count`. Watch it fail.
- [ ] Types: replace `totalSales: SaleCount` with `totalListedValue: TotalListedValue` and `salesCount: SaleCount`
  (import `TotalListedValue` from `@psg/shared/money`).
- [ ] `formatAggregate`: `totalListedValue: (payload.sum.listedPrice ?? 0) as unknown as TotalListedValue`,
  `salesCount: payload.count as SaleCount`. Keep casts here only, at the boundary.

### Task 3: usecase wiring

File: `src/api/accounting/usecases/get-season-accounting/get-season-accounting.usecase.ts` (+ spec).

- [ ] Test first: in `get-season-accounting.usecase.spec.ts` aggregate mock gets `_count: { _all: n }`; assert
  `formatAggregateMocked` called with `count: n` (existing assertion near line 133).
- [ ] `getAccounting` private method: pass `count: aggregate._count._all` to `formatAggregate`.
- [ ] Update remaining fixtures in the spec that spell `totalSales`.

### Task 4: Ask context (drops the double cast)

Files: `src/api/ask/context/build-context.ts`, `build-context.spec.ts`, `ask-question.usecase.spec.ts`.

- [ ] Fixtures: rename `totalSales` to `totalListedValue`, add `salesCount`.
- [ ] `toAccounting`: `totalListedValue: raw.totalListedValue`; delete the misnomer comment and the double cast;
  drop now-unused `as unknown as` import usage if any. Leave the `totalSeasonInvestment` double-cast, but reword its comment
  to stop pointing at the deleted `totalSales` cast.

### Task 5: cache key versioning

Files: `src/redis/CACHE_KEYS.ts`, `src/redis/CACHE_KEYS.spec.ts`.

- [ ] Test first: spec expects `accounting:v2:user:id:<id>:start:...`, `accounting:v2:user:id:<id>:amortization:<year>`,
  and pattern `accounting:v2:user:id:<id>:*`.
- [ ] Change `accounting`, `amortization`, `invalidateAccounting` to the `v2` prefix. Grep for any other literal
  `accounting:user:id` (none found outside CACHE_KEYS.ts at planning time) and any invalidator spec asserting the old pattern
  (`sales-cache.invalidator.spec.ts`).

### Task 6: docs and gate

- [ ] `docs/tech-debt.md`: edit the `totalSales` entry to "backend done in PSG-108 (renamed `totalListedValue`,
  added `salesCount`, cache key v2); web consumers remain in PSG-109". Remove it only when PSG-109 merges.
- [ ] `grep -rn "totalSales" src shared` returns nothing.
- [ ] Run the gate. Stage, stop, tell user to run `/crit`. Move PSG-108 to In Progress at start, In Review when staged.
- [ ] Post on PSG-109: the consumer table from spec section 6, the new field names, and "deploy right after backend".

## Size estimate

About 45 production lines, 65 test lines. Single PR.
