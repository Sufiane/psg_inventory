# Migrate Backend Test Suite from Jest to Vitest — Design

**Date:** 2026-09-20
**Status:** Draft — proposed for ratification.
**Type:** Backend/tooling-only. No runtime source behavior changes; the test framework swaps from jest 29.7.0 + ts-jest 29.4.12 to Vitest 5.0.0; `jest-mock-extended` is replaced by `vitest-mock-extended`; all 26 spec files / 299 tests undergo mechanical API renames; coverage migrates to `@vitest/coverage-v8`.
**Tracks:** Linear PSG-8; hard prerequisite for PSG-9 / PSG-14 (Nest 12 lockstep); resolves `docs/tech-debt.md` entry #4.

## Problem

Nest 12 ships all core packages as ESM-only (including `@nestjs/common`, `@nestjs/swagger`, which both use `import.meta.url` in their dist). The jest/ts-jest pipeline cannot load these:

1. **ts-jest CJS downlevel is dead for Nest 12:** TS 6.0.3 emits `import.meta` verbatim into CJS output; jest 29's vm rejects it at parse time. No `transformIgnorePatterns` allow-list can fix this.
2. **jest 30's `require(esm)` was considered** but Vitest is a better long-term fit: natively ESM (no flags), already used by `web/` (SvelteKit 2), and is the default for Nest 12's own generated ESM projects.
3. **The canary fired on `src/app.module.spec.ts`:** removing `jest.mock('./observe')` and loading real `@nestjs/observe` proved the pipeline breaks on `import.meta.url` in `@nestjs/observe/dist/utils/optional-peer.util.js`.

**Supersedes:** The earlier jest-30 strategy (`docs/specs/2026-09-20-psg-8-jest-pure-esm-deps-design.md`) which proposed jest 30.5.1 + `require(esm)`. That strategy is valid but Vitest is the chosen long-term direction — see D1.

## Goal

1. Vitest 5.0.0 runs the full backend test suite (26 suites / 299 tests) with identical pass/fail outcomes.
2. Coverage parity: V8 provider, `rootDir: src`, `collectCoverageFrom: **/*.(t|j)s`.
3. `jest-mock-extended` (47 `mockDeep` sites, 16 `jest.Mock` type casts) replaced by `vitest-mock-extended` — same API surface, vitest-native.
4. `src/app.module.spec.ts` imports the **real** `./observe` wrapper (stub removed) — the canary must pass green under Vitest.
5. `docs/tech-debt.md` entry #4 deleted.
6. Trunk stays green at every stage boundary.

## Non-goals

- No changes to `web/` (already on Vitest 5.0.0 independently).
- No changes to `shared/`, `tsconfig*.json` (root), `nest-cli.json`, `eslint.config.mjs`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml`, `.lintstagedrc`.
- No new spec files beyond what's mechanically modified.
- No ESM-mode rewrite of the specs — Vitest handles CJS/ESM interop natively.
- No test logic changes — purely framework/API rename.

## Baseline (verified during planning, 2026-09-20)

- **Test framework:** jest 29.7.0 + ts-jest 29.4.12 + jest-mock-extended 4.0.1
- **Config:** `"jest"` key in `package.json` (lines 97–116); no standalone config file
- **Specs:** 26 files / 299 tests under `src/**/*.spec.ts`
- **Mock inventory:**
  - `jest.mock()`: 5 sites (observe, @google/genai, redis, season.utils, format-aggregate.util)
  - `jest.mocked()`: 2 sites (accounting.service.spec.ts)
  - `jest.requireActual()`: 1 site (accounting.service.spec.ts)
  - `jest.spyOn()`: 6 sites (accounting.service.spec.ts)
  - `jest.fn()`: 9 sites (redis.service.spec.ts, llm.service.spec.ts, accounting.service.spec.ts)
  - `jest.clearAllMocks()`: 2 sites (redis.service.spec.ts, llm.service.spec.ts)
  - `jest.Mock` type cast: 16 sites (llm.service.spec.ts, sales-import.db.spec.ts, sales.db.spec.ts, matches.db.spec.ts)
  - `mockDeep<T>()`: 47 sites across 10 files
  - `DeepMockProxy<T>` type: 10 files
- **NestJS testing:** `Test.createTestingModule()` in 11 spec files
- **Lifecycle hooks:** `beforeEach` (56 occurrences), `beforeAll`/`afterAll` (in app.module.spec.ts)
- **Path aliases:** `@psg/shared/*` → `./shared/src/*` — all `import type` only (elided at compile), 24 occurrences across 15 spec files
- **CJS-specific constructs:** zero `__dirname`/`__filename`/`require()` in any spec file
- **web/ Vitest:** vitest 5.0.0, `web/vitest.config.ts` uses `defineConfig` from `vitest/config`, `environment: 'node'`, `include: ['src/**/*.spec.ts']`
- **Node:** 24.21.0
- **TypeScript:** 6.0.3 (exact pin)

