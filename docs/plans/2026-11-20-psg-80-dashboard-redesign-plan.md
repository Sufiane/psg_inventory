# PSG-80 Dashboard redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Builder: `frontend-builder` only.

**Goal:** Replace the "Current season" page with the Stitch Dashboard: net realized profit with its math, pending / cancelled / gifted tiles, break-even bar, five recent sales, "Log sale" action.

**Architecture:** One new pure module (`dashboard.ts`, vitest-covered) holds the only new logic; one new component (`RecentSales`) and a rewritten page compose existing S1 primitives (`MathBlock`, `BreakEvenBar`, `StatusChip`, `cancelledFrom`, `saleNet`). Load streams four unawaited promises. No backend change.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind 4, Vitest (node env, `src/**/*.spec.ts`), Playwright e2e.

**Spec:** `docs/specs/2026-11-20-psg-80-dashboard-redesign-design.md`. Parent: `docs/plans/2026-11-19-stitch-redesign-plan.md` slice S3. Shell and season conventions: `docs/plans/2026-11-20-psg-79-app-shell-season-selector-plan.md`.

## Global constraints

Parent plan "Global Constraints" apply verbatim (pinned deps, no barrels, explicit return types, no single-letter names, no inline `if`, blank line before `if/for/return/throw`, no `!!`, numeric separators, no comments unless a non-obvious why, sentence-case copy, banned content list, conventional commits scope `web`, no PR numbers, stage and stop for `/crit`). Tests: a `describe` per condition ("when ..."), `it` states only the outcome. No new dependencies. Branch `psg-80` is already correct. Linear: move PSG-80 to In Progress before starting, In Review only when staged.

## Size and ticket split

Estimate (added plus removed, tests included): about **750**, under the 800 cap, one PR, frontend only, one actor (authenticated), one layer (web).

| Task group | Lines |
|---|---|
| `dashboard.ts` + spec | ~125 |
| `RecentSales.svelte` | ~85 |
| `+page.server.ts` load | ~30 |
| `+page.svelte` rewrite (about 270 removed, ~210 added) | ~480 incl. deletions |
| Skeleton tweak, e2e spec, playwright testMatch | ~45 |

Tight because the old page is deleted wholesale. Fallback if the builder lands above 800: **S3a** (Tasks 1 to 3: pure module, `RecentSales`, load; dead code until S3b, ~240) then **S3b** (Tasks 4 to 6: page, skeleton, e2e, ~510, depends on S3a). Do not pre-split.

Follow-up tickets (not folded in): (1) optional backend `?limit=` on `/sales/*-season` only if payload size ever matters (new feature, backend ticket); (2) deleting `AccountingCard*` / `AmortizationCard*` stays with S6.

## File map

- Create `web/src/lib/dashboard.ts`, `web/src/lib/dashboard.spec.ts`
- Create `web/src/lib/ui/RecentSales.svelte`
- Modify `web/src/routes/(app)/dashboard/+page.server.ts`, `+page.svelte`
- Modify `web/src/lib/ui/NetProfitSkeleton.svelte`, `web/src/lib/ui/AskCard.svelte` (token check only; edit only if a class no longer fits the midnight tokens)
- Create `e2e/tests/dashboard.e2e-spec.ts`; modify `e2e/playwright.config.ts` (`testMatch` regex gains `dashboard`)

---

## Task 1: dashboard pure helpers (TDD)

**Interfaces (exact):**
```ts
export function recentSales(sales: SaleListItem[], limit: number): SaleListItem[];
export function breakEvenCaption(
    amortization: Pick<Amortization, 'hasPass' | 'remaining' | 'surplus'>,
): string | null;
export function netTone(value: number): string;
```
Semantics:
- `recentSales`: sort by `createdAt` desc; missing `createdAt` falls back to `matchDate`; both missing sorts last; ties and missing keep input order (stable); returns first `limit`; never mutates input.
- `breakEvenCaption`: `null` when no pass; `remaining > 0` -> "{money(remaining)} still to recover"; else `surplus > 0` -> "Pass recovered, {money(surplus)} surplus"; else "Pass recovered".
- `netTone`: `text-negative-strong` below 0, `text-positive-strong` above 0, `text-ink` at 0 (moved from the page).

- [ ] **Step 1: Failing spec** `dashboard.spec.ts`, one `describe` per function, nested `when`:
  - `recentSales`: "when sales have createdAt" newest first; "when createdAt is missing" falls back to matchDate; "when both are missing" kept last in input order; "when more than limit" truncates; "when empty" returns `[]`; "when called" does not mutate the input.
  - `breakEvenCaption`: "when no pass" null; "when remaining is positive" amount-to-recover text; "when remaining is 0 and surplus positive" surplus text; "when both are 0" plain recovered.
  - `netTone`: negative, positive, zero.
  Build `SaleListItem` fixtures with a small local factory (branded ids via cast in the spec only).
- [ ] **Step 2:** `cd web && npx vitest run src/lib/dashboard.spec.ts`; expect FAIL.
- [ ] **Step 3:** Implement `dashboard.ts` (imports `money` from `$lib/format`, types from `$lib/types`). Run again; expect PASS.

## Task 2: RecentSales component

**Interface:** `let { sales }: { sales: SaleListItem[] } = $props()` (already sliced by the page).

