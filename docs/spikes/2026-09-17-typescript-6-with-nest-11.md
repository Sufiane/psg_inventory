# Spike: TypeScript 5.6.3 → 6.0.3 with Nest still on v11 (PSG-10)

**Result: green on all gates, zero source-file changes.** The move costs four
config/dependency lines, not a migration.

## What landed

| File | Change |
|---|---|
| `package.json` | `typescript` 5.6.3 → 6.0.3, `ts-jest` 29.2.5 → 29.4.12, `jest-mock-extended` 4.0.0-beta1 → 4.0.1, `typescript-eslint` 8.18.0 → 8.70.0 |
| `tsconfig.json` | dropped `baseUrl`, made `paths` tsconfig-relative, added explicit `types` |
| `tsconfig.build.json` | added `rootDir: "./src"`, a build-scoped `types` without `jest`, and an explicit `tsBuildInfoFile` |
| `.github/workflows/ci.yml` | added `npm run build` + a `test -f dist/main.js` assertion |
| `.gitignore` | added `*.tsbuildinfo` |

Nest stays untouched at 11.2.1 / cli 11.0.24 / schematics 11.1.0.

## Gate results

| Gate | TS 5.6.3 (baseline) | TS 6.0.3 (final) |
|---|---|---|
| `npm run typecheck` | pass | pass |
| `npm run lint` | pass | pass |
| `npm test` | 290/290, 25 suites | 290/290, 25 suites |
| `npm run build` | pass | pass |
| `npm run lint:deps` | pass | pass, 231 modules |

## The three things that actually broke

### 1. `@types/*` are no longer auto-included — 1183 errors

The headline number. TS 6 stopped pulling in every `node_modules/@types`
package implicitly, so `describe`/`it`/`expect`/`jest` (1166 errors, TS2593 +
TS2304 + TS2503) and `Express.Multer` (TS2694) all went missing even though the
packages were installed.

Fix is one line — `"types": ["node", "jest", "multer"]`. All 1183 errors are
this single cause; the count is noise, not scope.

**Ongoing cost:** the `types` array is now a manual allowlist. Any new
global-augmenting `@types` package must be added there or it is silently
ignored.

### 2. `baseUrl` is deprecated (TS5101), and it masks everything behind it

`baseUrl` is deprecated in 6.0 and stops working in 7.0. The trap: this is a
*config-level* error, so `tsc` exits code 2 before type-checking anything. The
first measurement therefore reads "1 error" — which is a parse bail, not a
clean result. ts-jest inherits the same broken config and fails all 25 suites
with a misleading `Cannot find name 'describe'`.

Fixed by removing `baseUrl` and making `paths` tsconfig-relative
(`["./shared/src/*"]`) rather than silencing with `ignoreDeprecations: "6.0"`.
Both produce identical results today, but `ignoreDeprecations` just re-breaks
at TS 7.

Safe because every `@psg/shared` import (168 references) is `import type` —
the alias is compile-time only, which is also why jest needs no
`moduleNameMapper` for it.

### 3. `rootDir` is now mandatory (TS5011) — and this one reaches production

`npm run build` was not in the issue's gate list. It should have been.

TS 6 errors if the common source directory is not an explicit `rootDir`, and
the failure mode is the known `dist/src/` layout trap: output lands at
`dist/src/main.js` while Railway's `start:prod` runs `node dist/main`. Fixed
with `rootDir: "./src"` in `tsconfig.build.json` (not the root tsconfig, which
also includes `scripts/**`).

### 3b. `rootDir` also relocates `.tsbuildinfo` — a green build that emits nothing

Found while re-verifying, and caused by the `rootDir` fix itself. Setting
`rootDir` moves the default `.tsbuildinfo` from inside `dist/` to the repo
root, where it survives `rm -rf dist`. With `incremental: true` the next build
then decides nothing has changed, emits no files, and **still exits 0**.

Pinned with `"tsBuildInfoFile": "./dist/tsconfig.build.tsbuildinfo"` so the
cache is cleaned together with the output it describes. `*.tsbuildinfo` is now
gitignored too.

CI would not have caught any of this, because CI did not run `npm run build`
at all. It now does, plus an explicit `test -f dist/main.js` — a build that
exits 0 is not evidence that a runnable artifact exists.

## Runtime verification

Gates alone do not prove the app runs, so the production build was booted
against this workspace's own Postgres and Redis (`node --env-file=.env
dist/main`, the same entrypoint Railway uses):

- Nest started, full DI graph resolved, every route mapped
- `GET /health` → 200
- `POST /users/login` with the seeded demo user → 201 with a JWT (bcrypt +
  Postgres + JWT signing)
- `GET /sales/current-season` unauthenticated → 401 (guard), authenticated →
  200 with the full payload including `GIFTED` sales and nested
  `Gift`/`Recipient`
- Redis populated (sales cache key, user cache, refresh tokens)
- `POST /sales` with bad types → 400 with per-field class-validator messages
  (`listedPrice must be a number conforming to the specified constraints`),
  which is the decisive runtime proof that `emitDecoratorMetadata` works

## Legacy decorators: intact

The issue's main open question. `experimentalDecorators` +
`emitDecoratorMetadata` still emit correctly on TS 6.0.3 — verified against
built output, not assumed:

- `design:paramtypes` present for Nest DI in emitted controllers
- `__decorate`/`__metadata` present in `dist/env.schema.js` (class-validator)
- `design:type` present across emitted Swagger DTOs
- `app.module.spec.ts` compiles the full DI graph and passes

## Corrections to the issue's premises

- `typescript-eslint` was at **8.18.0**, which peers `typescript >=4.8.4 <5.8.0`
  — not the `<6.1.0` the issue quoted for 8.70.0. It needed bumping too.
- `ts-jest` was at **29.2.5**, peering `>=4.3.0 <6.0.0-0`. Also needed bumping.
- **`jest-mock-extended@4.0.0-beta1` peers `typescript ^3||^4||^5`** — a hard
  TS 5 cap the issue did not anticipate, and a blocker for the whole group.
  4.0.1 accepts `^6.0.0` and drops the beta pin.

6.0.3 remains the correct target: npm `latest` is 7.0.2, and
`typescript-eslint@8.70.0` (`<6.1.0`) still rules it out.

## Sizing the parent (PSG-9)

TS 6 is **not** the risk in the Nest 12 move. It is a four-line lockstep bump
with no source churn. Remaining unknowns for PSG-9 are entirely on the Nest
side.