## Decisions

### D1 — Vitest 5.0.0 (chosen over jest 30 + require(esm))

**Chosen: Vitest 5.0.0** for the backend test runner. Rationale:

- **ESM-native:** Vitest runs on Vite's dev server which natively handles ESM — no `--experimental-vm-modules` flag, no `require(esm)` gating, no CJS downlevel needed. `import.meta.url` in `@nestjs/observe`, `@nestjs/common`, and `@nestjs/swagger` dist files load without any configuration.
- **Already in the repo:** `web/` runs Vitest 5.0.0 (SvelteKit 2). Same version = shared ecosystem knowledge, one less dependency to track.
- **Nest 12 default:** Nest 12's own scaffolding generates Vitest projects. Long-term alignment.
- **Coverage:** V8 provider (built-in, faster than istanbul) with `@vitest/coverage-v8`.
- **API compatibility:** Vitest's API is a near-superset of Jest's. `describe`/`it`/`expect`/`beforeEach`/`afterAll` etc. work identically. `vi.mock()` / `vi.fn()` / `vi.spyOn()` / `vi.mocked()` map 1:1 to `jest.mock()` / `jest.fn()` / `jest.spyOn()` / `jest.mocked()`. `vi.importActual()` replaces `jest.requireActual()` (async — see D5).

**Rejected — jest 30 + require(esm):** Valid but larger surface (version bump, `--experimental-vm-modules` flag in every script, `@types/jest` 30.0.0 types to audit). Vitest solves the same problem with less configuration and aligns with the repo's long-term direction. The earlier spec (`docs/specs/2026-09-20-psg-8-jest-pure-esm-deps-design.md`) is retained as a record of the rejected alternative.

### D2 — Package and version

**Install:** `vitest@5.0.0` (exact pin, matching `web/`) + `@vitest/coverage-v8@5.0.0` (exact pin) + `vitest-mock-extended@5.1.1` (latest, peers `vitest ≥4`).

**Remove:** `jest@29.7.0`, `ts-jest@29.4.12`, `jest-mock-extended@4.0.1`, `@types/jest@29.5.14`.

**Why exact pins:** house convention (the prior plan used `--save-exact`).

**`@vitest/coverage-v8`:** V8 coverage is the default in Vitest and faster than istanbul. The `@vitest/coverage-v8` package is the provider. If V8 coverage has issues on this codebase, `@vitest/coverage-istanbul` is the fallback (same config, different provider import).

### D3 — Vitest config location and shape

**File:** `vitest.config.ts` at repo root (next to `package.json`), matching `web/`'s convention.

