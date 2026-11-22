# PSG-91 CSV import restyle — design

Status: draft for review. Plan: `docs/plans/2026-11-21-psg-91-csv-import-restyle.md`.
Scope: `web/` only. No backend change. Files: `web/src/lib/ui/ImportSalesModal.svelte`,
`web/src/lib/ui/ImportSalesDraft.svelte`, plus small new helpers.

## 1. Goal

The CSV import dialog was only re-tokened in the Stitch redesign slices. Give it a proper
layout pass using the existing tokens and patterns (sales page, dashboard): two-step modal,
chips for sale status, a readable row-state column, a plain-language summary, and a footer
with Cancel and a primary "Import N sales".

## 2. Design source

No Stitch design for the import modal is in the repo (the Stitch redesign spec and brief
cover Dashboard, Matches, Sales, Accounting only). The Stitch MCP tools were not available
to the planning agent, so existence in Stitch could not be checked. If the coordinator's
Stitch MCP finds no import screen, regeneration is needed; this design is built from the
existing tokens and the sales-page patterns and can be diffed against a Stitch screen later.

## 3. Verified: which row states the backend really returns

Read from `src/api/sales-import/sales-import.resolver.ts`, `dto/draft-row.dto.ts`,
`web/src/lib/types/sales-import.ts`. `rowStatus` is one of nine values:

| rowStatus | Kind | Raised by |
|---|---|---|
| `ok` | ok | default |
| `warn:opponent-mismatch` | warn | one match on date, name differs |
| `warn:multi-ticket-single-pass` | warn | nbTickets > 1, one pass selected |
| `error:match-missing` | error | no home match on that date |
| `error:opponent-not-found` | error | several matches on date, none by that name |
| `error:unallocated` | error | no pass, or multi-ticket across several passes |
| `error:invalid-cell` | error | unparseable cell |
| `error:sold-after-kickoff` | error | soldAt after match date |
| `error:gift-recipient-missing` | error | GIFTED, blank recipient (also client-side) |

The ticket said "today: gift-recipient-missing plus missing matches". That understates it:
the preview returns all of the above, and the current UI prints the raw string.

Stitch prompt states: "Match not found" is real (`error:match-missing` and
`error:opponent-not-found`, one human label each). "Duplicate" does not exist: the backend
has no duplicate detection (grep for duplicate/dedup in `src/api/sales-import` finds only a
comment). It is not designed. If duplicate detection is wanted it is a backend feature and
its own ticket.

Separately, "missing matches" (`PreviewResponse.missingMatches`) is a list of home matches
with no CSV row, not a row state. It stays as the "home matches without a sale" list.

## 4. Design

### 4.1 Step flow

Today: three internal steps (passes, upload, draft). Ticket shape is two: step 1 "Source"
(season pass multi-select + drop zone + Preview), step 2 "Review" (draft table). Merge passes
and upload into one step. Preview enabled when passes valid (>= 1, single season) and a file
is chosen. A two-item step indicator ("1 Source", "2 Review") sits under the title.

### 4.2 Modal shell

`<dialog>` keeps its showModal/close effect and reset logic untouched. Visual changes: title
in `font-display`, icon close button at `min-h-11`, `rounded-lg`, width `max-w-2xl` on step 1
and `max-w-5xl` on step 2 (the table has 11 columns), `max-h-[90vh]` with a scrolling body
and a footer that stays visible. Tokens only: `bg-surface`, `bg-surface-subtle`,
`border-line`, `text-ink*`, `bg-brand`.

### 4.3 Step 1

- Season pass picker (new `ImportPassPicker.svelte`, extracted because the current/previous
  group markup is duplicated in the modal): selectable rows (`rounded border`, checked row
  `bg-surface-strong border-line-strong`), current season open, previous seasons in
  `<details>`. Existing past-season warning and mixed-season error keep their logic,
  restyled with the `border-warning bg-warning/10` / negative patterns from the sales page.
- Drop zone: a `<label>` wrapping a visually hidden file input, dashed `border-line-strong`,
  dragover highlight (`border-primary`), `has-[:focus-visible]` ring, shows file name and
  size once chosen. Drag-and-drop sets the same `file` state as the input. The column hint
  paragraph becomes a short helper under the zone, same wording.
- Footer: "Cancel" (secondary) and primary "Preview".

### 4.4 Step 2: draft table

- Summary line above the table: "{ready} rows ready, {attention} need attention" (see Q1 for
  the exact definition). Zero rows: "No rows to import".
- Sale-status column: the existing `<select>` styled with `statusPill(row.status)` so it is
  the same four chips as the sales page (SOLD emerald, PENDING amber, CANCELLED plum, GIFTED
  teal). No new colours; `statusPill` is reused.
