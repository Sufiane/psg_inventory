# PSG-33: `sale.e2e-spec.ts` (create, SOLD, GIFTED, delete) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `e2e/tests/sale.e2e-spec.ts`, covering sale creation via `/sales/new` and,
via the `/sales` page's inline edit drawer, marking a sale SOLD, marking a sale GIFTED
with a recipient, and deleting a sale — using the already-seeded match and season pass.

**Architecture:** One new Playwright spec file, two `test()` blocks under one
`describe('sale lifecycle')`, run under the existing `authenticated` project (already
wired to match `sale.e2e-spec.ts` in `playwright.config.ts`). No application code, no
seed-script changes — see spec D2.

**Tech Stack:** Playwright `@playwright/test` 1.49.1, TypeScript 6.0.3, e2e package at
`e2e/` (own `tsconfig.json`, own `package.json`, `npm test` = `playwright test`). Sale
data comes from `scripts/seed-e2e.ts` (run via `npm run local:db:seed:e2e` from repo
root, separately from `npm test` inside `e2e/`).

**Spec:** `docs/specs/2026-09-25-psg-33-sale-e2e-spec-design.md`. Read D1 (why the ticket's
literal chain is split into two scenarios), D3 (desktop table vs mobile card), D4 (row
disambiguation by price), and D5 (dialog handling) before Task 1.

## Global Constraints

- **Test-only. No application code changes.** Nothing under `src/`, `web/src/`, or
  `scripts/` is modified by this plan — confirmed unnecessary in spec D2.
- Explicit return types are not required in `e2e/` (it's outside `src/`'s ESLint
  `explicit-function-return-type` scope — `auth.e2e-spec.ts` uses untyped arrow
  callbacks throughout; match that style).
- No single-letter locals, no inline `if` (repo-wide convention; `e2e/` has none of either
  today — keep it that way).
- Interact only with the desktop table markup (`saleRow`, `hidden sm:block`) — the
  `authenticated` Playwright project runs `devices['Desktop Chrome']`, so the `sm:hidden`
  mobile card markup is not visible (spec D3).
- Locate rows by a `getByRole('row', { name: /.../ })` regex combining the seeded
  opponent name and a scenario-specific `listedPrice` — never assume a row is "the only"
  one for the seeded opponent (spec D4).
- One `page.once('dialog', (dialog) => dialog.accept())` registered immediately before
  each "Delete sale" click — no dialog handling anywhere else (spec D5).
- Gate: `cd e2e && npm run typecheck` must pass before commit (no test runner assumed
  available in this environment — see Task 2's note on where the real Playwright run
  happens).

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `e2e/tests/sale.e2e-spec.ts` | Both scenarios: create → SOLD → delete, and create → GIFTED (with recipient) → delete |

**Modified:** none.

---

## Task 1 — Write `e2e/tests/sale.e2e-spec.ts`

**Files:**
- Create: `e2e/tests/sale.e2e-spec.ts`

