# PSG-8: Migrate Backend Test Suite from Jest to Vitest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace jest 29.7.0 + ts-jest + jest-mock-extended with Vitest 5.0.0 + @vitest/coverage-v8 + vitest-mock-extended for the backend test suite (26 suites / 299 tests), resolving the ESM-incompatibility that blocks Nest 12.

**Architecture:** Vitest is natively ESM (runs on Vite's dev server) — no `--experimental-vm-modules` flag, no CJS downlevel, no `transformIgnorePatterns` hacks. `@nestjs/observe`, `@nestjs/common`, and `@nestjs/swagger` dist files with `import.meta.url` load without configuration. The migration is mechanical: API renames (`jest.fn` → `vi.fn`, `jest.mock` → `vi.mock`, etc.), import source swaps (`jest-mock-extended` → `vitest-mock-extended`), and one async conversion (`jest.requireActual` → `await vi.importActual`).

**Tech Stack:** vitest 5.0.0, @vitest/coverage-v8 5.0.0, vitest-mock-extended 5.1.1, @nestjs/testing 11.2.1, TypeScript 6.0.3, Node 24.21.0

**Spec:** `docs/specs/2026-09-20-psg-8-vitest-migration-design.md`

## Global Constraints

- Node 24.21.0 (pinned in `engines.node` and `.nvmrc`)
- TypeScript 6.0.3 (exact pin)
- NestJS 11.2.1 (`@nestjs/core`, `@nestjs/common`, `@nestjs/testing`)
- Exact version pins via `npm install --save-exact` (house convention)
- No changes to `web/`, `shared/`, `.github/workflows/ci.yml`
- `globals: true` in vitest config (all 26 spec files use bare `describe`/`it`/`expect` without imports)

---

## File Map

| File | Action | Tasks |
|---|---|---|
| `vitest.config.ts` | Create | T1 |
| `tsconfig.vitest.json` | Create | T1 |
| `package.json` | Modify (scripts, deps, delete `"jest"` key) | T5, T6 |
| `package-lock.json` | Regenerate | T5, T6 |
| `src/llm/llm.service.spec.ts` | Modify (jest → vi renames) | T3 |
| `src/redis/redis.service.spec.ts` | Modify (jest → vi renames) | T3 |
| `src/api/accounting/accounting.service.spec.ts` | Modify (jest → vi renames + async vi.importActual) | T3 |
| `src/api/sales/sales.service.spec.ts` | Modify (import source only) | T3 |
| `src/api/sales-import/sales-import.service.spec.ts` | Modify (import source only) | T3 |
| `src/api/matches/matches.service.spec.ts` | Modify (import source only) | T3 |
| `src/api/recipients/recipients.service.spec.ts` | Modify (import source only) | T3 |
| `src/api/admin/admin.service.spec.ts` | Modify (import source only) | T3 |
| `src/db/sales/sales.db.spec.ts` | Modify (import source + jest.Mock casts) | T3 |
| `src/db/sales-import/sales-import.db.spec.ts` | Modify (import source + jest.Mock casts) | T3 |
| `src/db/matches/matches.db.spec.ts` | Modify (import source + jest.Mock casts) | T3 |
| `src/db/recipients/recipients.db.spec.ts` | Modify (import source only) | T3 |
| `src/shared/utils/season.utils.spec.ts` | Modify (jest.useFakeTimers → vi) | T3 |
| `src/app.module.spec.ts` | Modify (remove mock — canary) | T7 |
| `docs/tech-debt.md` | Modify (delete §4) | T7 |

**Untouched (no jest APIs):** `src/env.schema.spec.ts`, `src/api/sales-import/sales-import.csv.spec.ts`, `src/api/ask/context/build-context.spec.ts`, `src/db/matches/matches.utils.spec.ts`, `src/api/accounting/utils/status-converter.util.spec.ts`, `src/api/accounting/utils/format-aggregate.util.spec.ts`, `src/shared/utils/recipient-name.util.spec.ts`, `src/redis/CACHE_KEYS.spec.ts`, `src/db/shared/date-range.util.spec.ts`, `src/api/sales-import/sales-import.resolver.spec.ts`, `src/api/matches/formatters/format-match.formatter.spec.ts`

---

## Phase 1 — Setup Vitest (behavior-neutral)

### Task 1: Install vitest packages and create config files

**Files:**
- Modify: `package.json` (add vitest deps to devDependencies)
- Create: `vitest.config.ts` (repo root)
- Create: `tsconfig.vitest.json` (repo root)

- [ ] **Step 1: Install vitest packages (jest remains installed)**

```bash
npm install --save-dev --save-exact vitest@5.0.0 @vitest/coverage-v8@5.0.0 vitest-mock-extended@5.1.1
```

Expected: `package.json` shows `"vitest": "5.0.0"`, `"@vitest/coverage-v8": "5.0.0"`, `"vitest-mock-extended": "5.1.1"` in devDependencies (exact, no `^`). `jest`, `ts-jest`, `jest-mock-extended`, `@types/jest` still present.

- [ ] **Step 2: Create `vitest.config.ts`**

Create `/Users/sufianesouissi/conductor/workspaces/psg_inventory/budapest/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

Notes:
- `globals: true` enables bare `describe`/`it`/`expect`/`vi` — all 26 spec files use these without imports.
- `resolve.alias` mirrors the tsconfig `paths` entry for `@psg/shared/*`. All 24 occurrences in spec files are `import type` (elided at compile), but vitest's resolver still needs the alias.
- `rootDir: 'src'` matches the current jest config. `include` and `coverage.include` are relative to this.
- `fileURLToPath(import.meta.url)` is used for `__dirname` since vitest.config.ts is processed as ESM by Vite.

- [ ] **Step 3: Create `tsconfig.vitest.json`**

Create `/Users/sufianesouissi/conductor/workspaces/psg_inventory/budapest/tsconfig.vitest.json`:

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

Purpose: provides IDE/type-checking support for spec files under vitest. Replaces `"jest"` with `"vitest/globals"` in the `types` array. The root `tsconfig.json` is **not modified** — `tsc --noEmit` is unaffected.

- [ ] **Step 4: Verify config files are valid**

```bash
npx vitest --version
```

Expected: `5.0.0` (or similar — confirms vitest is installed and loadable).

```bash
npx prettier --check vitest.config.ts tsconfig.vitest.json
```

Expected: both files are prettier-clean (the content above is already in the repo's prettier shape: tabWidth 4, printWidth 90, singleQuote, semi, trailingComma all).

- [ ] **Step 5: Smoke test — run one simple spec file under vitest**

```bash
npx vitest run src/db/shared/date-range.util.spec.ts
```

Expected: 1 test suite, 2 tests, all passing. This confirms vitest discovers the config, resolves `src/` correctly, and runs a spec file.

If this fails, stop and report — do not proceed to Task 2.

- [ ] **Step 6: Stage and report**

```bash
git add vitest.config.ts tsconfig.vitest.json package.json package-lock.json && git status
```

Verify the staged set is exactly those 4 files. Report: "Task 1 staged — vitest 5.0.0 + @vitest/coverage-v8 5.0.0 + vitest-mock-extended 5.1.1 installed (jest still present), vitest.config.ts + tsconfig.vitest.json created, smoke test green on date-range.util.spec.ts. Not committed — ready for review."

---

## Phase 2 — Migrate Spec Files + Swap Scripts

### Task 2: Migrate simple spec files (no jest APIs — zero changes needed)

These 11 files contain no jest APIs (no `jest.fn`, `jest.mock`, `jest.mocked`, `jest.spyOn`, `mockDeep`, `jest.Mock`). They run under vitest without modification — vitest's `globals: true` provides `describe`/`it`/`expect`.

**Files (no edits):**
- `src/env.schema.spec.ts`
- `src/api/sales-import/sales-import.csv.spec.ts`
- `src/api/ask/context/build-context.spec.ts`
- `src/db/matches/matches.utils.spec.ts`
- `src/api/accounting/utils/status-converter.util.spec.ts`
- `src/api/accounting/utils/format-aggregate.util.spec.ts`
- `src/shared/utils/recipient-name.util.spec.ts`
- `src/redis/CACHE_KEYS.spec.ts`
- `src/db/shared/date-range.util.spec.ts`
- `src/api/sales-import/sales-import.resolver.spec.ts`
- `src/api/matches/formatters/format-match.formatter.spec.ts`

- [ ] **Step 1: Run all 11 simple spec files under vitest**

```bash
npx vitest run src/env.schema.spec.ts src/api/sales-import/sales-import.csv.spec.ts src/api/ask/context/build-context.spec.ts src/db/matches/matches.utils.spec.ts src/api/accounting/utils/status-converter.util.spec.ts src/api/accounting/utils/format-aggregate.util.spec.ts src/shared/utils/recipient-name.util.spec.ts src/redis/CACHE_KEYS.spec.ts src/db/shared/date-range.util.spec.ts src/api/sales-import/sales-import.resolver.spec.ts src/api/matches/formatters/format-match.formatter.spec.ts
```

Expected: all 11 suites pass. This confirms vitest handles the repo's TS transform, `@psg/shared/*` alias resolution, `@prisma/client` imports, and `reflect-metadata` (used by `env.schema.spec.ts`).

### Task 3: Migrate spec files with jest API usage (mechanical renames)

**Files:** 15 spec files that use jest APIs.

**API migration map (applied to all 15 files):**

| Find | Replace | Files affected |
|---|---|---|
| `import { mockDeep, DeepMockProxy } from 'jest-mock-extended'` | `import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'` | 10 files |
| `jest.fn(` | `vi.fn(` | 3 files (llm, redis, accounting) |
| `jest.mock(` | `vi.mock(` | 5 files (app.module, llm, redis, accounting ×2) |
| `jest.mocked(` | `vi.mocked(` | 1 file (accounting) |
| `jest.spyOn(` | `vi.spyOn(` | 1 file (accounting) |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` | 2 files (llm, redis) |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` | 1 file (season.utils) |
| `jest.useRealTimers()` | `vi.useRealTimers()` | 1 file (season.utils) |
| `as unknown as jest.Mock` | `as unknown as Mock` | 3 files (llm, sales-import.db, sales.db, matches.db) |

**Special case — `jest.requireActual` → `await vi.importActual`:**

One file: `src/api/accounting/accounting.service.spec.ts` (line 30). See Step 3 below for the exact conversion.

- [ ] **Step 1: Run the bulk mechanical renames via shell**

```bash
# Replace jest-mock-extended imports with vitest-mock-extended
find src -name '*.spec.ts' -exec sed -i '' \
  's/from '\''jest-mock-extended'\''/from '\''vitest-mock-extended'\''/g' {} +

# Replace jest.fn( with vi.fn(
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.fn(/vi.fn(/g' {} +

# Replace jest.mock( with vi.mock(
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.mock(/vi.mock(/g' {} +

# Replace jest.mocked( with vi.mocked(
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.mocked(/vi.mocked(/g' {} +

# Replace jest.spyOn( with vi.spyOn(
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.spyOn(/vi.spyOn(/g' {} +

# Replace jest.clearAllMocks() with vi.clearAllMocks()
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.clearAllMocks()/vi.clearAllMocks()/g' {} +

# Replace jest.useFakeTimers() with vi.useFakeTimers()
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.useFakeTimers()/vi.useFakeTimers()/g' {} +

# Replace jest.useRealTimers() with vi.useRealTimers()
find src -name '*.spec.ts' -exec sed -i '' 's/jest\.useRealTimers()/vi.useRealTimers()/g' {} +

# Replace jest.Mock type casts with Mock
find src -name '*.spec.ts' -exec sed -i '' 's/as unknown as jest\.Mock/as unknown as Mock/g' {} +
```

After running, verify no `jest.` calls remain (except the `jest.mock('./observe')` in app.module.spec.ts which is handled in Task 7):

```bash
grep -rn 'jest\.' src --include='*.spec.ts' | grep -v 'app\.module\.spec\.ts'
```

Expected: no output (all jest API references removed from non-app-module specs).

- [ ] **Step 2: Add vitest `Mock` type import to files that use it**

Three files use `as unknown as Mock` after the sed replace. Each needs `import { Mock } from 'vitest'` added:

**File: `src/llm/llm.service.spec.ts`**

Add at the top (after existing imports):
```ts
import { Mock } from 'vitest';
```

The file currently has no vitest import — this is the first one. After the sed, lines 48 and 73 read `as unknown as Mock` — verify the import is present.

**File: `src/db/sales-import/sales-import.db.spec.ts`**

Add at the top:
```ts
import { Mock } from 'vitest';
```

Lines 28, 92, 113, 139, 153, 192 use `as unknown as Mock` after sed.

**File: `src/db/sales/sales.db.spec.ts`**

Add at the top:
```ts
import { Mock } from 'vitest';
```

Lines 38, 156, 161, 246, 274, 279 use `as unknown as Mock` after sed.

**File: `src/db/matches/matches.db.spec.ts`**

Add at the top:
```ts
import { Mock } from 'vitest';
```

Lines 46, 125 use `as unknown as Mock` after sed.

- [ ] **Step 3: Convert `jest.requireActual` in `src/api/accounting/accounting.service.spec.ts`**

This is the only file using `jest.requireActual`. The current code (lines 29–36):

```ts
jest.mock('../../shared/utils/season.utils', () => ({
    ...jest.requireActual('../../shared/utils/season.utils'),
    getCurrentSeasonDate: jest.fn(),
}));
const getCurrentSeasonDateMocked = jest.mocked(getCurrentSeasonDate);
```

After sed, this becomes (vi.mock + vi.fn + vi.mocked but still has the requireActual):

```ts
vi.mock('../../shared/utils/season.utils', () => ({
    ...jest.requireActual('../../shared/utils/season.utils'),
    getCurrentSeasonDate: vi.fn(),
}));
const getCurrentSeasonDateMocked = vi.mocked(getCurrentSeasonDate);
```

Replace the `vi.mock` block with the `vi.hoisted` pattern:

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
const getCurrentSeasonDateMocked = vi.mocked(getCurrentSeasonDate);
```

Why: `vi.importActual()` is async, but `vi.mock()` factories cannot be async. `vi.hoisted()` runs before mock hoisting — the variable is declared and assigned in the factory.

- [ ] **Step 4: Add `import { Mock } from 'vitest'` to the file if not already added by Step 2**

For `src/api/accounting/accounting.service.spec.ts`, the `Mock` type is not used (no `as unknown as jest.Mock` casts in this file), so no vitest type import is needed. Verify:

```bash
grep -n 'Mock' src/api/accounting/accounting.service.spec.ts
```

Expected: matches for `mockDeep`, `DeepMockProxy`, `mocked`, `formatAggregateMocked`, `getCurrentSeasonDateMocked` — but no `as unknown as Mock` (this file doesn't use that pattern).

- [ ] **Step 5: Run all 15 migrated spec files under vitest**

```bash
npx vitest run src/llm/llm.service.spec.ts src/redis/redis.service.spec.ts src/api/accounting/accounting.service.spec.ts src/api/sales/sales.service.spec.ts src/api/sales-import/sales-import.service.spec.ts src/api/matches/matches.service.spec.ts src/api/recipients/recipients.service.spec.ts src/api/admin/admin.service.spec.ts src/db/sales/sales.db.spec.ts src/db/sales-import/sales-import.db.spec.ts src/db/matches/matches.db.spec.ts src/db/recipients/recipients.db.spec.ts src/shared/utils/season.utils.spec.ts src/app.module.spec.ts
```

Expected: all 14 suites pass (app.module.spec.ts still has the observe mock — it should pass). If any fail, read the error output, identify the file, and fix the specific issue before proceeding.

- [ ] **Step 6: Run the full vitest suite (all 26 files)**

```bash
npx vitest run
```

Expected: 26 suites, 299 tests, all passing. Record suite wall-clock time for comparison with jest.

### Task 4: Migrate the full suite + verify coverage

- [ ] **Step 1: Run vitest with coverage**

```bash
npx vitest run --coverage
```

Expected: all 26 suites pass, coverage report generated in `../coverage/` (relative to `rootDir: src`, so at repo root `/coverage/`). Compare coverage numbers with the jest baseline — they should be comparable (V8 provider vs jest's default).

- [ ] **Step 2: Verify coverage config matches jest's**

The vitest config's coverage section:
```ts
coverage: {
    provider: 'v8',
    include: ['**/*.(t|j)s'],
    reportsDirectory: '../coverage',
},
```

This matches jest's:
- `collectCoverageFrom: ["**/*.(t|j)s"]` → `include: ['**/*.(t|j)s']`
- `coverageDirectory: "../coverage"` → `reportsDirectory: '../coverage'`
- `rootDir: "src"` → `test.rootDir: 'src'` (coverage globs are relative to this)

### Task 5: Swap test scripts and remove jest dependencies

**Files:** `package.json`

- [ ] **Step 1: Update test scripts in `package.json`**

Replace:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:cov": "jest --coverage",
"test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
```

With:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage",
"test:debug": "node --inspect-brk node_modules/.bin/vitest run --reporter=verbose",
```

Notes:
- `vitest run` = single run (equivalent to `jest` without `--watch`).
- `vitest` without `run` = watch mode (equivalent to `jest --watch`).
- `vitest run --coverage` = coverage via `@vitest/coverage-v8`.
- `test:debug` — no `tsconfig-paths/register` or `ts-node/register` needed (Vitest handles TS natively via Vite). `--reporter=verbose` adds detail for debugging.
- **CI impact:** `.github/workflows/ci.yml` runs `npm test` → picks up the new script. No workflow change needed.

- [ ] **Step 2: Remove jest dependencies**

```bash
npm uninstall jest ts-jest jest-mock-extended @types/jest
```

Expected: `package.json` no longer has `jest`, `ts-jest`, `jest-mock-extended`, or `@types/jest` in devDependencies. `package-lock.json` regenerated.

- [ ] **Step 3: Delete the `"jest"` key from `package.json`**

The `"jest"` key (lines 97–116) is no longer needed — vitest uses `vitest.config.ts`. Remove the entire block:

```json
"jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { ".+\\.(t|j)s$": "ts-jest" },
    "transformIgnorePatterns": ["node_modules/(?!(?:@nestjs/(?:config|passport|jwt|schedule|observe)|nestjs-pino)/)"],
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
}
```

After removal, the trailing comma on the `devDependencies` closing brace (line 96, `},`) must be fixed if `"jest"` was the last key. Verify JSON validity:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
```