- Row-state column: replaces the raw `rowStatus` string with a label chip. `ok` rows show a
  quiet "Ready" (muted text, no chip, so a full table of ready rows is not a wall of
  green). Warn rows `bg-warning/15 text-warning-strong`; error rows
  `bg-negative/15 text-negative-strong`. Labels (one per real state):
  `ok` Ready; `warn:opponent-mismatch` Opponent differs; `warn:multi-ticket-single-pass`
  Split tickets; `error:match-missing` No match on date; `error:opponent-not-found`
  Opponent not found; `error:unallocated` Not allocated; `error:invalid-cell` Invalid
  value; `error:sold-after-kickoff` Sold after match; `error:gift-recipient-missing`
  Recipient missing. Label map is exhaustive over `DraftRowStatus` (type-checked).
- Recipient cell: when the row is GIFTED and the recipient is blank, the input gets a
  negative border, `bg-negative/10`, `aria-invalid`, placeholder "Recipient required".
  Otherwise unchanged (disabled unless GIFTED).
- Inputs share one class constant (compact, `min-h-9`, `rounded`, `border-line-strong`,
  `bg-surface`, focus ring from the global `:focus-visible` rule). Table header sticky,
  wrapper scrolls on both axes.
- Missing-matches list: kept; `<details>` restyled as a card, each row "date · opponent"
  with a "+ add sale" text button at touch-target size. Behaviour of `addRow` unchanged.
- Post-commit panel ("N sales imported", Undo import, Done): kept, restyled.
- Footer: "Cancel" (secondary, closes and resets the dialog) and primary "Import N sales",
  N = number of rows, disabled while any row has an error, while loading, or with zero rows.
  The old header "Back" link stays (returns to step 1), since Cancel no longer means back.
  Button label replaces "Validate", which was misleading (it commits).

### 4.5 Shared pieces

- `web/src/lib/import-draft.ts` (pure, unit-tested): `summarizeDraft(rows)`,
  `rowStateTone(status)`, `rowStateLabel(status)`, `needsRecipient(row)`.
- `Button.svelte` gains `variant?: 'primary' | 'secondary'` (default primary, so the 12
  existing users are unchanged). Secondary: `border border-line-strong text-ink
  hover:bg-surface-strong`, same `min-h-11`.

### 4.6 Not changing

Commit/revert API calls, `resolveRowStatus` semantics, the preview/commit contracts, state
machine and reset behaviour, the dialog open/close effect.

## 5. Open design questions and non-mechanical decisions

- Q1 (summary definition, recommendation made): `attention` = rows with an error or a
  warning; `ready` = rows with neither. Import is blocked only by errors (warnings stay
  importable, as today). Alternative: attention = errors only, which hides warnings from
  the summary; rejected because warnings are the "look before you import" cases.
- Q2 (step merge, recommendation made): merge passes and upload into one step per the
  ticket. Cost: Preview is gated on two inputs; a long pass list pushes the drop zone down.
  Mitigation: drop zone above the picker is rejected (passes drive the upload); keep passes
  first.
- Q3 (latent bug, recommend NOT fixing here): the client `resolveRowStatus` returns `ok`
  after any edit, which clears server-side `error:*` and `warn:*` states for that row (for
  example editing the date on an `error:match-missing` row flips it to Ready and enables
  Import). The commit re-validates server-side (`validateCommitRows`) and returns an error
  message, so no bad data is written, but the UI briefly lies. A fix means either
  preserving non-client states until a re-preview, or a re-validate endpoint. File as its
  own ticket and a `docs/tech-debt.md` entry.
- Q4: Cancel on step 2 closes and discards the preview (the user re-uploads). Acceptable
  because Back remains; confirm.
- Q5: no Playwright coverage exists for import (none of the e2e specs touch it). Adding one
  needs a CSV fixture, upload handling, and an entry in `testMatch` in
  `e2e/playwright.config.ts` or it never runs. Recommended as a separate follow-up ticket,
  not in this change.
- Q6: Stitch design existence unconfirmed (section 2).

## 6. Testing

Vitest for `import-draft.ts` (the repo has no component test harness; pure helpers are the
established pattern, see `sale-helpers.spec.ts`). `svelte-check` and lint for components.
Manual verification in the running app with a CSV that exercises: all four sale statuses,
a GIFTED row with no recipient, a missing-match date, an opponent mismatch, and a
multi-ticket single-pass row. Mobile (375 px) and keyboard-only pass on the drop zone.

## 7. Size

About 700 to 800 changed lines in total (both modal files are close to full rewrites of
their markup). Near the cap, so the plan proposes a three-slice split.