**Shape:** `defineConfig` from `vitest/config` with `test` block:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            '@psg/shared': path.resolve(__dirname, 'shared/src'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        rootDir: 'src',
        include: ['src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            include: ['**/*.(t|j)s'],
            reportsDirectory: '../coverage',
        },
    },
});
```

**Key config choices:**
- **`globals: true`:** enables `describe`/`it`/`expect`/`vi`/`beforeEach`/`afterAll` etc. without imports — matches the current jest习惯 (all 26 spec files use bare `describe`/`it`/`expect`).
- **`rootDir: 'src'`:** equivalent to jest's `rootDir: "src"`. Test discovery (`include`) and coverage (`include`) are relative to this.
- **`resolve.alias`:** `@psg/shared/*` maps to `./shared/src/*` — all 24 occurrences in spec files are `import type` (elided at compile), but vitest still needs the alias for its module resolver. This mirrors the tsconfig `paths` entry.
- **`environment: 'node'`:** matches jest's `testEnvironment: "node"`.
- **Coverage:** V8 provider, `include: ['**/*.(t|j)s']` (matches jest's `collectCoverageFrom`), `reportsDirectory: '../coverage'` (matches jest's `coverageDirectory: "../coverage"`).

**Why not `defineProject`:** `defineConfig` is the standard for single-project repos. `defineProject` is for monorepo workspace configs — not needed here since `web/` has its own config.

**Root tsconfig interaction:** The root `tsconfig.json` has `"types": ["node", "jest", "multer"]`. Vitest ignores tsconfig for its own type resolution, but IDE type-checking of spec files needs vitest types. A `tsconfig.vitest.json` (see D7) handles this without polluting the main tsconfig.

### D4 — jest-mock-extended → vitest-mock-extended

**Chosen:** Replace `jest-mock-extended` with `vitest-mock-extended@5.1.1`. The API is a maintained fork of jest-mock-extended with identical surface:

| jest-mock-extended | vitest-mock-extended | Notes |
|---|---|---|
| `import { mockDeep, DeepMockProxy } from 'jest-mock-extended'` | `import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'` | Same names, same types |
| `mockDeep<T>()` | `mockDeep<T>()` | Identical API |
| `DeepMockProxy<T>` | `DeepMockProxy<T>` | Identical type |
| `jest.mocked(fn)` | `vi.mocked(fn)` | vitest built-in (also available as `mocked()` from vitest-mock-extended) |

**Impact:** 47 `mockDeep` sites across 10 files + 10 `DeepMockProxy` type annotations. Mechanical find-and-replace: change the import source only.

**Why not keep jest-mock-extended:** It peers `jest ^24–^30` — it might work under vitest but it imports from jest internals (`jest.fn()`), creating an implicit dependency on jest being installed. `vitest-mock-extended` wraps `vi.fn()` instead.

### D5 — API migration map (mechanical renames)

All 26 spec files undergo these renames. No logic changes.

| Jest API | Vitest API | Sites | Notes |
|---|---|---|---|
| `jest.fn()` | `vi.fn()` | 9 | Same return type |
| `jest.mock(path, factory)` | `vi.mock(path, factory)` | 5 | Same hoisting behavior. See D6 for `jest.requireActual` |
| `jest.mocked(fn)` | `vi.mocked(fn)` | 2 | Vitest built-in |
| `jest.spyOn(obj, method)` | `vi.spyOn(obj, method)` | 6 | Same API |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` | 2 | Same behavior |
| `jest.requireActual(path)` | `await vi.importActual(path)` | 1 | **Async** — see D6 |
| `jest.Mock` (type cast) | `Mock` from `vitest` | 16 | `as unknown as jest.Mock` → `as unknown as Mock` |
| `import { mockDeep, DeepMockProxy } from 'jest-mock-extended'` | `import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'` | 10 files | Import source only |
| `import { Test } from '@nestjs/testing'` | unchanged | 11 files | NestJS DI works under Vitest |
| `describe`/`it`/`expect`/`beforeEach`/`beforeAll`/`afterAll` | unchanged (globals) | all | `globals: true` in vitest config |
| `expect(x).toEqual(y)` etc. | unchanged | all | Vitest uses `@vitest/expect` — compatible |
| `mock.mockResolvedValue(x)` | unchanged | all | Mock API is the same |
| `mock.mock.calls` | unchanged | all | Same mock introspection |

### D6 — `jest.requireActual` → `vi.importActual` (the one async conversion)

**One site:** `src/api/accounting/accounting.service.spec.ts` line 30:

```ts
// Jest (synchronous):
jest.mock('../../shared/utils/season.utils', () => ({
    ...jest.requireActual('../../shared/utils/season.utils'),
    getCurrentSeasonDate: jest.fn(),
}));
```

`vi.importActual()` is async. The `vi.mock()` factory cannot be async. Solution using `vi.hoisted()`:

```ts
const { seasonUtils } = vi.hoisted(() => ({
    seasonUtils: null as typeof import('../../shared/utils/season.utils'),
}));

vi.mock('../../shared/utils/season.utils', async (importOriginal) => {
    seasonUtils = await importOriginal();
    return {
        ...seasonUtils,
        getCurrentSeasonDate: vi.fn(),
    };
});
```

`vi.hoisted()` runs before `vi.mock()` hoisting — the variable is declared and assigned in the mock factory. This preserves the "mock everything except getCurrentSeasonDate" pattern.

### D7 — tsconfig for vitest type-checking

Create `tsconfig.vitest.json` at repo root:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "types": ["node", "vitest/globals", "multer"]
    },
    "include": ["src/**/*.spec.ts"],
    "exclude": ["node_modules", "dist", "web", "shared", ".claude"]
}
```

This replaces `"jest"` with `"vitest/globals"` in the `types` array for IDE/type-checking of spec files. The root `tsconfig.json` is **not modified** — `tsc --noEmit` (which uses the root config) is unaffected.

Vitest itself uses this tsconfig via the `typecheck.tsconfig` option in `vitest.config.ts` if desired, but the primary purpose is IDE support.

### D8 — Test scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage",
"test:debug": "node --inspect-brk node_modules/.bin/vitest run --reporter=verbose"
```

