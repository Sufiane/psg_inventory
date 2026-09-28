# PSG-42: Consistent branch `describe` nesting in `sales-import.csv.spec.ts` — Design

**Date:** 2026-09-27
**Status:** Draft
**Issue:** PSG-42 (found during the repo-wide tech-debt audit, 2026-09-27)
**Type:** Test-structure-only refactor of one spec file. No runtime source changes, no
behavior change, test count unchanged (13 → 13).

## Context

`src/api/sales-import/sales-import.csv.spec.ts` (177 lines, verified) tests
`parseImportCsv` — a pure parser whose `CsvParseResult` has four branches: `ok`,
`missing-column`, `unknown-column`, `empty`. The file mixes two structures:

- **Conformant:** three `describe('when …')` blocks already exist —
  `when a row is GIFTED` (line 72), `when the recipient cell is blank` (line 141),
  `when the header is absent` (line 155).
- **Non-conformant:** ten flat `it`s sit directly under the root `describe`, and their
  titles encode the varying input condition — e.g. `'defaults invest to 0 when column
  omitted'`, `'reports a missing required column'`, `'accepts case-insensitive status'`.
  Two of them (`'parses a recipient value onto the row'`, `'does not report recipient as
  an unknown column'`) sit inside the noun-group `describe('recipient column')` but are
  still condition-in-title flat `it`s.

So the test-structure convention is applied to some branches of the same file and not
others — exactly what PSG-42 calls out.

### The convention, and where it is documented

> One `describe` per conditional branch, titled `when …`. `it` titles state only the
> outcome and never repeat the condition. Shared setup goes in that `describe`'s own
> `beforeEach`.

Verified sources in this repo:

- **Repeated in every implementation plan's conventions section**, e.g.
  `docs/plans/2026-08-30-ask-a-question.md` line 22 (fullest wording, quoted above),
  `docs/plans/2026-09-15-gift-recipient-required.md` line 23,
  `docs/plans/2026-09-26-psg-29-get-amortization-usecase.md` line 21.
- **`docs/tech-debt.md` entry §5** states it as house policy: "The CLAUDE.md
  Jest/Vitest convention requires a `describe` per conditional branch (`when X`), with
  `it` titles stating only the outcome." Note: no `CLAUDE.md` exists in this repo today
  (glob-verified) — the operative sources are the plan docs above plus the conformant
  specs above all.
- **Conformant exemplar specs:** `src/env.schema.spec.ts` (no flat `it`s at all — even
  the valid-input case is `describe('when it is a valid positive integer string')`),
  `src/api/accounting/utils/status-converter.util.spec.ts`,
  `src/llm/llm.service.spec.ts`.
- **Direct precedent:** PSG-37 was this exact class of fix for another file, merged as
  `c29bf5a test(accounting): nest get-amortization usecase spec by branch (PSG-37)` —
  a single commit touching only the spec file (167 insertions / 151 deletions, pure
  restructure).

## Goal

1. Every `it` in `sales-import.csv.spec.ts` sits inside a `describe('when …')` that
   states the input condition; each `it` title states only the outcome.
2. Test bodies stay byte-identical apart from indentation and the `it`/`describe` titles
   named in the mapping below — same 13 tests, same assertions.
3. Full gate stays green: `npm run typecheck`, `npm run lint`, `npm run lint:deps`,
   `npm test` (the exact sequence of CI's `checks` job, minus `npm ci`/`build` which CI
   runs itself).

## Non-goals

- No changes to `src/api/sales-import/sales-import.csv.ts` or any non-spec source.
- No assertion-style rewrites — the `if (result.kind === 'ok')` / `'error'` narrowing
  guards stay exactly as they are (TypeScript requires them; converting to
  `toMatchObject` would be an assertion change, not a structure change).
- No changes to sibling specs (`sales-import.resolver.spec.ts`,
  `sales-import.service.spec.ts`) or any other spec — findings are recorded as
  tech-debt instead (see below).
- No new, merged, or deleted test cases; no file rename.
- No lint rule / tooling enforcement of the convention (separate idea, not PSG-42).

## Current state → target (verified against the file, 2026-09-27)

Lines are pre-refactor. "Target `it`" is the full new title after the wrap.

