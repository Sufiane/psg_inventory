# PSG-85 all-seasons sales Implementation Plan

**Goal:** "All seasons" on the Sales page reads every sale in one call instead of a six-season fan-out.

**Spec:** `docs/specs/2026-11-21-psg-85-all-seasons-sales-design.md`. Read its "Finding" section first: `GET /sales` already returns every sale as `FormattedSale[]`, cached and invalidated, so there is no backend work unless the coordinator picks Alternative B.

**Branch:** `psg-85` (correct). Move PSG-85 to In Progress before starting, In Review only when staged and ready for `/crit`. Conventional commit, e.g. `feat(web): load all-seasons sales in one call (PSG-85)`.

## Size and split

Fits in one PR. Estimate: Task 1 about 10 lines changed, Task 2 about 15 lines (docs). Total about 25 lines, far under the 800 cap. Single layer (web), single actor (staff/user app). No ticket split. Backend and frontend are not parallel: backend-only work is zero, so dispatch `frontend-builder` alone.

If Alternative B is chosen (alias route `/sales/all`), add Task 0 (backend, about 25 lines) before Task 1 and point Task 1 at `/sales/all`; Tasks 0 and 1 are then sequential, 0 first.

## Task 1: swap the fan-out in the Sales loader (web)

File: `web/src/routes/(app)/sales/+page.server.ts`

- [ ] **Step 1:** In the `season === 'all'` branch, delete the `Promise.all` over `seasonOptions(new Date(), 6)` and the `.flat()`. Replace with `sales = await api<SaleListItem[]>(event, '/sales');`.
- [ ] **Step 2:** Remove `seasonOptions` from the `$lib/season` import (keep `resolveSeason`, `seasonStartYearFromDate`). Confirm nothing else in the file uses it.
- [ ] **Step 3:** Leave the `currentSeason` branch (`/sales/grouped`), the single-season branch, `year`, `canCreate`, passes, matches, recipients and all three actions byte-identical.
- [ ] **Step 4 (verify):** in `web`, run `npm run check` and `npm run lint`; both must pass. Run `npm test` if vitest covers `$lib/season` or `sales-view` (they should be unaffected).
- [ ] **Step 5 (verify, behavioural):** with the app running, open `/sales?year=all` and confirm in the network/server log that exactly one `/sales` call is made for the list (no `/sales/season/*`), and that a season older than six back appears when the data has one. If `e2e/` already has a sales spec, add an "All seasons" case there and, only if the spec is new, register it in `e2e/playwright.config.ts` `testMatch`.

Expected: the rows for the other tabs and the totals footer behave as before; client-side `sortSales` handles ordering.

## Task 2: record the deferred payload follow-up

File: `docs/tech-debt.md`

- [ ] **Step 1:** Add an entry "All-seasons sales list is unbounded (PSG-85)" in the file's existing format: what (`GET /sales` returns every sale with allocations and gift joined, no pagination), why deferred (Sales page totals and tab counts are computed client-side over the full list, so paging needs server aggregates; about 100-200 KB after several seasons), cost to act (backend pagination plus aggregate endpoint, plus web changes; two tickets), trigger (p95 payload over about 1 MB or a user with thousands of sales).
- [ ] **Step 2:** Per project memory, also file that item as a PSG-* Linear issue (team "PSG Inventory", assigned to me) before telling the user the branch is ready for `/crit`. Use `blockedBy` none.

## Not in this plan

No new route, DTO, cache key, db method or usecase. No change to `/sales/season/:y`, `/sales/grouped`, caching TTL or invalidation.