**Notes:**
- `vitest run` = single run (equivalent to `jest` without `--watch`).
- `vitest` without `run` = watch mode (equivalent to `jest --watch`).
- `vitest run --coverage` = coverage via `@vitest/coverage-v8`.
- `test:debug` uses `--inspect-brk` for Node debugger attachment. No `tsconfig-paths/register` or `ts-node/register` needed — Vitest handles TS natively via Vite.
- **CI impact:** `.github/workflows/ci.yml` runs `npm test` → picks up the new script. No workflow change needed.

### D9 — Coverage parity

| Jest config | Vitest equivalent |
|---|---|
| `rootDir: "src"` | `test.rootDir: 'src'` |
| `collectCoverageFrom: ["**/*.(t|j)s"]` | `coverage.include: ['**/*.(t|j)s']` |
| `coverageDirectory: "../coverage"` | `coverage.reportsDirectory: '../coverage'` |
| `testEnvironment: "node"` | `test.environment: 'node'` |
| Default V8 provider | `coverage.provider: 'v8'` |

The `coverage.include` glob is relative to `rootDir`, matching jest's behavior.

### D10 — NestJS testing module compatibility

`@nestjs/testing` `Test.createTestingModule()` uses standard dependency injection — no jest-specific APIs. It works under any Node test runner. 11 spec files use this pattern. No changes needed.

**Known non-issue:** NestJS decorators (`@Injectable()`, `@Module()`, etc.) use `reflect-metadata` for design-time type emission (`emitDecoratorMetadata: true`). This is a TypeScript compiler feature, not a test-runner feature. Vitest's Vite-based transform handles decorated classes correctly.

### D11 — Phasing

**Phase 1 — Setup vitest (behavior-neutral):**
- Install vitest, @vitest/coverage-v8, vitest-mock-extended
- Create vitest.config.ts, tsconfig.vitest.json
- Verify a single spec file runs under vitest (smoke test)
- Jest remains fully functional; `npm test` still runs jest

