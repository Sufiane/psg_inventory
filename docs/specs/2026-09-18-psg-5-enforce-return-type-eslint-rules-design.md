# Enforce the Return-Type ESLint Rules CLAUDE.md Claims Are Enforced — Design

**Date:** 2026-09-18
**Status:** Ratified — D1, D2, D4-option-2 confirmed 2026-09-18 (user). D2 additionally corrects the global CLAUDE.md wording.
**Type:** Backend-only tooling. Zero runtime behaviour change.
**Tracks:** Linear PSG-5, `docs/tech-debt.md` entry #1.

## Problem

`eslint.config.mjs` does not enable `@typescript-eslint/explicit-function-return-type` or
`@typescript-eslint/explicit-module-boundary-types`, although the global CLAUDE.md states
both are enforced ("Explicit return types on every backend function/method. Enforced by
`@typescript-eslint/explicit-function-return-type` + `@typescript-eslint/explicit-module-boundary-types`").

The convention is real and followed by hand, but nothing checks it. New code can drift
silently, and the next person reading CLAUDE.md will believe a gate exists that does not.

Measured on 2026-09-18 by the coordinator: running the rule as `warn` over
`src/**/*.ts` + `scripts/**/*.ts` yields **17 violations, 0 errors** — SMALL. Re-verified
on the current tree during planning (same 17, exact same locations). Per `docs/tech-debt.md`
entry #1: fix and flip to `error` in one commit.

## Goal

Make the gate real: enable the return-type rule as `error`, fix every existing violation,
and keep `npm run lint` (which runs `--max-warnings 0`) green as proof. One commit.

**No behaviour changes.** No new dependency, no package.json change, no migration, no
runtime difference. Every edit is a type annotation plus one structural same-behaviour
change (`async` on a guard method).

## Non-goals

- Enabling `explicit-module-boundary-types` as well — see D1.
- Ratcheting `warn` down over time. The count is 17, every one has a determinate return
  type, so the issue's "small → fix and flip in one commit" route applies.
- Touching the `--max-warnings 0` script flag (`package.json` line 16). It stays.
- Fixing `no-any-return` / implicit-`any` hygiene while in these files.
- Anything under `web/` or `shared/` — out of lint scope entirely.

## Baseline (verified during planning, 2026-09-18)

- `npm run lint` → green (exit 0) on the untouched tree.
- `npm run typecheck` → green.
- `npm test` → 25 suites, 290 tests, green.
- `npm run lint:deps` (dependency-cruiser) config read and respected for the
  `no-db-from-controller` constraint — this drives the one depcruise edit below (D4, fix 5).

## Decisions

### D1 — Enable only `explicit-function-return-type`; NOT `explicit-module-boundary-types`

`explicit-module-boundary-types` is a strict subset of `explicit-function-return-type`: it
checks only *exported* functions, while `explicit-function-return-type` checks every
function declaration, method, and non-exempt expression. CLAUDE.md names both, but the
convention it states — "explicit return types on every backend function/method" — is fully
implemented by the one rule. The second rule adds zero coverage. It is also marked
deprecated in typescript-eslint, which points at `explicit-function-return-type` as the
replacement.

Running the measurement against *only* `explicit-function-return-type` produced exactly
the 17 violations listed in the issue, including the module-level non-exported ones
(`sales.db.ts` `cancelMany`). Nothing is missed by dropping the second rule.

**Decision:** one rule, `error`.

### D2 — Options: defaults, with `allowTypedFunctionExpressions` spelled out; reject `allowExpressions` and `allowHigherOrderFunctions`

CLAUDE.md says inline arrow callbacks `.map(x => x.id)` are exempt "thanks to
`allowExpressions`/`allowHigherOrderFunctions`". That is the author's model of the rule,
and it is not what the rule does in typescript-eslint 8.70. Empirically probed during
planning:

- With **default options**, an inline callback like `.map((x) => x * 2)` is **not**
  flagged, and the whole repo yields exactly the 17. The mechanism is
  `allowTypedFunctionExpressions`, which defaults to `true`: a function expression that is
  typed by its surrounding context (a callback in an argument position) is exempt.
  Setting `allowTypedFunctionExpressions: false` immediately flags the `.map` callback.
- Turning on `allowExpressions` + `allowHigherOrderFunctions` (repo-wide run) exempts
  **zero** of the 17. In particular the exported const arrow `Public` in
  `public.decorator.ts` still flags under `allowExpressions: true` — the option exempts only
  anonymous expression-position functions, not named/exported function expressions.

So the stated mechanism is backwards: the exemption CLAUDE.md wants is already the default,
and the two named options would open the gate wider (allow `const helper = () => …`
expressed functions past the rule if they ever pass in an untyped position) without
exempting a single current violation. The strictest config that still matches the
convention is the default with the exemption mechanism made explicit.

**Decision:** `'@typescript-eslint/explicit-function-return-type': ['error', { allowTypedFunctionExpressions: true }]`.
`allowExpressions` and `allowHigherOrderFunctions` stay off (default). This is a
deliberate, evidence-based correction of CLAUDE.md's wording — flag for user ratification.

### D3 — Config shape

Add the rule to the existing final overrides block in `eslint.config.mjs` (currently
`no-console` and `prefer-const`):

```js
{
    rules: {
        'no-console': 'error',
        'prefer-const': 'error',
        '@typescript-eslint/explicit-function-return-type': [
            'error',
            { allowTypedFunctionExpressions: true },
        ],
    },
},
```

- The rule is global over the flat config's `.ts` files: it covers **both**
  `src/**/*.ts` and `scripts/**/*.ts` (the lint globs). That is desired — scripts are
  backend code like any other, and the audit shows **zero** script violations, so nothing
  is excluded for a reason and no `scripts/` exemption is needed.
- It also covers `*.spec.ts`. Zero spec violations exist; test-code shapes
  (`describe`/`it`/`beforeEach` hooks, `jest.fn()` chains) are inline callbacks and stay
  exempt under `allowTypedFunctionExpressions`. No `/* eslint-disable */` is needed
  anywhere.
- The `.js`/`.mjs`/`.cjs` branch of the config is never linted by the npm scripts
  (they only pass `.ts` globs), so the rule being inert on espree-parsed files is a
  non-issue.
- The rule does not require type-aware linting and needs no `parserOptions` change.
- `--max-warnings 0` stays: harmless once the rule is `error`, and it keeps any future
  `warn`-tier rule just as fatal.

### D4 — Fix scope: the 17 violations (+ one depcruise guard edit)

Every violation has a determinate return type; none require design judgement. Listed
file-by-file. Return types are read from the owning interfaces:
`IMatchesService`, `ISalesService`, `IAuthService`, and the lifecycle interfaces.

| # | Location | Symbol | Fix |
|---|---|---|---|
| 1 | `src/api/matches/matches.controller.ts:35` | `getMatch` | `): Promise<FormattedMatch>` — type already imported |
| 2 | `src/api/matches/matches.service.ts:39` | `getMatch` | `): Promise<FormattedMatch>` — type already imported |
| 3 | `src/api/sales/sales.controller.ts:17` | `getCurrentSeasonSales` | `): Promise<FormattedSale[]>` |
| 4 | `src/api/sales/sales.controller.ts:22` | `getSeasonSales` | `): Promise<FormattedSale[]>` |
| 5 | `src/api/sales/sales.controller.ts:33` | `getSale` | `): Promise<Sale>` — type-only import directly from `src/db/`, see below |
| 6 | `src/api/sales/sales.controller.ts:38` | `getSales` | `): Promise<FormattedSale[]>` |
| 7 | `src/api/sales/sales.controller.ts:51` | `updateSale` | `): Promise<void>` |
| 8 | `src/api/sales/sales.controller.ts:56` | `deleteSale` | `): Promise<void>` |
| 9 | `src/api/users/users.controller.ts:19` | `createUser` | `): Promise<void>` |
| 10 | `src/auth/strategies/local.strategy.ts:13` | `validate` | `): Promise<AuthenticatedUser>` + `import type { AuthenticatedUser }` from `../../shared/types/authenticated-user.type`. Faithful to the body: the `!user` branch throws, so null is never returned (narrowed from the `| null` mirror of `validateUser` on review). |
| 11 | `src/crons/cancel-sales/cancel-sales.service.ts:10` | `cancelSales` | `): Promise<void>` |
| 12 | `src/db/matches/matches.query.ts:5` | `matchQuery` | `): Prisma.MatchesFindManyArgs` + `import type { Prisma } from '.prisma/client'` |
| 13 | `src/db/sales/sales.db.ts:477` | `cancelMany` | `): Promise<void>` |
| 14 | `src/redis/base.service.ts:13` | `onModuleInit` | `): Promise<void>` |
| 15 | `src/redis/base.service.ts:17` | `onModuleDestroy` | `): Promise<void>` |
| 16 | `src/shared/decorators/public.decorator.ts:4` | `Public` | `(): CustomDecorator<string>` + `import { CustomDecorator, SetMetadata } from '@nestjs/common'` |
| 17 | `src/shared/guards/jwt.guard.ts:13` | `canActivate` | `async canActivate(context: ExecutionContext): Promise<boolean>` |

Three deserve a note:

- **Fix 12 (`matchQuery`)** is the only one that changes a type, and it is stored by the
  same shape it already feeds: `match.type.ts:7` computes `Prisma.MatchesGetPayload<ReturnType<typeof matchQuery>>`,
  and three `matches.db.ts` call sites spread the return into `findMany` and `findUnique`.
  Annotating with `Prisma.MatchesFindManyArgs` was rejected on implementation: `GetPayload`
  over the generic find-many args drops the `Opponent`/`MatchResults` relations, and the
  widened args leak `orderBy` into the `findUnique` call site. Instead the return is
  annotated with the concrete queried shape,
  `MatchQueryArgs = { include: { Opponent: true; MatchResults: boolean } }` (a private
  type, no Prisma import, `as const` literal kept). `ReturnType` stays a precise
  get-payload-able args shape; both `get`-style call sites accept the spread. The
  `typecheck` gate confirms this before commit.
- **Fix 17 (`canActivate`)** changes shape, not behaviour: the method becomes
  `override async canActivate(context: ExecutionContext): Promise<boolean>` so its early
  `return true` short-circuit (now `Promise.resolve(true)`) satisfies the explicit
  `Promise<boolean>`. `return super.canActivate(context)` needs a cast — `@nestjs/passport`
  types `AuthGuard` as `CanActivate`, whose `canActivate` is `boolean | Promise<boolean> |
  Observable<boolean>`; the runtime implementation (`@auth.guard.js`) is genuinely `async`,
  so `as Promise<boolean>` is sound. `noImplicitOverride` and the existing `override`
  keyword are untouched.
- **Fix 5 (`getSale`)** returns `Promise<Sale>`, and `Sale` lives in `src/db/sales/type/sale.type`.
  `no-db-from-controller` (dependency-cruiser) singles out controllers so importing it directly
  would trip the guard. The api-layer interface file already owns `Sale` as its contract type
  (`ISalesService.getSale(): Promise<Sale>`), so the plan originally re-exported it there. That
  barrel line existed purely for one annotation. Ratified alternative (option 2, coordinator
  dispatch 2026-09-18): exempt **type-only** imports from the guard — mirroring the codebase's
  own precedent in `no-orm-outside-db`, which already carries `dependencyTypesNot: ['type-only']`.
  Type-only imports are erased at compile time, so the "controllers call api services, never the
  db layer directly" invariant is untouched (no runtime edge). The controller adds
  `import type { Sale } from '../../db/sales/type/sale.type'` and the guard gains the same
  `dependencyTypesNot: ['type-only']` exemption in its `to:` clause. The re-export is dropped.

Fixes 1–11, 13–16 are signature-only additions; the bodies and all callers are untouched.

### D5 — One commit, small → error, then delete the tech-debt entry

Matches the issue's instruction and `docs/tech-debt.md`'s own rule ("Delete it when it's
done"). The commit contains: the config change (D3), the 17 fixes + depcruise type-only
exemption (D4), the
removed `docs/tech-debt.md` entry #1, and this spec + the implementation plan. The change
is small enough — and every edit mechanically provable by the gate — that a single commit
is the right size, per the issue's "fix and flip to error in one commit".

Per the house git workflow: stage the diff for `/crit`, commit only after the user's
go-ahead.

## Verification

Every step of the plan runs the same gate:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

- `npm run lint` (with `--max-warnings 0`) being green after the flip is the proof the
  gate is real: any future missing return type becomes a hard failure.
- `lint:deps` is load-bearing for fix 5 (the controller's type-only `Sale` import must
  stay exempt via the `dependencyTypesNot: ['type-only']` clause, not a rule bypass):
- Direct counter-check: rerun the coordinator's measurement command
  `npx eslint "src/**/*.ts" "scripts/**/*.ts" --rule '{"@typescript-eslint/explicit-function-return-type":"warn"}'`
  and confirm **0** findings.

The workspace has `node_modules` present and the untouched baseline is verified green
(lint, typecheck, 290 tests) — Task 0 confirms the same before any edit.

## Out-of-scope observations

- `explicit-module-boundary-types` is deprecated in typescript-eslint; D1's single-rule
  choice makes this moot.
- The `allowExpressions`/`allowHigherOrderFunctions` discrepancy with CLAUDE.md's wording
  is recorded in D2 so the convention doc can be corrected in the same breath if the user
  ratifies the strict option.