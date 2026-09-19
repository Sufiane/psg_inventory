# Enforce the Return-Type ESLint Rules CLAUDE.md Claims Are Enforced — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable `@typescript-eslint/explicit-function-return-type` as `error` in `eslint.config.mjs`, fix the 17 measured violations (16 signature-only additions + one `async`), add a `type-only` exemption to `no-db-from-controller` in `.dependency-cruiser.cjs`, and delete the resolved entry #1 from `docs/tech-debt.md`. One commit, per the issue's "small → flip to error" route.

**Architecture:** Backend-only tooling. Zero runtime behaviour change. Two tasks: Task 0 establishes the green baseline; Task 1 makes all edits in one pass and runs the full gate. No parallelism — everything is one linear change that must land as one commit.

**Tech Stack:** NestJS 11 + Prisma 6, eslint 9.17.0 + typescript-eslint 8.70.0, dependency-cruiser 17 (for the `no-db-from-controller` constraint that drives Task 1's type-only exemption edit).

**Spec:** `docs/specs/2026-09-18-psg-5-enforce-return-type-eslint-rules-design.md`. Read D1–D5 before starting — D2 in particular (default options, `allowTypedFunctionExpressions: true` spelled out, `allowExpressions`/`allowHigherOrderFunctions` deliberately off), and D4 fix 5 (ratified option 2: type-only `Sale` import straight from `src/db/`, no re-export).

## Global Constraints

- **Zero behaviour change.** No new endpoint, no mock change, no test edited. Every fix is an annotation; the only structural edits are `async` on `canActivate` (jwt.guard.ts:13) and the `dependencyTypesNot: ['type-only']` clause added to `no-db-from-controller`. If a task seems to require editing a test's assertions or a method body's logic, stop and escalate — it is a misreading.
- **`--max-warnings 0` stays.** Do not touch `package.json` at all.
- **No `/* eslint-disable */` anywhere.** The rule's defaults already exempt inline callbacks; the 17 fixes are the whole list.
- Explicit return types on every fixed function/method, including `Promise<void>`. No single-letter locals. No inline `if`. Blank line before `if`/`for`/`while`/`return`/`throw` unless first in its block. Constructor-injected dependencies stay `private readonly`.
- **Gate, run at the end of every task:**
  ```bash
  npm run typecheck && npm run lint && npm run lint:deps && npm test
  ```
  Direct counter-check after Task 1: `npx eslint "src/**/*.ts" "scripts/**/*.ts" --rule '{"@typescript-eslint/explicit-function-return-type":"warn"}'` must report **0** problems.
- **Do not commit.** Stage the changes and report. The user runs `/crit` on the staged diff and gives the go-ahead before anything is committed. There are no `git commit` lines in this plan — the one commit is made after `/crit` approval.

---

## Parallelism

**None. One track, two tasks. Task 1 is a single atomic change by design.**

| Task | Depends on |
|---|---|
| 0 — green baseline | nothing |
| 1 — config + 17 fixes + tech-debt cleanup | 0 |

This is a **backend-only** change. Nothing under `web/` or `shared/` is linted by these
scripts and nothing under them is touched.

---

## File Structure

**Modified (Task 1):**

| File | Change |
|---|---|
| `eslint.config.mjs` | add the rule to the final rules block per spec D3 |
| `.dependency-cruiser.cjs` | add `dependencyTypesNot: ['type-only']` to `no-db-from-controller` `to:` clause (+ comment), per D4 fix 5 |
| `src/api/matches/matches.controller.ts` | return type on `getMatch` |
| `src/api/matches/matches.service.ts` | return type on `getMatch` |
| `src/api/sales/sales.controller.ts` | return types on 6 methods + `import type { Sale }` from `src/db/` |
| `src/api/users/users.controller.ts` | return type on `createUser` |
| `src/auth/strategies/local.strategy.ts` | return type on `validate` + import |
| `src/crons/cancel-sales/cancel-sales.service.ts` | return type on `cancelSales` |
| `src/db/matches/matches.query.ts` | return type on `matchQuery` + import |
| `src/db/sales/sales.db.ts` | return type on `cancelMany` |
| `src/redis/base.service.ts` | return types on `onModuleInit`/`onModuleDestroy` |
| `src/shared/decorators/public.decorator.ts` | return type on `Public` + import |
| `src/shared/guards/jwt.guard.ts` | `async` + return type on `canActivate` |
| `docs/tech-debt.md` | delete resolved entry #1 |

**Created:** this spec + this plan (committed with the change, per house docs convention).

---

### Task 0: Establish a green baseline

`node_modules` is present and the untouched tree was verified green during planning
(lint, typecheck, 25 suites / 290 tests). Re-confirm before editing anything.

- [ ] **Step 1: Run the full gate on the untouched tree**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

- [ ] **Step 2: Report the baseline explicitly**

Report each command as pass/fail with output if any. **If anything is red, stop and
escalate — do not begin Task 1.** Confirm `git status` is clean, then continue.

---

### Task 1: Enable the rule as `error` and fix all 17 violations

One pass, in order: fix the code, then flip the config. (Code-first means each edited
file typechecks at default tolerance; the config flip at the end is the moment the gate
becomes real.) Every fix below is signature-only unless noted.

- [ ] **Step 1: Edit `eslint.config.mjs`**

Add to the final rules block, keeping `no-console`/`prefer-const`:

```js
'@typescript-eslint/explicit-function-return-type': [
    'error',
    { allowTypedFunctionExpressions: true },
],
```

Do not add `explicit-module-boundary-types` (spec D1) and do not set
`allowExpressions`/`allowHigherOrderFunctions` (spec D2).

- [ ] **Step 2: `src/api/matches/matches.controller.ts:35`** — `getMatch`

Add `: Promise<FormattedMatch>` before the opening brace. `FormattedMatch` is already
imported (line 8).

- [ ] **Step 3: `src/api/matches/matches.service.ts:39`** — `getMatch`

Add `: Promise<FormattedMatch>` before the opening brace. `FormattedMatch` already
imported (line 13).

- [ ] **Step 4: `src/api/sales/sales.controller.ts`** — six methods

Add `import type { Sale } from '../../db/sales/type/sale.type';` (type-only — legal under the
new depcruise exemption from Step 5, and erased at compile time). Extend the existing interface
import to also pull `FormattedSale`:

```ts
import { FormattedSale, ISalesService } from './interfaces/sales.service.interface';
```

Then annotate:

| Line | Method | Return type |
|---|---|---|
| 17 | `getCurrentSeasonSales` | `: Promise<FormattedSale[]>` |
| 22 | `getSeasonSales` | `: Promise<FormattedSale[]>` |
| 33 | `getSale` | `: Promise<Sale>` |
| 38 | `getSales` | `: Promise<FormattedSale[]>` |
| 51 | `updateSale` | `: Promise<void>` |
| 56 | `deleteSale` | `: Promise<void>` |

Do NOT import `Sale` from a `src/db/*.db.ts` file or from any non-type-only position — the
exemption covers only type-only imports.

- [ ] **Step 5: `.dependency-cruiser.cjs`** — exempt type-only imports from `no-db-from-controller`

In the `no-db-from-controller` rule (ratified option 2, spec D4 fix 5), add the same exemption
`no-orm-outside-db` already carries, and note it in the rule comment:

```js
{
    name: 'no-db-from-controller',
    comment:
        'Controllers are the http boundary; they must call api services, never the db layer directly. Type-only imports are exempt — they are erased at compile time (mirrors no-orm-outside-db).',
    severity: 'error',
    from: { path: '\\.controller\\.ts$' },
    to: { path: ['^src/db/', '\\.db\\.ts$'], dependencyTypesNot: ['type-only'] },
},
```

This lets Step 4's controller import the `Sale` type directly without a barrel re-export. No
runtime edge is created, so the guard's stated invariant is untouched.

- [ ] **Step 6: `src/api/users/users.controller.ts:19`** — `createUser`

Add `: Promise<void>` before the opening brace. Leave the `// todo should return a jwt`
comment untouched.

- [ ] **Step 7: `src/auth/strategies/local.strategy.ts:13`** — `validate`

Add `import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type';`
and annotate `: Promise<AuthenticatedUser>` — faithful to the body: the `!user` branch
throws, so `validate` never returns null (the wider `| null` mirrors `validateUser` but
would promise an impossible empty return).

- [ ] **Step 8: `src/crons/cancel-sales/cancel-sales.service.ts:10`** — `cancelSales`

Add `: Promise<void>` before the opening brace.

- [ ] **Step 9: `src/db/matches/matches.query.ts:5`** — `matchQuery`

Annotate the return with the concrete queried shape (per spec D4 fix 12, as built —
`Prisma.MatchesFindManyArgs` was tried and rejected: `GetPayload` over the generic find-many
args drops the `Opponent`/`MatchResults` relations, and the widened args leak `orderBy` into
the `findUnique` call site):

```ts
type MatchQueryArgs = { include: { Opponent: true; MatchResults: boolean } };

export function matchQuery(withResult: boolean = false): MatchQueryArgs {
```

Keep the `as const` literal and the file's existing why-comment. No `Prisma` import is
needed. Spec D4 fix 12 explains why `match.type.ts`'s
`GetPayload<ReturnType<typeof matchQuery>>` keeps working and both call sites accept the
spread.

- [ ] **Step 10: `src/db/sales/sales.db.ts:477`** — `cancelMany`

Add `: Promise<void>` before the opening brace.

- [ ] **Step 11: `src/redis/base.service.ts:13,17`** — lifecycle hooks

Annotate `onModuleInit` and `onModuleDestroy` each `: Promise<void>`.

- [ ] **Step 12: `src/shared/decorators/public.decorator.ts:4`** — `Public`

Change the import to `import { CustomDecorator, SetMetadata } from '@nestjs/common';` and
annotate the arrow: `export const Public = (): CustomDecorator<string> => …`. Exported
function expressions are NOT exempted by `allowExpressions`; this fix is required.

- [ ] **Step 13: `src/shared/guards/jwt.guard.ts:13`** — `canActivate`

Make it `override async canActivate(context: ExecutionContext): Promise<boolean> {`.
Adding `async` is the one structural change in this task's code: the existing early
`return true` must satisfy the promise type. `return super.canActivate(context)` needs a
cast — `@nestjs/passport` types `AuthGuard` as `CanActivate` (`boolean | Promise<boolean> |
Observable<boolean>`), while the runtime implementation is genuinely `async`, so
`as Promise<boolean>` is sound. Keep the `override` keyword.

- [ ] **Step 14: `docs/tech-debt.md`** — delete entry #1

Remove the entire "## 1. …" section (the resolved eslint-return-types entry). Leave
entries #2–#4 numbered as they are.

- [ ] **Step 15: Stage and run the gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

```bash
./node_modules/.bin/eslint "src/**/*.ts" "scripts/**/*.ts" --rule '{"@typescript-eslint/explicit-function-return-type":"warn"}'  # must report 0 problems
```

(`npx eslint` is avoided: without a package on PATH it fetches eslint@10, which cannot
resolve this config's `globals` import.)

- [ ] **Step 16: Prove the gate rejects a future violation**

Spot-check that the rule is live: temporarily delete one fixed return type
(e.g. `: Promise<void>` on `cancelSales`), run `npm run lint`, confirm it exits non-zero,
restore the annotation, and re-run `npm run lint`. Leave the tree green.

- [ ] **Step 17: Stage and report**

```bash
git add eslint.config.mjs .dependency-cruiser.cjs \
  src/api/matches/matches.controller.ts src/api/matches/matches.service.ts \
  src/api/sales/sales.controller.ts \
  src/api/users/users.controller.ts src/auth/strategies/local.strategy.ts \
  src/crons/cancel-sales/cancel-sales.service.ts src/db/matches/matches.query.ts \
  src/db/sales/sales.db.ts src/redis/base.service.ts src/shared/decorators/public.decorator.ts \
  src/shared/guards/jwt.guard.ts docs/tech-debt.md
```

Report the staged diff summary and the gate results. **Do not commit.** The user runs
`/crit` first; after go-ahead, commit once — message in house style, e.g.
`chore(lint): enforce explicit-function-return-type`. The spec and plan docs land in the
same commit.