- [ ] **Step 1:** Rows as `<li>` containing one `<a href="/matches/{sale.matchId}">`: opponent name and `shortDate(matchDate)` (omit date when `matchDate` undefined), `{nbTickets} tickets`, `StatusChip`, listed price (`money`), net (`signedMoney(saleNet(sale))` with `profitTone(status, net)` class).
- [ ] **Step 2:** CANCELLED row: no price, no net. GIFTED row: text "Gifted to {Gift.Recipient.name}", no price, no net. PENDING keeps price and net (warning tone via `profitTone`).
- [ ] **Step 3:** Empty list: "No sales yet" with link to `/sales/new`. Footer link "All sales" to `/sales` (use `carrySeason`-style href only if PSG-79 nav does; check `$lib/season` `carrySeason(href, $page.url)` and reuse for both links so the selected season carries over).
- [ ] **Step 4:** `npm run check` in `web/`; expect PASS.

## Task 3: load

- [ ] **Step 1:** In `+page.server.ts`, keep `resolveSeason(event.url, false)` and `isCurrent`. Return `{ season, accounting, amortization, sales }`:
  - `accounting`: unchanged paths.
  - `amortization = api<Amortization>(event, '/accounting/amortization/' + season)` (route takes the year; current season also passes the explicit start year).
  - `sales = api<SaleListItem[]>(event, isCurrent ? '/sales/current-season' : '/sales/season/' + season)`.
- [ ] **Step 2:** Drop the `matches` fetch and the unused imports (`FormattedMatch`). Leave the `ask` action and `ASK_TIMEOUT_MS` untouched. Update the stale "both fly to the client" comment to say four.
- [ ] **Step 3:** `npm run typecheck`; expect PASS (the page will fail until Task 4, so run it together with Task 4 if the S3a/S3b split is not used).

## Task 4: page

Layout per spec section 3, top to bottom, inside the shell content area.

- [ ] **Step 1:** Header: `h1` "Dashboard", muted subtitle `seasonLabel(data.season)` (D7), `Button href="/sales/new"` "Log sale" (no "+").
- [ ] **Step 2:** Net card `aria-labelledby`, `h2` "Net realized profit", figure `font-mono text-5xl` with `netTone(net)` and `signedMoney`. `net = realized.totalProfit - realized.totalInvest - totalSeasonInvestment` (null-safe as today). Under it `MathBlock`: lines "Realized proceeds (SOLD)" plus, "Ticket invest" minus, "Season pass" minus (only when `seasonInvestments.length > 0`, D2), result "Net realized profit". With no pass: one-line note with link to `/season` below the block.
- [ ] **Step 3:** Three tiles: Pending (`warning`, `pending.totalProfit`, `pending.totalSales`), Cancelled (`sunk`, `cancelledFrom(unrealized, gifted)`), Gifted (`gift`, `gifted.totalSales`, no amount). Each shows label, amount if any, "N sales" (singular "1 sale"); colour never the only signal (D1).
- [ ] **Step 4:** Break-even card `h2` "Season pass recovery": `BreakEvenBar progress hasPass`, caption from `breakEvenCaption` when non-null.
- [ ] **Step 5:** `RecentSales` with `recentSales(sales, 5)`; then `AskCard` last (props and `form` derivations unchanged).
- [ ] **Step 6:** Each `{#await}` has its own skeleton fallback and its own `{:catch}` `role="alert"` ("Failed to load {thing}: ..."). Net and tiles share `data.accounting` so group them under one await per block; do not blank the page when `amortization` or `sales` fails.
- [ ] **Step 7:** Delete: pass description list, glossary and its `<style>`, Upcoming matches, `AccountingCard` imports, local `netTone`/`proceedsTone`, `splitByKickoff`/`competitionLabel`/`dateTime` imports. Keep `in:fade` entrance pattern.
- [ ] **Step 8:** Banned-content check: no "New sale", no "Export CSV", no "0,00 EUR" invest placeholder, no profit on cancelled rows.

## Task 5: skeleton and token pass

- [ ] **Step 1:** `NetProfitSkeleton`: match the new card (larger figure block, three math rows, drop `max-w-lg` if the card is full width). Reuse for pending/cancelled/gifted tiles via `Skeleton`; add small inline skeletons for recent sales and break-even bar in the page, no new files.
- [ ] **Step 2:** `AskCard`: only change classes that conflict with midnight tokens; otherwise leave the file untouched.

## Task 6: e2e and gate

- [ ] **Step 1:** `e2e/tests/dashboard.e2e-spec.ts` (smoke): `/dashboard` shows `h1` "Dashboard", link "Log sale" with href `/sales/new`, heading "Net realized profit", heading "Season pass recovery", heading "Recent sales". Add `dashboard` to the `authenticated` project `testMatch` regex in `e2e/playwright.config.ts` (a spec outside `testMatch` never runs).
- [ ] **Step 2:** Gate in `web/`: `npm run check && npm run typecheck && npm test && npm run build && test -f .svelte-kit/cloudflare/_worker.js`. Run the e2e suite for `dashboard`, `sale`, `season-pass`, `auth`.
- [ ] **Step 3:** Manual (record in report): seed with no pass; with pass and SOLD sales; with CANCELLED and GIFTED rows; switch season in the header; confirm the net equals the MathBlock arithmetic and there are no profit figures on cancelled rows.
- [ ] **Step 4:** Stage; commit message `feat(web): rebuild dashboard to stitch design`; stop and tell the user to run `/crit`.

Acceptance: matches the brief's Dashboard paragraph; every figure traces to a MathBlock line or a tile; one failing endpoint leaves the rest rendered; season selector changes all four figures; unauthenticated redirect unchanged.