**Interfaces:**
- Consumes: `E2E_OPPONENT_NAME` from `../fixtures` (already exported, seeded opponent
  name — unique per `scripts/seed-e2e.ts`'s `opponents.upsert`). No other fixture export
  is needed: the match date and season-pass label are not asserted on directly, only used
  implicitly by the single-match, single-pass seed data.
- Produces: nothing consumed by other tasks — this is the only task.

- [ ] **Step 1: Create the file with both scenarios**

Create `e2e/tests/sale.e2e-spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_OPPONENT_NAME } from '../fixtures';

// Distinct per scenario so a row can be found unambiguously even though both
// sales share the same seeded opponent/match — see spec D4. Playwright's
// `fullyParallel` config can run these two tests concurrently, so neither
// scenario may assume it is "the only" sale for this opponent.
const SOLD_PRICE = '501';
const GIFT_PRICE = '502';
const RECIPIENT_NAME = 'E2E Recipient';

async function createSale(page: import('@playwright/test').Page, listedPrice: string) {
    await page.goto('/sales/new');

    // Exactly one upcoming match exists in the e2e seed data
    // (scripts/seed-e2e.ts seeds a single match, always 30 days out), so the
    // second <option> (index 1, after the "Select a match…" placeholder) is
    // always the seeded E2E match.
    await page.getByLabel('Match').selectOption({ index: 1 });

    await page
        .getByRole('group', { name: 'Tickets per pass' })
        .getByRole('spinbutton')
        .fill('1');

    await page.getByLabel('Listed price (€)').fill(listedPrice);

    await page.getByRole('button', { name: 'Create sale' }).click();
    await page.waitForURL('**/sales');
}

function saleRow(page: import('@playwright/test').Page, listedPrice: string) {
    return page.getByRole('row', {
        name: new RegExp(`${E2E_OPPONENT_NAME}.*${listedPrice}`),
    });
}

test.describe('sale lifecycle', () => {
    test('create, mark SOLD, then delete a sale', async ({ page }) => {
        await createSale(page, SOLD_PRICE);

        const row = saleRow(page, SOLD_PRICE);

        await expect(row).toBeVisible();
        await expect(row).toContainText('PENDING');

        await row.getByRole('link', { name: 'Edit' }).click();

        const drawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        await expect(drawer).toBeVisible();
        await drawer.getByRole('button', { name: /^Mark sold/ }).click();
        await page.waitForURL('**/sales');

        const soldRow = saleRow(page, SOLD_PRICE);

        await expect(soldRow).toContainText('SOLD');

        await soldRow.getByRole('link', { name: 'Edit' }).click();

        const soldDrawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        page.once('dialog', (dialog) => dialog.accept());
        await soldDrawer.getByRole('button', { name: 'Delete sale' }).click();
        await page.waitForURL('**/sales');

        await expect(saleRow(page, SOLD_PRICE)).toHaveCount(0);
    });

    test('create, mark GIFTED with a recipient, then delete a sale', async ({ page }) => {
        await createSale(page, GIFT_PRICE);

        const row = saleRow(page, GIFT_PRICE);

        await expect(row).toBeVisible();
        await expect(row).toContainText('PENDING');

        await row.getByRole('link', { name: 'Edit' }).click();

        const drawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        await expect(drawer).toBeVisible();
        await drawer.getByLabel('Given to').fill(RECIPIENT_NAME);
        await drawer.getByRole('button', { name: 'Mark gifted' }).click();
        await page.waitForURL('**/sales');

        const giftedRow = saleRow(page, GIFT_PRICE);

        await expect(giftedRow).toContainText('GIFTED');

        await giftedRow.getByRole('link', { name: 'Edit' }).click();

        const giftedDrawer = page.getByRole('region', {
            name: new RegExp(`Edit sale vs ${E2E_OPPONENT_NAME}`),
        });

        await expect(giftedDrawer).toContainText(RECIPIENT_NAME);

        page.once('dialog', (dialog) => dialog.accept());
        await giftedDrawer.getByRole('button', { name: 'Delete sale' }).click();
        await page.waitForURL('**/sales');

        await expect(saleRow(page, GIFT_PRICE)).toHaveCount(0);
    });
});
```

- [ ] **Step 2: Typecheck the e2e package**

Run: `cd e2e && npm run typecheck`
Expected: PASS, no errors. This is a `tsc --noEmit` check only — it does not execute the
Playwright test, so it cannot catch a wrong locator or a real state-machine mismatch. It
only guarantees the file compiles (imports resolve, `Page` type usage is valid).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/sale.e2e-spec.ts
git commit -m "test(e2e): add sale.e2e-spec.ts for create/SOLD/GIFTED/delete (PSG-33)"
```

**Done when:** `e2e/tests/sale.e2e-spec.ts` exists with both scenarios and
`cd e2e && npm run typecheck` is green.

---

## Task 2 — Run the spec against a live app and record the result

This is the real verification Task 1's typecheck cannot provide. It requires a running
backend + web app + seeded database — out of scope for a typecheck-only sandbox, so this
task documents exactly how `qa-verifier` (or whoever runs it next) executes it. If your
environment cannot bring up the full stack, hand this task off rather than skipping
verification silently.

**Files:** none created or modified — this task runs and reads output only.

- [ ] **Step 1: Bring up the database and backend**

Run from the repo root:
```bash
npm run local:db:up
npm run local:db:migrate
npm run start:dev
```
Leave the backend running (default port per `.env`/`src/main.ts`).

- [ ] **Step 2: Build and serve the web app at the e2e baseURL**

`e2e/playwright.config.ts` defaults `baseURL` to `http://localhost:4173` (overridable via
`PLAYWRIGHT_BASE_URL`). Build and preview the SvelteKit app on that port per `web/`'s own
scripts (check `web/package.json` for the exact `build`/`preview` command names — not
modified by this plan, so not duplicated here).

