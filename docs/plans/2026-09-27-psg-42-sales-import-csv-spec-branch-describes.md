# PSG-42: Nest `sales-import.csv.spec.ts` describes per branch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make branch nesting consistent throughout `src/api/sales-import/sales-import.csv.spec.ts` — every conditional branch gets its own `describe('when …')`, sibling `it`s state only the outcome — with zero behavior change (13 tests in, 13 tests out, bodies byte-identical apart from indentation and titles), plus one appended `docs/tech-debt.md` entry recording the same issue in the sibling specs.

**Architecture:** Pure test-structure refactor of a single spec file: wrap each flat condition-in-title `it` in a `describe('when …')`, move the condition from the `it` title into the `describe` title, re-indent bodies one level. Assertions, CSV fixtures, and the `if (result.kind === …)` narrowing guards are untouched. Sibling specs (`sales-import.resolver.spec.ts`, `sales-import.service.spec.ts`) are documented as tech-debt, not edited.

**Tech Stack:** Vitest 5.0.0 (globals), TypeScript 6.0.3, Node 24.21.0, Prettier (tabWidth 4, printWidth 90, singleQuote, trailingComma all — applied on commit via lint-staged), commitlint (`@commitlint/config-conventional`).

**Spec:** `docs/specs/2026-09-27-psg-42-sales-import-csv-spec-branch-describes-design.md` — the mapping table there (Current state → target) is the authority for every title; this plan reproduces the full code.

## Global Constraints