**Phase 2 — Migrate all spec files + swap scripts:**
- Mechanical renames across all 26 spec files (D5, D6)
- Update package.json scripts (D8)
- Remove jest, ts-jest, jest-mock-extended, @types/jest
- Remove old jest config from package.json
- Run full gate: typecheck, lint, lint:deps, vitest, build

**Phase 3 — Canary + cleanup:**
- Remove `jest.mock('./observe')` stub from app.module.spec.ts
- Verify canary passes green (real @nestjs/observe loads under Vitest)
- Delete tech-debt §4
- Final full gate + build + dist/main.js verification

### D12 — Rollback strategy

If the migration fails at any phase:
- **Phase 1 failure:** Delete vitest.config.ts, tsconfig.vitest.json, uninstall vitest packages. Jest is untouched.
- **Phase 2 failure:** Revert the script changes (`"test": "jest"` etc.), reinstall jest/ts-jest/jest-mock-extended/@types/jest. Spec file renames can be reverted via `git checkout`.
- **Phase 3 failure:** Re-add the `jest.mock('./observe')` stub. The migration itself (Phase 2) is still valid.

## Verification (per phase)

```bash
# Phase 1 gate (vitest installed, jest untouched):
npm run typecheck && npm run lint && npm run lint:deps && npm test && npx vitest run src/app.module.spec.ts

# Phase 2 gate (all spec files migrated):
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js

# Phase 3 gate (canary removed, full suite):
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

## Files touched on completion

**Created:**
- `vitest.config.ts` (repo root)
- `tsconfig.vitest.json` (repo root)
- `docs/specs/2026-09-20-psg-8-vitest-migration-design.md` (this spec)
- `docs/plans/2026-09-20-psg-8-vitest-migration.md` (implementation plan)

**Modified:**
- `package.json` — remove jest/ts-jest/jest-mock-extended/@types/jest; add vitest/@vitest/coverage-v8/vitest-mock-extended; update four test scripts; delete `"jest"` key
- `package-lock.json` — regenerated by npm install
- All 26 `src/**/*.spec.ts` files — mechanical API renames (D5, D6)
- `src/app.module.spec.ts` — additionally remove `jest.mock('./observe')` stub (Phase 3)
- `docs/tech-debt.md` — delete §4

**Unchanged:**
- All `src/**/*.ts` (non-spec) files — no runtime code changes
- `tsconfig.json` (root) — not modified
- `web/` — already on Vitest independently
- `shared/` — no test files
- `.github/workflows/ci.yml` — `npm test` picks up the new script
- `eslint.config.mjs`, `.dependency-cruiser.cjs`, `.lintstagedrc`, `nest-cli.json`
- All version pins except those named

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| NestJS DI + Vitest module resolution incompatibility | Low | `Test.createTestingModule` uses standard Node module resolution; Vitest handles this natively. 11 spec files exercise this pattern — all must pass. |
| `vitest-mock-extended` API mismatch with `jest-mock-extended` | Very low | Fork of the same library; `mockDeep`/`DeepMockProxy` have identical signatures. Verified via npm docs. |
| Coverage parity gap (V8 vs jest's default v8/istanbul) | Low | Both use V8 coverage. `coverage.include` glob matches jest's `collectCoverageFrom`. Run `vitest run --coverage` and compare report. |
| `vi.mock()` hoisting behaves differently from `jest.mock()` | Very low | Both hoist to file top. The repo's mock pattern (variables at top level, assigned in factory) is compatible with both. |
| `@psg/shared/*` alias resolution | Very low | Explicit `resolve.alias` in vitest.config.ts mirrors tsconfig `paths`. All occurrences are `import type` (elided at compile). |
| CI timing regression | Low | Vitest is generally faster than jest (Vite's esbuild transform vs ts-jest). Monitor suite wall-clock. |
| `vi.importActual()` async conversion breaks the mock pattern | Low | Only 1 site (accounting.service.spec.ts). `vi.hoisted()` solves this cleanly. |
