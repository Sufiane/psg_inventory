# PSG-109 Web accounting `salesCount` / `totalListedValue` Implementation Plan

Spec: `docs/specs/2026-11-25-psg-109-web-accounting-sales-count-design.md`. Frontend only, one PR, about 35 lines,
no ticket split. Branch `psg-109`. Conventional commit (`fix(web): bind accounting count tiles to salesCount`), stage
and stop for `/crit`. Rules: explicit return types, braced `if`, no comments unless non-obvious why, nested `describe`
per condition, no PR numbers in title/body.
Gate: `cd web && npm run check && npm test` (use the project's actual scripts; also root `npm run lint`).

### Task 1: failing test, then type and helper

Files: `web/src/lib/sale-math.spec.ts`, `web/src/lib/types.ts`, `web/src/lib/sale-math.ts`.

1. In the spec, change helper to `function accounting(salesCount: number, totalProfit: number): Accounting { return { salesCount, totalProfit } as unknown as Accounting; }`.
2. Run the web unit tests: `cancelledFrom` count cases fail (NaN/0). Expected red.
3. `types.ts`: replace `totalSales: SaleCount;` with `totalListedValue: TotalListedValue;` and `salesCount: SaleCount;`.
4. `sale-math.ts` `cancelledFrom`: `count: (unrealized?.salesCount ?? 0) - (gifted?.salesCount ?? 0)`.
5. Run tests: green.

### Task 2: consumers

Files: `web/src/lib/ui/AccountingCard.svelte`, `web/src/routes/(app)/dashboard/+page.svelte`,
`web/src/routes/(app)/accounting/+page.svelte`, `web/src/routes/+page.server.ts`.

1. `AccountingCard.svelte` lines 86 and 105: `money(data.totalListedValue)`.
2. Dashboard lines 64-65: `accounting.gifted?.salesCount ?? 0`, `accounting.pending?.salesCount ?? 0`.
3. Accounting page line 109: `{pendingSales} {pendingSales === 1 ? 'sale' : 'sales'}` with
   `{@const pendingSales = accounting.pending?.salesCount ?? 0}` (apply Q1 answer; if tickets, use `totalNbTickets`).
4. `+page.server.ts`: delete the three-line "realized.totalSales is misnamed" comment.
5. `grep -rn totalSales web e2e` returns nothing; run `svelte-check`, lint, unit tests.

### Task 3: tech-debt cleanup

File: `docs/tech-debt.md`. Delete the whole "`totalSales` is a listed-price sum, rendered as a count (PSG-88)" section
(heading through the "Status:" paragraph). Check no other doc links to it. Final gate, then stage.

Manual check (qa-verifier): Dashboard pending/gifted/cancelled tiles show real counts; Accounting pending line shows
a count; `AccountingCard` hero shows a number in "listed value", not NaN.
