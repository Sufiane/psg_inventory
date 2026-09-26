# Season Pass E2E Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `e2e/tests/season-pass.e2e-spec.ts`, a single Playwright test that
exercises create, update, and delete of a season pass through the `/season`
page, reusing the PSG-32 auth/storageState scaffold.

**Architecture:** One new spec file, no other files touched. The test runs
in the existing `authenticated` Playwright project (already wired via
`testMatch: /(sale|season-pass)\.e2e-spec\.ts/` in
`e2e/playwright.config.ts`), which supplies a logged-in `storageState` from
`e2e/global-setup.ts` — no login steps needed in the spec itself. The test
opens the `<details>` create disclosure, fills the create form, asserts the
new pass appears, edits that same pass's own update form, asserts the
change, then deletes it (accepting the native `confirm()` dialog) and
asserts it's gone. A `Date.now()`-based label keeps the pass unique so
concurrent runs (e.g. a sibling `sale.e2e-spec.ts`) against the shared DB
never collide.

**Tech Stack:** Playwright (`@playwright/test` 1.49.1), TypeScript, SvelteKit
form actions (`web/src/routes/(app)/season/+page.svelte` +
`+page.server.ts`).

**Spec:** `docs/specs/2026-09-25-season-pass-e2e-spec-design.md`

## Global Constraints

> **Post-implementation deviation:** the live run falsified two of these
> constraints — one Svelte source change *was* required (the Delete
> button's sync `submitting` set prevented form submission), and the
> Step 1 locator code below does not work against the real markup (the
> label is only an input value property, invisible to `hasText`/attribute
> selectors). What actually shipped is documented in
> `docs/specs/2026-09-25-season-pass-e2e-spec-design.md` § "Deviations
> from this design". Treat the Step 1 snippet as superseded.

- No changes to `e2e/playwright.config.ts` — the `authenticated` project
  already matches `season-pass.e2e-spec.ts`.
- No backend, API, or Svelte source changes — the existing `/season` markup
  and accessible names are sufficient.
- No new seed data — the e2e user seeded by `scripts/seed-e2e.ts` is enough;
  a season pass has no club/team/opponent FK.
- Season pass label for this test must be unique per run:
  `` `Test Pass ${Date.now()}` ``.
- Follow the existing spec style in `e2e/tests/auth.e2e-spec.ts`: a
  `test.describe(...)` wrapper, `expect`/`test` imported from
  `@playwright/test`, shared constants imported from `../fixtures` where
  applicable (none needed here beyond the label generated in-test).

---

### Task 1: Write `season-pass.e2e-spec.ts` covering create, update, delete

**Files:**
- Create: `e2e/tests/season-pass.e2e-spec.ts`
- Reference (read-only, no changes): `e2e/tests/auth.e2e-spec.ts`,
  `e2e/playwright.config.ts`, `e2e/global-setup.ts`,
  `web/src/routes/(app)/season/+page.svelte`,
  `web/src/routes/(app)/season/+page.server.ts`

**Interfaces:**
- Consumes: `e2e/playwright.config.ts`'s `authenticated` project
  (`storageState: E2E_AUTH_FILE`, `baseURL`) — nothing to import, this is
  config-level; the spec just needs to exist under `e2e/tests/` matching the
  `season-pass.e2e-spec.ts` pattern.
- Produces: nothing consumed by other tasks — this is the only task in the
  plan.

- [ ] **Step 1: Write the spec file**

Create `e2e/tests/season-pass.e2e-spec.ts` with the following content:

```ts
import { expect, test } from '@playwright/test';

test.describe('season pass', () => {
    test('create, update, and delete a season pass', async ({ page }) => {
        const label = `Test Pass ${Date.now()}`;
        const updatedPrice = '750';

        await page.goto('/season');

        // Open the create disclosure.
        await page.getByText('+ Add another pass').click();

        const createForm = page.locator('details form');
        await createForm.getByLabel('Label').fill(label);
        await createForm.getByLabel('Price (€)').fill('500');
        await createForm.getByLabel('Category').fill('A');
        await createForm.getByLabel('Row').fill('1');
        await createForm.getByLabel('Seat').fill('1');
        await createForm.getByRole('button', { name: 'Add pass' }).click();

        await expect(page.getByRole('status')).toHaveText(/Pass added to season/);

        const card = page.locator('li', { hasText: label });
        await expect(card).toBeVisible();

        // Update: change the price on this pass's own form.
        await card.getByLabel('Price (€)').fill(updatedPrice);
        await card.getByRole('button', { name: 'Save' }).click();

        await expect(page.getByRole('status')).toHaveText('Pass updated.');
        await expect(card.getByLabel('Price (€)')).toHaveValue(updatedPrice);

        // Delete: accept the native confirm() dialog, then remove the pass.
        page.once('dialog', (dialog) => dialog.accept());
        await card.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByRole('status')).toHaveText('Pass removed.');
        await expect(page.locator('li', { hasText: label })).toHaveCount(0);
    });
});
```

Notes for the implementer:
- `page.getByRole('status')` matches the `role="status"` success banner
  rendered by `+page.svelte` — after each action, `use:enhance` re-invalidates
  the load function in place (no navigation), so waiting on this element's
  text is the correct way to know the action completed, no `waitForURL`
  needed.
- `details form` scopes to the create form specifically because it's the
  only `<form>` inside a `<details>` on this page — every other form lives in
  a plain `<li>`.
- `page.locator('li', { hasText: label })` scopes to the specific pass card
  by its unique label text, so `getByLabel('Price (€)')` inside `card` only
  ever matches that one card's own update form, not the create form or any
  other pass's card.
- The Delete button's `confirm()` call happens synchronously inside the
  click handler, so the `page.once('dialog', ...)` listener must be
  registered before `.click()` is awaited, as shown.

- [ ] **Step 2: Typecheck the e2e package**

Run: `cd e2e && npm run typecheck`
Expected: exits 0, no errors in `season-pass.e2e-spec.ts`.

- [ ] **Step 3: Run the new spec against a live stack**

This requires the backend API, the SvelteKit frontend (built + previewed on
the `baseURL` `playwright.config.ts` expects, default
`http://localhost:4173`), and a seeded database to be running locally —
follow whatever the repo's existing e2e run instructions are (e.g. the same
steps used to validate `auth.e2e-spec.ts` in PSG-32) to bring that stack up,
then seed it:

```bash
npm run local:db:seed:e2e
```

Then run just the new spec:

```bash
cd e2e && npx playwright test season-pass.e2e-spec.ts
```

Expected: 1 passed. If the full live-stack run isn't feasible in this
environment, leave this step's live-run verification to `qa-verifier` and
say so explicitly rather than claiming it passed — do not skip Step 2
(typecheck) in that case, that one must still be confirmed green here.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/season-pass.e2e-spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add season-pass create/update/delete spec (PSG-34)

Covers Task 5 of the e2e critical-path plan: exercises the /season
page's create-behind-<details>, update, and delete flows using a
timestamped label so it's safe to run concurrently with
sale.e2e-spec.ts against the shared DB.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