| # | Lines | Current form | Target `describe('when …')` | Target `it` |
|---|---|---|---|---|
| 1 | 4–26 | flat `it('parses a minimal valid CSV')` | `when the CSV is valid` | `returns the parsed row` |
| 2 | 28–38 | flat `it('defaults invest to 0 when column omitted')` | `when the invest column is omitted` | `defaults invest to 0` |
| 3 | 40–46 | flat `it('strips a BOM prefix')` | `when the CSV starts with a BOM` | `parses the header row` |
| 4 | 48–58 | flat `it('skips blank rows')` | `when there are blank rows` | `returns only the non-blank rows` |
| 5 | 60–70 | flat `it('accepts case-insensitive status')` | `when the status differs in case` | `stores the status in upper case` |
| 6 | 72–85 | `describe('when a row is GIFTED')` → `it('parses the status')` | *(unchanged)* | *(unchanged)* |
| 7 | 87–100 | flat `it('reports a missing required column')` | `when a required column is missing` | `reports missing-column and the column name` |
| 8 | 102–116 | flat `it('reports an unknown column')` | `when an unknown column is present` | `reports unknown-column and the column name` |
| 9 | 118–126 | flat `it('reports an empty file')` | `when the file is empty` | `reports empty` |
| 10 | 129–139 | flat `it('parses a recipient value onto the row')` (inside `recipient column`) | `when a recipient column is present` *(new group, shared with #11)* | `parses the value onto the row` |
| 11 | 169–175 | flat `it('does not report recipient as an unknown column')` (inside `recipient column`) | same group as #10 | `does not report it as an unknown column` |
| 12 | 141–153 | `describe('when the recipient cell is blank')` → `it('yields null')` | *(unchanged)* | *(unchanged)* |
| 13 | 155–167 | `describe('when the header is absent')` → `it('yields null for every row')` | *(unchanged)* | *(unchanged)* |

Sibling ordering inside the root `describe` stays exactly as today (GIFTED's block stays
between #5 and #7; the `recipient column` group stays last).

## Decisions

### D1 — Every test, including the happy path, gets a `when …` describe

`parseImportCsv`'s outcome varies with the input in all 13 tests — including #1, whose
"minimal valid CSV" is the `ok` branch of the same dispatch as `empty`/`missing-column`/
`unknown-column`. If the error branches get `when` describes and the happy path stays
flat, the file keeps a seed of the very inconsistency PSG-42 removes. The fully
conformant exemplars nest valid-input cases too (`when it is a valid positive integer
string` in `env.schema.spec.ts`).

**Rejected:** leaving `it('parses a minimal valid CSV')` flat as a "baseline". The
counter-exemplar `src/shared/utils/recipient-name.util.spec.ts` keeps flat `it`s — but
those (`'trims leading and trailing whitespace'`) exercise unconditional core behavior
with no input branch; `parseImportCsv` has no equivalent test.

### D2 — The noun-group `describe('recipient column')` stays; its innards restructure

Noun groups holding `when …` describes are established house style
(`env.schema.spec.ts`'s `describe('ASK_RATE_LIMIT_PER_HOUR')`,
`sales-import.resolver.spec.ts`'s `describe('gift recipient requirement')`), and this
group was introduced deliberately by `docs/plans/2026-09-15-gift-recipient-required.md`.
Inside it, #10 and #11 are both conditioned on "a recipient column is present", so they
merge as sibling `it`s under one new `describe('when a recipient column is present')` —
that is precisely "sibling `it`s state only the outcome". #12 and #13 are already
conformant and stay byte-identical.

### D3 — Test bodies untouched

Bodies change only by one indentation level (recipient group: two of them by none).
No assertion, fixture, CSV string, or narrowing guard is edited. This keeps the diff
mechanically reviewable — the same net-zero property PSG-37's fix had (`c29bf5a`).

### D4 — Scope: the csv spec only; siblings recorded as tech-debt

Verified sibling status (2026-09-27):

- `sales-import.resolver.spec.ts` (449 lines): 10 flat `it`s directly under
  `describe('resolveDraftRows')` (lines 81–171, 275, 286) with conditions in titles
  (`'flags a mismatched opponent as warn'`, `'errors on nb>1 with multi-pass and leaves
  allocations empty'`, …). The `kickoff guard on soldAt` group has residual
  condition-in-title `it`s of the same class (four copies of the sold-after-kickoff
  title, plus one under the GIFTED describe); `gift recipient requirement` is
  conformant. (Corrected during review — see tech-debt §6 for the full account.)
- `sales-import.service.spec.ts` (204 lines): flat `it`s under `describe('preview')`,
  `describe('commit')`, `describe('revert')` with condition-in-title wording
  (`'throws SEASON_PASS_FORBIDDEN when pass belongs to other user'`,
  `'is idempotent when nothing matches'`), though `revert` also has conformant
  `when sales are deleted` / `when nothing matches` describes — same partial state as
  PSG-42's file.

Both are out of scope for PSG-42 (the issue says so; PSG-37's precedent was a
single-file fix). They are recorded by appending a new entry **§6** to
`docs/tech-debt.md`, following the file's own header rule ("Add an entry when you find
something real but out of scope"), cross-referencing PSG-42.

(Aside noticed while writing this: entry §5's own item — flat `it`s in the
`get-amortization` usecase spec — appears to have been fixed by `c29bf5a` but the entry
was never deleted. Deleting §5 is **not** part of PSG-42; §6 is simply appended after
it. Flagged in the handoff report instead.)

### D5 — Verification: green after every step, full CI gate at the end

Single-file vitest run after each restructuring task; the CI-equivalent gate
(`typecheck` → `lint` → `lint:deps` → `test`) once at the end. Note this workspace
currently has **no `node_modules`** — `npm ci` is a prerequisite of any verification.
Unit tests need no Docker stack (CI's `checks` job runs `npm test` without services).

## Target structure (complete)

```ts
describe('parseImportCsv', () => {
    describe('when the CSV is valid', () => {
        it('returns the parsed row', () => { /* body unchanged */ });
    });
    describe('when the invest column is omitted', () => {
        it('defaults invest to 0', () => { /* body unchanged */ });
    });
    describe('when the CSV starts with a BOM', () => {
        it('parses the header row', () => { /* body unchanged */ });
    });
    describe('when there are blank rows', () => {
        it('returns only the non-blank rows', () => { /* body unchanged */ });
    });
    describe('when the status differs in case', () => {
        it('stores the status in upper case', () => { /* body unchanged */ });
    });
    describe('when a row is GIFTED', () => {
        it('parses the status', () => { /* unchanged */ });
    });
    describe('when a required column is missing', () => {
        it('reports missing-column and the column name', () => { /* body unchanged */ });
    });
    describe('when an unknown column is present', () => {
        it('reports unknown-column and the column name', () => { /* body unchanged */ });
    });
    describe('when the file is empty', () => {
        it('reports empty', () => { /* body unchanged */ });
    });
    describe('recipient column', () => {
        describe('when a recipient column is present', () => {
            it('parses the value onto the row', () => { /* body unchanged */ });
            it('does not report it as an unknown column', () => { /* body unchanged */ });
        });
        describe('when the recipient cell is blank', () => {
            it('yields null', () => { /* unchanged */ });
        });
        describe('when the header is absent', () => {
            it('yields null for every row', () => { /* unchanged */ });
        });
    });
});
```

(`/* body unchanged */` = the corresponding current test body, re-indented one level.
The implementation plan reproduces each body in full — this outline is the map, not the
artifact.)

## Verification

```bash
npm ci   # one-time: this workspace starts with no node_modules

# after every restructuring step:
npx vitest run src/api/sales-import/sales-import.csv.spec.ts   # expect 13/13 passing
grep -cE '^\s+it\(' src/api/sales-import/sales-import.csv.spec.ts   # expect 13, before and after

# final gate (mirrors CI's `checks` job):
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Acceptance:

1. 13 `it`s before and after; all pass; full suite green.
2. Every `it` is nested under a `describe('when …')` (the two recipient-column `it`s
   under their shared `when a recipient column is present`).
3. `git diff` shows only re-indentation, title changes, and added `describe` wrappers in
   `sales-import.csv.spec.ts`, plus one appended entry in `docs/tech-debt.md`.
4. `npm run lint` clean — lint-staged runs `prettier --write` (tabWidth 4,
   printWidth 90) + eslint on commit, so formatting is enforced automatically.

## Files touched on completion

**Created (by planning, before implementation starts):**

- `docs/specs/2026-09-27-psg-42-sales-import-csv-spec-branch-describes-design.md` (this spec)
- `docs/plans/2026-09-27-psg-42-sales-import-csv-spec-branch-describes.md` (implementation plan)

**Modified (by implementation):**

- `src/api/sales-import/sales-import.csv.spec.ts` — wrap/retitle per the mapping table
- `docs/tech-debt.md` — append entry §6 (sibling-spec findings)

**Unchanged:** everything else — notably `sales-import.csv.ts`, the resolver/service
usecase and db specs, `web/`, CI config.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| An assertion slips during re-indentation | Low | Bodies specified verbatim in the plan; `grep -cE '^\s+it\('` = 13 before/after; single-file run green after each task |
| Reviewer noise from formatting churn | Low | Prettier changes are pure indentation (tabWidth 4, printWidth 90); diff is structurally self-explanatory (wrappers + titles) |
| Something scripts on old `it` titles via `vitest -t` | Very low | Old titles appear only in historical plan docs (`docs/plans/2026-09-11-gifted-sale-status.md` references `-t "parses the status"` — that title is unchanged) |
| Scope creep into sibling specs | Low | D4 bounds the change to two files; siblings are a tech-debt entry, not an edit |