- [ ] **Step 3: Seed e2e data**

Run from the repo root: `npm run local:db:seed:e2e`
Expected: logs `e2e seed complete: { userId, matchId, seasonStartYear }`.

- [ ] **Step 4: Run the spec**

Run: `cd e2e && npx playwright test sale.e2e-spec.ts`
Expected: both tests in `sale.e2e-spec.ts` pass. If a locator fails to resolve, re-check
it against the actual rendered markup in
`web/src/routes/(app)/sales/+page.svelte`/`web/src/routes/(app)/sales/new/+page.svelte`
(line numbers drift — re-read before adjusting) rather than guessing; the two most likely
failure modes are the row-name regex (D4) not matching the fr-FR currency format, or the
"Mark sold"/"Mark gifted" button accessible names not matching if the Svelte markup has
since changed.

- [ ] **Step 5: Re-run to confirm no test pollution**

Run the same command a second time back-to-back, without re-seeding:
`cd e2e && npx playwright test sale.e2e-spec.ts`
Expected: still passes. Confirms each scenario cleans up its own sale (Delete sale step)
rather than relying on the next `local:db:seed:e2e` run to reset state.

**Done when:** `sale.e2e-spec.ts` passes twice in a row without an intervening reseed.

---

## Self-Review (plan vs spec)

1. **Spec coverage:** D1 (two scenarios, both surfaces) → Task 1 Step 1's two `test()`
   blocks. D2 (no seed change) → Global Constraints states it explicitly; no seed-script
   task exists. D3 (desktop table) → every locator in Task 1 goes through
   `getByRole('row', ...)` / role-based queries against the table markup, never the card
   snippet. D4 (price-based row lookup) → `SOLD_PRICE`/`GIFT_PRICE` constants and
   `saleRow()` helper. D5 (dialog handling) → one `page.once('dialog', ...)` immediately
   before each delete click, nowhere else. D6 (free-text recipient) → `drawer.getByLabel('Given to').fill(...)`,
   no datalist interaction. Verification (Task 2) covers running the spec for real, which
   Task 1's typecheck-only gate cannot.
2. **Placeholder scan:** no TBD/TODO; every step has literal code or literal shell
   commands. Task 2 Step 2 intentionally defers to `web/package.json`'s own script names
   rather than guessing them, since this plan does not modify `web/` and duplicating a
   possibly-stale command would be worse than pointing at the source of truth.
3. **Type consistency:** `createSale(page, listedPrice)` and `saleRow(page, listedPrice)`
   signatures are used identically in both test blocks. `E2E_OPPONENT_NAME` is the only
   fixture import, matching what `../fixtures` actually exports (verified: `e2e/fixtures.ts`
   exports `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_OPPONENT_NAME`,
   `E2E_SEASON_PASS_LABEL` — only the first is unused here, unlike `auth.e2e-spec.ts`
   which uses the credentials instead since `global-setup.ts` already handles login for
   the `authenticated` project).