Expected: no error (valid JSON).

- [ ] **Step 4: Verify `npm test` runs vitest**

```bash
npm test
```

Expected: vitest runs, 26 suites / 299 tests, all passing. This confirms the script swap works and CI will pick it up.

- [ ] **Step 5: Stage and report**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.vitest.json && git status
```

Verify the staged set. Report: "Task 5 staged — test scripts now use vitest, jest/ts-jest/jest-mock-extended/@types/jest removed, `"jest"` key deleted from package.json, full suite green under vitest. Not committed — ready for review."

---

## Phase 3 — Canary + Cleanup

### Task 6: Remove the observe stub (the canary)

**File:** `src/app.module.spec.ts`

- [ ] **Step 1: Remove the `jest.mock('./observe')` block**

Current lines 3–7:
```ts
// @nestjs/observe is pure ESM and jest's transformIgnorePatterns skips
// node_modules, so importing app.module.ts for real throws on it. Stubbing the
// local wrapper costs no coverage here: OBSERVE_APP_KEY/SECRET are unset below,
// so ObserveModule never enters the graph this spec exists to compile.
jest.mock('./observe', () => ({ ObserveModule: {}, ObserveInstrument: {} }));
```

After Task 3's sed, this has already become:
```ts
// @nestjs/observe is pure ESM and jest's transformIgnorePatterns skips
// node_modules, so importing app.module.ts for real throws on it. Stubbing the
// local wrapper costs no coverage here: OBSERVE_APP_KEY/SECRET are unset below,
// so ObserveModule never enters the graph this spec exists to compile.
vi.mock('./observe', () => ({ ObserveModule: {}, ObserveInstrument: {} }));
```

Replace the entire 5-line comment + mock block with:

```ts
// No vi.mock('./observe') here: Vitest loads the pure-ESM @nestjs/observe
// natively — vitest.config.ts has no transformIgnorePatterns, so node_modules
// is never transformed (PSG-8). This spec therefore exercises the real wrapper.
```

- [ ] **Step 2: Run the canary spec in isolation**

```bash
npx vitest run src/app.module.spec.ts
```

Expected: **PASS** — the spec compiles the real `AppModule` graph (including the real `./observe` → `@nestjs/observe` chain) and resolves every provider. This is the canary: it proves Vitest loads the pure-ESM `@nestjs/observe` natively.

If this **fails**, stop and report — do not re-add the mock. The failure indicates a Vitest/ESM compatibility issue that needs investigation.

- [ ] **Step 3: Run the full suite**

```bash
npx vitest run
```

Expected: 26 suites / 299 tests, all passing (including the canary with the real `./observe`).

### Task 7: Delete tech-debt §4 and final verification

**File:** `docs/tech-debt.md`

- [ ] **Step 1: Delete §4 from `docs/tech-debt.md`**

Delete lines 42–76 (the entire §4 entry about jest not loading pure-ESM deps). This entry is resolved by the migration.

- [ ] **Step 2: Run the full gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Expected: all green — typecheck (the root tsconfig is unchanged; spec files are not in `tsc --noEmit`'s `include` — wait, they ARE in `include: ["src/**/*"]`). Actually, `tsc --noEmit` does check spec files. Since we removed `@types/jest` and the root tsconfig has `"types": ["node", "jest", "multer"]`, we need to update the root tsconfig's `types` array.

**Correction:** Update the root `tsconfig.json` `types` array:

Replace:
```json
"types": ["node", "jest", "multer"],
```

With:
```json
"types": ["node", "vitest/globals", "multer"],
```

This ensures `tsc --noEmit` recognizes `describe`/`it`/`expect`/`vi` as globals in spec files. Without this, typecheck would fail with "Cannot find name 'describe'" etc.

Then re-run:
```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test
```

Expected: all green.

- [ ] **Step 3: Build and verify entrypoint**

```bash
npm run build && test -f dist/main.js
```

Expected: build succeeds, `dist/main.js` exists.

- [ ] **Step 4: Stage everything and report**

```bash
git add src/app.module.spec.ts docs/tech-debt.md tsconfig.json && git status
```

Verify the staged set includes all files from prior tasks plus these. Report: "Task 7 staged — observe stub removed (canary green), tech-debt §4 deleted, tsconfig.json updated for vitest/globals, full gate + build + dist/main.js green. Not committed — ready for review."

---

## Summary of all tasks

| # | Task | Files | Gate |
|---|---|---|---|
| 1 | Install vitest + create configs | vitest.config.ts, tsconfig.vitest.json, package.json, package-lock.json | `npx vitest run src/db/shared/date-range.util.spec.ts` |
| 2 | Verify simple specs (no changes) | (none) | `npx vitest run` on 11 simple files |
| 3 | Migrate 14 spec files (mechanical renames) | 14 spec files | `npx vitest run` on all 14 migrated files |
| 4 | Verify full suite + coverage | (none) | `npx vitest run --coverage` |
| 5 | Swap scripts + remove jest | package.json, package-lock.json | `npm test` |
| 6 | Remove observe stub (canary) | src/app.module.spec.ts | `npx vitest run src/app.module.spec.ts` |
| 7 | Delete tech-debt §4 + final gate | docs/tech-debt.md, tsconfig.json | typecheck + lint + lint:deps + test + build + dist/main.js |

**Total files created:** 2 (vitest.config.ts, tsconfig.vitest.json)
**Total files modified:** 18 (package.json, package-lock.json, 14 spec files, docs/tech-debt.md, tsconfig.json)
**Total files deleted:** 0