- **Structure only.** Exactly two files are modified: `src/api/sales-import/sales-import.csv.spec.ts` and `docs/tech-debt.md`. No other file may change. No non-spec source, no fixtures, no assertions, no `expect` lines edited — the only textual changes in the spec are: added `describe('when …')` wrappers, changed `it(` titles (exactly the ones in the spec's mapping table), and indentation.
- **13 `it`s before and after:** `grep -cE '^\s+it\(' src/api/sales-import/sales-import.csv.spec.ts` must print `13` before Task 1 and after Task 5.
- **Exact titles:** `describe`/`it` titles must match the spec's mapping table verbatim.
- **Order preserved:** sibling order inside the root `describe('parseImportCsv')` stays as today (the GIFTED block stays between the status test and the error tests; the `recipient column` group stays last).
- **Line numbers cited in tasks are pre-refactor** (file as of 2026-09-27, 177 lines). Earlier tasks shift them — locate each edit by the quoted `it('…')` title, which is unambiguous.
- **Environment:** run `npm ci` first — this workspace starts with no `node_modules` (verified 2026-09-27). Unit tests need no Docker stack (CI's `checks` job runs `npm test` without services).
- **Commits:** intermediate tasks verify green but do **not** commit. Task 5 makes exactly two commits — one `test(sales-import): … (PSG-42)` for the spec restructure (single-commit precedent: PSG-37's `c29bf5a`), one `docs(sales-import): …` for the tech-debt entry (docs-commit precedent: `eaab9df`).
- Formatting is enforced by lint-staged on commit (`prettier --write` + `eslint --max-warnings 0` on `*.ts`); if a code block below and Prettier disagree on line breaking, Prettier wins (run `npx prettier --write src/api/sales-import/sales-import.csv.spec.ts`).

---

## File Map

| File | Action | Tasks |
|---|---|---|
| `src/api/sales-import/sales-import.csv.spec.ts` | Modify (wrap/retitle its; ~177 → ~200 lines) | T1, T2, T3, T5 |
| `docs/tech-debt.md` | Modify (append entry §6) | T4, T5 |
| `docs/specs/2026-09-27-psg-42-sales-import-csv-spec-branch-describes-design.md` | Created during planning (pre-exists this plan) | — |
| `docs/plans/2026-09-27-psg-42-sales-import-csv-spec-branch-describes.md` | Created during planning (pre-exists this plan) | — |

**Untouched:** `sales-import.csv.ts`, `sales-import.resolver.spec.ts`, `sales-import.service.spec.ts`, all usecase/db specs, `web/`, CI config.

---

## Phase 1 — Restructure the spec

### Task 1: Wrap the five input-variation tests (mapping rows 1–5)

**Files:**
- Modify: `src/api/sales-import/sales-import.csv.spec.ts:4-70`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the first five children of `describe('parseImportCsv')` become `when`-describes. Rows 6–13 untouched, still green — this task changes no assertions, so the suite stays at 13/13.

- [ ] **Step 1: Replace current lines 4–26** (`it('parses a minimal valid CSV')`) with:

```ts
    describe('when the CSV is valid', () => {
        it('returns the parsed row', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status,invest\n2025-09-14,Marseille,120,1,SOLD,80\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows).toEqual([
                    {
                        rowIndex: 0,
                        date: '2025-09-14',
                        opponent: 'Marseille',
                        listedPrice: 120,
                        nbTickets: 1,
                        status: 'SOLD',
                        invest: 80,
                        soldAt: null,
                        recipient: null,
                    },
                ]);
            }
        });
    });
```

- [ ] **Step 2: Replace current lines 28–38** (`it('defaults invest to 0 when column omitted')`) with:

```ts
    describe('when the invest column is omitted', () => {
        it('defaults invest to 0', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows[0]!.invest).toBe(0);
            }
        });
    });
```

- [ ] **Step 3: Replace current lines 40–46** (`it('strips a BOM prefix')`) with:

```ts
    describe('when the CSV starts with a BOM', () => {
        it('parses the header row', () => {
            const csv =
                '\uFEFFdate,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');
        });
    });
```

- [ ] **Step 4: Replace current lines 48–58** (`it('skips blank rows')`) with:

```ts
    describe('when there are blank rows', () => {
        it('returns only the non-blank rows', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status\n\n2025-09-14,Marseille,120,1,SOLD\n\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows).toHaveLength(1);
            }
        });
    });
```

- [ ] **Step 5: Replace current lines 60–70** (`it('accepts case-insensitive status')`) with:

```ts
    describe('when the status differs in case', () => {
        it('stores the status in upper case', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,sold\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('ok');

            if (result.kind === 'ok') {
                expect(result.rows[0]!.status).toBe('SOLD');
            }
        });
    });
```

Leave the existing `describe('when a row is GIFTED', …)` block (current lines 72–85) exactly as-is.

- [ ] **Step 6: Format and run the single spec**

```bash
npx prettier --write src/api/sales-import/sales-import.csv.spec.ts
npx vitest run src/api/sales-import/sales-import.csv.spec.ts
```

Expected: **13/13 passing**; the reporter shows the five new `when …` groups.
(If `npx vitest` fails with `ERR_MODULE_NOT_FOUND`, run `npm ci` first.)

- [ ] **Step 7: Confirm the test count is unchanged**

```bash
grep -cE '^\s+it\(' src/api/sales-import/sales-import.csv.spec.ts
```

Expected: `13`.

---

### Task 2: Wrap the three error-branch tests (mapping rows 7–9)

**Files:**
- Modify: `src/api/sales-import/sales-import.csv.spec.ts` (the block that is currently lines 87–126, after Task 1's edits)

**Interfaces:**
- Consumes: Task 1's restructured file; the three error tests still sit flat at the point this task starts.
- Produces: rows 7–9 become `when`-describes; rows 10–13 (recipient group) untouched.

- [ ] **Step 1: Replace** `it('reports a missing required column', …)` **with:**

```ts
    describe('when a required column is missing', () => {
        it('reports missing-column and the column name', () => {
            const csv =
                'date,opponent,listedPrice,status\n2025-09-14,Marseille,120,SOLD\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('error');

            if (result.kind === 'error') {
                expect(result.error).toBe('missing-column');

                if (result.error === 'missing-column') {
                    expect(result.column).toBe('nbTickets');
                }
            }
        });
    });
```

(Note: the one-line `const csv = '…';` from the original must break onto two lines at the deeper indent to stay within printWidth 90 — the block above shows the Prettier-normalized form.)

- [ ] **Step 2: Replace** `it('reports an unknown column', …)` **with:**

```ts
    describe('when an unknown column is present', () => {
        it('reports unknown-column and the column name', () => {
            const csv =
                'date,opponent,listedPrice,nbTickets,status,foo\n2025-09-14,Marseille,120,1,SOLD,x\n';
            const result = parseImportCsv(Buffer.from(csv));

            expect(result.kind).toBe('error');

            if (result.kind === 'error') {
                expect(result.error).toBe('unknown-column');

                if (result.error === 'unknown-column') {
                    expect(result.column).toBe('foo');
                }
            }
        });
    });
```

- [ ] **Step 3: Replace** `it('reports an empty file', …)` **with:**

```ts
    describe('when the file is empty', () => {
        it('reports empty', () => {
            const result = parseImportCsv(Buffer.from(''));

            expect(result.kind).toBe('error');

            if (result.kind === 'error') {
                expect(result.error).toBe('empty');
            }
        });
    });
```

- [ ] **Step 4: Format and run the single spec**

```bash
npx prettier --write src/api/sales-import/sales-import.csv.spec.ts
npx vitest run src/api/sales-import/sales-import.csv.spec.ts
```

Expected: **13/13 passing.**

- [ ] **Step 5: Confirm the test count**

```bash
grep -cE '^\s+it\(' src/api/sales-import/sales-import.csv.spec.ts
```

Expected: `13`.

---

### Task 3: Restructure the `recipient column` group (mapping rows 10–11)

**Files:**
- Modify: `src/api/sales-import/sales-import.csv.spec.ts` (the `describe('recipient column', …)` group; rows 12–13 inside it stay byte-identical)

**Interfaces:**
- Consumes: Tasks 1–2; only the two flat `it`s directly under `describe('recipient column')` remain.
- Produces: the group's first two `it`s merge under a shared `describe('when a recipient column is present')`; the existing `when the recipient cell is blank` and `when the header is absent` describes are not edited at all.

- [ ] **Step 1: Replace the two flat `it`s** — `it('parses a recipient value onto the row', …)` (current lines 129–139) and `it('does not report recipient as an unknown column', …)` (current lines 169–175) — **with this single group** (keep it first inside `recipient column`, before the two existing describes):

```ts
        describe('when a recipient column is present', () => {
            it('parses the value onto the row', () => {
                const csv =
                    'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,Marc\n';
                const result = parseImportCsv(Buffer.from(csv));

                expect(result.kind).toBe('ok');

                if (result.kind === 'ok') {
                    expect(result.rows[0]!.recipient).toBe('Marc');
                }
            });

            it('does not report it as an unknown column', () => {
                const csv =
                    'date,opponent,listedPrice,nbTickets,status,recipient\n2025-09-14,Marseille,120,1,GIFTED,Marc\n';
                const result = parseImportCsv(Buffer.from(csv));

                expect(result.kind).toBe('ok');
            });
        });
```

- [ ] **Step 2: Leave everything else in the group untouched.** After the edit the group reads: `describe('recipient column')` → `describe('when a recipient column is present')` (the two `it`s above) → `describe('when the recipient cell is blank')` → `it('yields null')` (unchanged) → `describe('when the header is absent')` → `it('yields null for every row')` (unchanged).

- [ ] **Step 3: Format and run the single spec**

```bash
npx prettier --write src/api/sales-import/sales-import.csv.spec.ts
npx vitest run src/api/sales-import/sales-import.csv.spec.ts
```

Expected: **13/13 passing.**

- [ ] **Step 4: Confirm the whole file now matches the target shape**

```bash
grep -cE '^\s+it\(' src/api/sales-import/sales-import.csv.spec.ts
grep -c "describe('when " src/api/sales-import/sales-import.csv.spec.ts
```

Expected: `13` `it`s and **12** `when …` describes:

| # | `describe('when …')` |
|---|---|
| 1 | `the CSV is valid` |
| 2 | `the invest column is omitted` |
| 3 | `the CSV starts with a BOM` |
| 4 | `there are blank rows` |
| 5 | `the status differs in case` |
| 6 | `a row is GIFTED` |
| 7 | `a required column is missing` |
| 8 | `an unknown column is present` |
| 9 | `the file is empty` |
| 10 | `a recipient column is present` |
| 11 | `the recipient cell is blank` |
| 12 | `the header is absent` |

(Plus the non-`when` describes: root `parseImportCsv` and noun-group `recipient column`.) If the `when` count is not 12, a wrapper is missing — diff against the spec's target structure block.

---

### Task 4: Append tech-debt entry §6 to `docs/tech-debt.md`

**Files:**
- Modify: `docs/tech-debt.md` (append after entry §5, no edits to existing entries)

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of the spec restructure).
- Produces: a new `## 6.` entry documenting the sibling-spec findings (spec D4).

- [ ] **Step 1: Append this entry verbatim after entry §5:**

```markdown
---

## 6. `sales-import.resolver.spec.ts` and `sales-import.service.spec.ts` have condition-in-title flat `it`s

**Found:** 2026-09-27, while fixing PSG-42 (`sales-import.csv.spec.ts` branch nesting).

Same class as §5: the house Jest/Vitest convention (restated in every plan doc's
conventions section, e.g. `docs/plans/2026-08-30-ask-a-question.md`) wants one
`describe('when …')` per conditional branch, with `it` titles stating only the outcome.

- `sales-import.resolver.spec.ts`: 10 flat `it`s sit directly under
  `describe('resolveDraftRows')` (lines 81-171, 275, 286) with the condition in the
  title — `'flags a mismatched opponent as warn'`, `'errors on nb>1 with multi-pass and
  leaves allocations empty'`, `'accepts an optional soldAt on or before the match date'`,
  and seven more. The file's other groups (`kickoff guard on soldAt`,
  `gift recipient requirement`) are already conformant.
- `sales-import.service.spec.ts`: flat `it`s under `describe('preview')`,
  `describe('commit')` and `describe('revert')` — `'throws SEASON_PASS_FORBIDDEN when
  pass belongs to other user'`, `'throws IMPORT_PASSES_MIXED_SEASONS when passes differ in
  year'`, `'is idempotent when nothing matches'` — while `revert` also contains conformant
  `when sales are deleted` / `when nothing matches` describes, the same partial state
  PSG-42's file had.

**Why deferred:** PSG-42 is deliberately scoped to one spec file (single-file precedent:
PSG-37, `c29bf5a`); restructuring two more files would turn an XS issue into a
review-noise diff.

**Cost to act:** moderate — same mechanical treatment as PSG-42: wrap each flat `it` in a
`when …` describe, move the condition out of the title, leave bodies untouched. No
behavior change; tests must stay green before and after.

**Recommendation:** fold into a future test-hygiene pass rather than doing alone.
```

- [ ] **Step 2: Check the file still reads cleanly**

Run: `grep -n '^## ' docs/tech-debt.md`
Expected: entries `## 2.` through `## 6.` present, in order, §5 unmodified.

---

### Task 5: Full gate and commits

**Files:**
- Modify (format only, if needed): `src/api/sales-import/sales-import.csv.spec.ts`
- Commit: `src/api/sales-import/sales-import.csv.spec.ts`, `docs/tech-debt.md`

**Interfaces:**
- Consumes: Tasks 1–4 complete.
- Produces: two commits on the feature branch; a green gate matching CI's `checks` job.

- [ ] **Step 1: Format, then run the single-file spec and the count checks**

```bash
npx prettier --write src/api/sales-import/sales-import.csv.spec.ts
npx vitest run src/api/sales-import/sales-import.csv.spec.ts
grep -cE '^\s+it\(' src/api/sales-import/sales-import.csv.spec.ts
```

Expected: 13/13 passing; count `13`.

- [ ] **Step 2: Review the diff for scope and body integrity**

```bash
git diff -- src/api/sales-import/sales-import.csv.spec.ts
```

Expected: only added `describe` lines, changed `it(` title lines, and re-indented body
lines. **No** `expect(` line, CSV fixture string, or `if (result.kind …)` guard has
changed content (only indentation). Any content change in an assertion = stop and fix.

- [ ] **Step 3: Run the full CI-equivalent gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Expected: all four green (`npm test` = full Vitest suite, no Docker required).

- [ ] **Step 4: Commit the spec restructure**

```bash
git add src/api/sales-import/sales-import.csv.spec.ts
git commit -m "test(sales-import): nest csv spec describes per branch (PSG-42)"
```

Expected: commitlint accepts (conventional format); lint-staged runs prettier + eslint
on the staged file and passes.

- [ ] **Step 5: Commit the tech-debt entry**

```bash
git add docs/tech-debt.md
git commit -m "docs(sales-import): record sibling spec branch-nesting debt (PSG-42)"
```

Expected: commitlint accepts.

- [ ] **Step 6: Final confirmation**

```bash
git status --short
```

Expected: no unstaged changes to `src/**` (spec/plan docs from planning may remain
untracked/unstaged depending on the pipeline — leave them to the coordinator).

---

## Summary of all tasks

| Task | Deliverable | Verify |
|---|---|---|
| T1 | Rows 1–5 wrapped in `when …` describes | single spec 13/13; `grep -cE '^\s+it\('` = 13 |
| T2 | Rows 7–9 (error branches) wrapped | single spec 13/13; count = 13 |
| T3 | Rows 10–11 merged under `when a recipient column is present` | single spec 13/13; count = 13; `describe('when ` count = 12 |
| T4 | `docs/tech-debt.md` entry §6 appended | `grep -n '^## '` shows §6, §5 untouched |
| T5 | Full gate green; 2 commits (test + docs) | typecheck, lint, lint:deps, `npm test`; `git status` clean |

**Out of scope (do not do):** editing `sales-import.resolver.spec.ts` /
`sales-import.service.spec.ts` (tech-debt §6 covers them); deleting tech-debt §5 (its
item appears already fixed by `c29bf5a` — flagged to the coordinator, not this plan's
job); any change to `sales-import.csv.ts` or assertion style.
