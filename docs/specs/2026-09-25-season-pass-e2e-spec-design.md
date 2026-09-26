# Season pass E2E spec (PSG-34)

## Context

Parent: PSG-31 (E2E tests for critical paths: login, sale CRUD, season pass
creation). Covers the season-pass slice. Blocked by PSG-32 (E2E foundation),
which is merged: `e2e/` has `global-setup.ts` (logs in as the seeded e2e user
and saves `storageState`), `fixtures.ts` (shared e2e test data constants),
`paths.ts` (filesystem path helpers, not URL routes), and one working spec,
`e2e/tests/auth.e2e-spec.ts`. `playwright.config.ts` already declares an
`authenticated` project with
`testMatch: /(sale|season-pass)\.e2e-spec\.ts/` and
`storageState: E2E_AUTH_FILE` — this ticket's spec file slots directly into
that project with no config change.

The referenced plan doc
(`docs/plans/2026-09-24-e2e-critical-path-tests-implementation-plan.md`) does
not exist in this workspace. This spec derives the season-pass test design
from the issue description and the existing scaffold instead.

## Goal

Add `e2e/tests/season-pass.e2e-spec.ts`: one sequential test that creates,
updates, and deletes a season pass through the `/season` page UI, using the
already-authenticated storage state from PSG-32.

## Non-goals

- No changes to `playwright.config.ts` (already wired for this file).
- No backend/API changes. No UI source changes. Investigation of
  `web/src/routes/(app)/season/+page.svelte` and `+page.server.ts` found the
  form fully operable with existing accessible labels and button names; no
  missing test hooks (e.g. no `data-testid` gaps that block the test).
- No new seed data. A season pass has no club/team/opponent association
  (`{userId, seasonStartYear, price, label, category, row, seat}`), so the
  existing e2e user seeded by `scripts/seed-e2e.ts` is sufficient. The seed
  script's own `E2E_SEASON_PASS_LABEL` ("E2E Tribune") pass is for the sale
  flow's allocation and is untouched by this spec.

## Page mechanics (as read from source)

- `/season` loads the current season year by default
  (`seasonStartYearFromDate(new Date())`) unless a `?year=` query param is
  given. The create form's hidden `seasonStartYear` field always mirrors
  `data.year`, so navigating to plain `/season` and creating a pass targets
  the currently-displayed season — no year-selector interaction needed.
- The create form lives inside `<details><summary>+ Add another pass</summary>`
  and is closed by default; the spec must open it (click the summary, which
  is native disclosure behavior, or `.click()` on the `<details>` — no JS
  toggle to wait for) before the form fields are interactable.
- Every existing pass renders its **own** `<form action="?/update">` with the
  same field names (`label`, `price`, `category`, `row`, `seat`) as the create
  form, plus a `formaction="?/remove"` Delete button. This means `label`,
  `category`, etc. are **not unique accessible names on the page** — locators
  must be scoped per-form:
  - Create form: scope to the `<details>` element (only one create form
    exists).
  - Update/Delete for the pass under test: scope to the `<li>` card that
    contains the just-created unique label text.
- All fields use implicit `<label><span>Text</span><input></label>` wrapping,
  so `getByLabel(...)` works once scoped to the right form.
- Delete triggers a native `confirm()` dialog (`onclick` handler); the test
  must register a `page.once('dialog', ...)` handler to accept it before
  clicking Delete.
- Server actions respond with `{ success: true, info: '...' }` on success
  (`Pass added to season <year>.`, `Pass updated.`, `Pass removed.`), rendered
  in a `role="status"` element on success. `use:enhance` on every form
  re-invalidates the load function without a full navigation, so `data` (and
  the rendered lists) update in place after each action — no `waitForURL` or
  manual reload needed, just wait on the DOM change (new `<li>` appearing /
  disappearing, or the status text).
- The page renders passes in two places: the season-scoped list (left) and
  an all-time "All recorded passes" list (right), both driven by the same
  underlying data and both reflecting updates/deletes. The test only needs to
  assert against the season-scoped list (left column) to keep it simple;
  the second list is not asserted on.

## Uniqueness / concurrency

`sale.e2e-spec.ts` (out of scope here, tracked separately) runs against the
same seeded e2e user and shared DB, potentially concurrently. This spec avoids
collisions by minting its own label at run time:

```ts
const label = `Test Pass ${Date.now()}`;
```

This label is never asserted to be the *only* pass with a given price/category
— the test locates its own card strictly by this unique label text, so it's
unaffected by other passes (seeded or created by concurrent runs) that may
exist for the same user/season.

## Test flow (single sequential `test()`)

1. Navigate to `/season` (already authenticated via storageState — no login
   steps).
2. Open the create disclosure (click "+ Add another pass" summary).
3. Fill the create form (scoped to the `<details>`) with the unique label,
   an arbitrary price/category/row/seat, and submit ("Add pass").
4. Assert the success status text (e.g. `/Pass added to season/`) and that a
   card containing the unique label is now visible in the season-scoped list.
5. Scope a locator to that `<li>` card. Fill its update form with a changed
   price (and/or category) and submit ("Save").
6. Assert the success status text (`Pass updated.`) and that the card now
   shows the updated price.
7. Register a one-time dialog handler to accept the confirm, then click that
   card's "Delete" button.
8. Assert the success status text (`Pass removed.`) and that the card
   (matched by the unique label) is no longer present.

This single test covers create, update, and delete as one linear flow acting
on one entity, per the issue's requirement and the confirmed approach
(single `test()`, not three `test.describe.serial` cases).

## Files touched

- **New:** `e2e/tests/season-pass.e2e-spec.ts`.
- No other file changes (config, fixtures, paths, and seed script already
  cover everything this spec needs).

## Scope confirmation

Frontend-only (Playwright test authoring). No backend, API, or Svelte source
changes required — the existing `/season` page markup and accessible names
are sufficient to write robust, correctly-scoped locators.

## Deviations from this design (added after implementation)

The live run (this design's assumptions were never executed before
implementation) falsified two premises above. What shipped differs in two
ways; the rest of this document stands as the point-in-time design:

1. **One UI source change was required:** `web/src/routes/(app)/season/
   +page.svelte` (Delete button). The Delete `onclick` set
   `submitting = 'remove:…'` synchronously, which disabled the button
   during click dispatch — *before* browser submit activation — so the
   form silently never submitted. Fix: `onclick` is confirm-only
   (`preventDefault()` on reject) and the spinner state moved into the
   `use:enhance` submit callback, mirroring the sales-page pattern.
   The "No UI source changes" non-goal above was wrong.
2. **Card scoping is not by label text:** the label exists in a season
   card only as `<input name="label">`'s value (a `value` *property* —
   not text content, not a `value` attribute), so `hasText` and attribute
   selectors both fail. The shipped spec discovers the card by comparing
   `inputValue()` across season-list cards, then anchors all later
   assertions on the hidden `passId` input's stable `value` attribute.
   Also, `getByRole('status')` is ambiguous (the in-button `Spinner`
   renders `role="status"` mid-flight) — the spec scopes to
   `p[role="status"]`.

Known deferred bug (surfaced by implementation, out of scope for this
ticket): after a successful Save, SvelteKit's form reset plus Svelte's
skip-unchanged-values leaves the card's label/category/row/seat inputs
blank (they're `required`, so a second Save is blocked until retyped).
Candidate fix: `await update({ reset: false })` in the update form's
enhance callback. Needs its own ticket.
