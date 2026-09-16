# Split the `DbModule` Barrel and Rename the Db Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `DbModule` barrel with one db module per db service so every consumer imports exactly the db providers it uses; rename the db layer from `src/db/<m>/<m>.service.ts` / `FooService` to `<m>.db.ts` / `FooDb`; and widen the dependency-cruiser rules so they recognise the db layer by filename as well as by location.

**Architecture:** Backend only. Five tasks, strictly sequential — every task after Task 0 edits files an earlier task renamed or created. Task 0 establishes a baseline. Task 1 is a pure rename. Task 2 is config only. Task 3 is the DI restructure. Task 4 adds the one test that can catch a Task 3 mistake. Tasks 1/2/3/4 are Phases A/B/C/D in the spec's D7.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 + Redis (`src/`), Jest + `jest-mock-extended` for unit tests, dependency-cruiser 17 for the layering rules.

**Spec:** `docs/specs/2026-09-16-db-module-split-and-db-rename-design.md` — read D1–D8 before starting. D4's "considered and rejected" note in particular: do not narrow the `'\\.spec\\.ts$'` exemption.

## Global Constraints

- **Net-zero at runtime.** No behaviour change, no new endpoint, no new field, no validation change, no database migration. Every existing test must pass with only import-path and identifier updates — if a task seems to require editing a test's assertions or fixtures, stop and escalate; it is a misreading.
- **Do not touch `tsconfig.json` or `tsconfig.build.json`.** Widening the root `include` past `src/` silently relocates the nest build output to `dist/src/` and breaks the Railway `start:prod` script (`node dist/main`); no CI gate catches it. Every file this plan creates lands under `src/`, so no `include` edit is needed. `.dependency-cruiser.cjs` also reads `tsConfig: { fileName: 'tsconfig.json' }`, so a tsconfig edit would silently change what the dep rules can see.
- **Do not rename the abstract tokens.** `IUsersDbService`, `ISalesDbService`, `IMatchesDbService`, `IAccountingDbService`, `ISeasonPassesDbService`, `IHealthDbService`, `ISalesImportDbService`, `IRecipientsDbService` and their files `src/db/<m>/<m>.db.interface.ts` stay exactly as they are.
- **Do not add or remove a dependency.** No `package.json` change at all.
- **No global find-and-replace on class names.** Four api specs import an api class and a db class that currently share a name (`AccountingService`, `MatchesService`, `RecipientsService`, `SalesService`). A blind `sed` will rename the wrong one. Every rename below is spelled out per file.
- Hexagonal split is mandatory: `src/api/**` must never import Prisma. After Task 2, ORM imports are legal from `^src/db/`, from any `*.db.ts`, and from specs.
- Explicit return types on every function and method, including `Promise<void>`. No single-letter locals. No inline `if` — always braced, body on its own line. Blank line before `if` / `for` / `while` / `return` / `throw` unless first in its block. Constructor-injected dependencies stay `private readonly`.
- Comments default to none. This plan writes exactly two, both flagged in Task 4 as load-bearing why.
- Jest structure: a `describe` per condition (`when …`), `it` titles state only the outcome, shared setup in that `describe`'s own `beforeEach`/`beforeAll`.
- **Gate, run at the end of every task:**
  ```bash
  npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
  ```
  The `test -f dist/main.js` line is the guard for the tsconfig gotcha above. `lint:deps` is `depcruise src --config`, which picks up `.dependency-cruiser.cjs` by default — Task 2's changes take effect with no script change.
- **Do not commit.** Each task ends by *staging* its changes and reporting. The user runs `/crit` on the staged diff and gives the go-ahead before anything is committed. The `git add` lines below are deliberate; there are no `git commit` lines.

---

## Parallelism

**None. One track, five tasks, in order.**

| Task | Depends on |
|---|---|
| 0 — baseline | nothing |
| 1 — rename db layer | 0 |
| 2 — dependency-cruiser rules | 1 (the `\\.db\\.ts$` clause is meaningless until files are named that) |
| 3 — split the barrel | 1 (the new modules reference the renamed classes) |
| 4 — `AppModule` DI smoke spec | 3 (though see its note — it may also be landed before 3 as a guard) |

This is a **backend-only** plan. Nothing under `web/` or `shared/` is touched, and there is no frontend work to dispatch in parallel.

---

## File Structure

**Renamed (Task 1):**

| From | To | Class renamed |
|---|---|---|
| `src/db/accounting/accounting.service.ts` | `src/db/accounting/accounting.db.ts` | `AccountingService` → `AccountingDb` |
| `src/db/health/health.service.ts` | `src/db/health/health.db.ts` | `HealthService` → `HealthDb` |
| `src/db/matches/matches.service.ts` | `src/db/matches/matches.db.ts` | `MatchesService` → `MatchesDb` |
| `src/db/recipients/recipients.service.ts` | `src/db/recipients/recipients.db.ts` | `RecipientsService` → `RecipientsDb` |
| `src/db/sales/sales.service.ts` | `src/db/sales/sales.db.ts` | `SalesService` → `SalesDb` |
| `src/db/sales-import/sales-import.service.ts` | `src/db/sales-import/sales-import.db.ts` | `SalesImportService` → `SalesImportDb` |
| `src/db/season-passes/season-passes.service.ts` | `src/db/season-passes/season-passes.db.ts` | `SeasonPassesService` → `SeasonPassesDb` |
| `src/db/users/users.service.ts` | `src/db/users/users.db.ts` | `UsersService` → `UsersDb` |
| `src/db/matches/matches.service.spec.ts` | `src/db/matches/matches.db.spec.ts` | — |
| `src/db/recipients/recipients.service.spec.ts` | `src/db/recipients/recipients.db.spec.ts` | — |
| `src/db/sales/sales.service.spec.ts` | `src/db/sales/sales.db.spec.ts` | — |
| `src/db/sales-import/sales-import.service.spec.ts` | `src/db/sales-import/sales-import.db.spec.ts` | — |

`src/db/shared/date-range.util.spec.ts` is not a service spec and is untouched. `src/db/matches/matches.utils.ts`, `src/db/matches/matches.query.ts` and `src/db/sales/sales.query.ts` keep their names.

**Created (Task 3):**

| File | Responsibility |
|---|---|
| `src/db/prisma.module.ts` | `PrismaModule` — provides and exports `PrismaService`. Not `@Global()`. |
| `src/db/accounting/accounting.db.module.ts` | `AccountingDbModule` — owns `IAccountingDbService` |
| `src/db/health/health.db.module.ts` | `HealthDbModule` — owns `IHealthDbService` |
| `src/db/matches/matches.db.module.ts` | `MatchesDbModule` — owns `IMatchesDbService` |
| `src/db/recipients/recipients.db.module.ts` | `RecipientsDbModule` — owns `IRecipientsDbService` |
| `src/db/sales/sales.db.module.ts` | `SalesDbModule` — owns `ISalesDbService` |
| `src/db/sales-import/sales-import.db.module.ts` | `SalesImportDbModule` — owns `ISalesImportDbService` |
| `src/db/season-passes/season-passes.db.module.ts` | `SeasonPassesDbModule` — owns `ISeasonPassesDbService` |
| `src/db/users/users.db.module.ts` | `UsersDbModule` — owns `IUsersDbService` |

**Created (Task 4):** `src/app.module.spec.ts`.

**Deleted (Task 3):** `src/db/db.module.ts`.

---

### Task 0: Establish a green baseline

This workspace may have no `node_modules`. The design behind this plan was produced by static reading only; if the tree is already red somewhere, every later task's gate is meaningless until that is known.

- [ ] **Step 1: Install**

```bash
npm ci
```

- [ ] **Step 2: Run the full gate on the untouched tree**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

- [ ] **Step 3: Report the baseline explicitly**

Report each of the six commands as pass or fail, with the failure output if any. **If anything is red, stop and escalate — do not begin Task 1.** A pre-existing failure must be understood before a refactor that claims to be net-zero starts moving files.

Confirm `git status` is clean before continuing.

---

### Task 1: Rename the db layer to `*.db.ts` / `FooDb`

Pure rename. No logic changes. This task is green under the *existing* `.dependency-cruiser.cjs` — the files stay under `src/db/`, so `no-orm-outside-db`'s `^src/db/` clause still covers them.

**Files:**
- Rename + edit: the twelve files in the "Renamed" table above
- Modify: `src/db/db.module.ts`
- Modify: `src/api/accounting/accounting.service.spec.ts`, `src/api/admin/admin.service.spec.ts`, `src/api/matches/matches.service.spec.ts`, `src/api/recipients/recipients.service.spec.ts`, `src/api/sales/sales.service.spec.ts`, `src/api/sales-import/sales-import.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: exported classes `AccountingDb`, `HealthDb`, `MatchesDb`, `RecipientsDb`, `SalesDb`, `SalesImportDb`, `SeasonPassesDb`, `UsersDb`. All constructor signatures, method signatures and `implements` clauses are unchanged.

- [ ] **Step 1: Rename the files with `git mv`**

Use `git mv` so the rename is recorded as a rename and the diff stays readable.

```bash
git mv src/db/accounting/accounting.service.ts      src/db/accounting/accounting.db.ts
git mv src/db/health/health.service.ts              src/db/health/health.db.ts
git mv src/db/matches/matches.service.ts            src/db/matches/matches.db.ts
git mv src/db/recipients/recipients.service.ts      src/db/recipients/recipients.db.ts
git mv src/db/sales/sales.service.ts                src/db/sales/sales.db.ts
git mv src/db/sales-import/sales-import.service.ts  src/db/sales-import/sales-import.db.ts
git mv src/db/season-passes/season-passes.service.ts src/db/season-passes/season-passes.db.ts
git mv src/db/users/users.service.ts                src/db/users/users.db.ts

git mv src/db/matches/matches.service.spec.ts           src/db/matches/matches.db.spec.ts
git mv src/db/recipients/recipients.service.spec.ts     src/db/recipients/recipients.db.spec.ts
git mv src/db/sales/sales.service.spec.ts               src/db/sales/sales.db.spec.ts
git mv src/db/sales-import/sales-import.service.spec.ts src/db/sales-import/sales-import.db.spec.ts
```

- [ ] **Step 2: Rename the class in each of the eight `*.db.ts` files**

One identifier per file, on the `export class` line only. For example in `src/db/sales/sales.db.ts`:

```ts
export class SalesDb implements ISalesDbService {
```

Do the same for `AccountingDb`, `HealthDb`, `MatchesDb`, `RecipientsDb`, `SalesImportDb`, `SeasonPassesDb`, `UsersDb`. Leave the `implements I…DbService` clause, the constructor, and every method exactly as they are. Leave the relative imports (`./sales.query`, `./matches.utils`, `../prisma.service`, `../recipients/recipients.db.interface`) untouched — none of those files moved.

- [ ] **Step 3: Update the four db specs**

| File | Edit |
|---|---|
| `src/db/matches/matches.db.spec.ts` | import → `import { MatchesDb } from './matches.db';`; `describe('MatchesService (db)'` → `describe('MatchesDb'`; the three `MatchesService` identifiers (the `let service:` type, the provider entry, the `module.get(...)`) → `MatchesDb` |
| `src/db/recipients/recipients.db.spec.ts` | import → `import { RecipientsDb } from './recipients.db';`; `describe('RecipientsService (db)'` → `describe('RecipientsDb'`; the three `RecipientsService` identifiers → `RecipientsDb` |
| `src/db/sales/sales.db.spec.ts` | imports → `import { SalesDb } from './sales.db';` and `import { RecipientsDb } from '../recipients/recipients.db';` (the `as RecipientsDbService` alias goes away); `describe('SalesService (db)'` → `describe('SalesDb'`; `SalesService` identifiers → `SalesDb`; `RecipientsDbService` identifiers → `RecipientsDb` |
| `src/db/sales-import/sales-import.db.spec.ts` | imports → `import { SalesImportDb } from './sales-import.db';` and `import { RecipientsDb } from '../recipients/recipients.db';` (alias goes away); `describe('SalesImportService (db)'` → `describe('SalesImportDb'`; `SalesImportService` identifiers → `SalesImportDb`; `RecipientsDbService` identifiers → `RecipientsDb` |

The `(db)` suffix in those `describe` titles existed only to disambiguate from the api-layer class of the same name. It is now redundant — drop it. Local variable names (`service`, `prismaService`, `recipientsDbService`) stay as they are; they are not the collision.

- [ ] **Step 4: Update `src/db/db.module.ts`**

Replace the eight impl imports and the eight `useClass` references. The file becomes:

```ts
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersDb } from './users/users.db';
import { SalesDb } from './sales/sales.db';
import { MatchesDb } from './matches/matches.db';
import { AccountingDb } from './accounting/accounting.db';
import { SeasonPassesDb } from './season-passes/season-passes.db';
import { HealthDb } from './health/health.db';
import { IAccountingDbService } from './accounting/accounting.db.interface';
import { IMatchesDbService } from './matches/matches.db.interface';
import { ISalesDbService } from './sales/sales.db.interface';
import { IUsersDbService } from './users/users.db.interface';
import { ISeasonPassesDbService } from './season-passes/season-passes.db.interface';
import { IHealthDbService } from './health/health.db.interface';
import { ISalesImportDbService } from './sales-import/sales-import.db.interface';
import { SalesImportDb } from './sales-import/sales-import.db';
import { IRecipientsDbService } from './recipients/recipients.db.interface';
import { RecipientsDb } from './recipients/recipients.db';

@Module({
    providers: [
        PrismaService,
        { provide: IUsersDbService, useClass: UsersDb },
        { provide: ISalesDbService, useClass: SalesDb },
        { provide: IMatchesDbService, useClass: MatchesDb },
        { provide: IAccountingDbService, useClass: AccountingDb },
        { provide: ISeasonPassesDbService, useClass: SeasonPassesDb },
        { provide: IHealthDbService, useClass: HealthDb },
        { provide: ISalesImportDbService, useClass: SalesImportDb },
        { provide: IRecipientsDbService, useClass: RecipientsDb },
    ],
    exports: [
        IUsersDbService,
        ISalesDbService,
        IMatchesDbService,
        IAccountingDbService,
        ISeasonPassesDbService,
        IHealthDbService,
        ISalesImportDbService,
        IRecipientsDbService,
    ],
})
export class DbModule {}
```

`PrismaService` stays in `providers` and stays out of `exports`. That is deliberate and Task 3 preserves it.

- [ ] **Step 5: Update the six api specs**

These import a concrete db class **only** as the type argument to `mockDeep<T>` / `DeepMockProxy<T>`. No test body changes. Four of the six also import an api-layer class of the same name — rename only the db one.

`src/api/accounting/accounting.service.spec.ts`
- `import { SalesService as SalesDbService } from '../../db/sales/sales.service';` → `import { SalesDb } from '../../db/sales/sales.db';`
- `import { AccountingService as AccountingDbService } from '../../db/accounting/accounting.service';` → `import { AccountingDb } from '../../db/accounting/accounting.db';`
- `import { SeasonPassesService as SeasonPassesDbService } from '../../db/season-passes/season-passes.service';` → `import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';`
- Type positions: `DeepMockProxy<SalesDbService>` → `DeepMockProxy<SalesDb>`, and likewise for `AccountingDbService` → `AccountingDb`, `SeasonPassesDbService` → `SeasonPassesDb`; same substitution inside the three `mockDeep<…>()` calls.
- **Leave `AccountingService` (the api class, imported from `./accounting.service`) alone**, including `describe('AccountingService', …)` and the `let service:` / provider / `module.get` references. Leave the local variable names (`salesDbService`, `accountingDbService`, `seasonPassesDbService`) alone.

`src/api/admin/admin.service.spec.ts`
- `import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';` → `import { MatchesDb } from '../../db/matches/matches.db';`
- `import { UsersService } from '../../db/users/users.service';` → `import { UsersDb } from '../../db/users/users.db';`
- `DeepMockProxy<MatchsDbService>` → `DeepMockProxy<MatchesDb>`, `DeepMockProxy<UsersService>` → `DeepMockProxy<UsersDb>`, and the two `mockDeep<…>()` calls to match.

`src/api/matches/matches.service.spec.ts`
- `import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';` → `import { MatchesDb } from '../../db/matches/matches.db';`
- `DeepMockProxy<MatchsDbService>` → `DeepMockProxy<MatchesDb>`; `mockDeep<MatchsDbService>()` → `mockDeep<MatchesDb>()`.
- **Leave the api `MatchesService` (from `./matches.service`) alone**, including `describe('MatchesService', …)`.

`src/api/recipients/recipients.service.spec.ts`
- `import { RecipientsService as RecipientsDbService } from '../../db/recipients/recipients.service';` → `import { RecipientsDb } from '../../db/recipients/recipients.db';`
- `DeepMockProxy<RecipientsDbService>` → `DeepMockProxy<RecipientsDb>`; `mockDeep<RecipientsDbService>()` → `mockDeep<RecipientsDb>()`.
- **Leave the api `RecipientsService` and `describe('RecipientsService (api)', …)` alone.** That `(api)` suffix can go too, since the db side is now `RecipientsDb` — optional, and if you drop it, drop it here and nowhere else.

`src/api/sales/sales.service.spec.ts`
- `import { SalesService as SalesDbService } from '../../db/sales/sales.service';` → `import { SalesDb } from '../../db/sales/sales.db';`
- `import { MatchesService } from '../../db/matches/matches.service';` → `import { MatchesDb } from '../../db/matches/matches.db';`
- `import { SeasonPassesService as SeasonPassesDbService } from '../../db/season-passes/season-passes.service';` → `import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';`
- `import { RecipientsService as RecipientsDbService } from '../../db/recipients/recipients.service';` → `import { RecipientsDb } from '../../db/recipients/recipients.db';`
- Substitute in the four `DeepMockProxy<…>` declarations and the four `mockDeep<…>()` calls.
- **Leave the api `SalesService` (from `./sales.service`) alone.** Note that here the db `MatchesService` was imported *unaliased* — after this edit the only `Matches*` identifier in the file is `MatchesDb`.

`src/api/sales-import/sales-import.service.spec.ts`
- `import { MatchesService } from '../../db/matches/matches.service';` → `import { MatchesDb } from '../../db/matches/matches.db';`
- `import { SeasonPassesService } from '../../db/season-passes/season-passes.service';` → `import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';`
- `import { SalesImportService as SalesImportDbService } from '../../db/sales-import/sales-import.service';` → `import { SalesImportDb } from '../../db/sales-import/sales-import.db';`
- Substitute in the three `DeepMockProxy<…>` declarations and the three `mockDeep<…>()` calls.
- **Leave the api `SalesImportService` (from `./sales-import.service`) alone**, including `describe('SalesImportService', …)`.

- [ ] **Step 6: Prove nothing is left behind**

```bash
ls src/db/*/*.service.ts src/db/*/*.service.spec.ts 2>&1   # expect: No such file or directory
grep -rn "db/[a-z-]*/[a-z-]*\.service'" src                # expect: no output
grep -rn "as [A-Za-z]*DbService" src                       # expect: no output
grep -rn "Service (db)" src                                # expect: no output
```

- [ ] **Step 7: Prove nothing but names moved**

```bash
git diff --cached -M -U0 -- src/db | grep -E "^[+-]" | grep -v "^[+-][+-]"
```

Every line should be an `import`, an `export class`, a `describe` title, or a type/identifier position named in Steps 2–5. If a method body, a query, or a decorator shows up, revert it.

- [ ] **Step 8: Gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

Expected: all green, and the test count identical to the Task 0 baseline.

- [ ] **Step 9: Stage**

```bash
git add -A src/db src/api
```

Report: "Task 1 staged — db layer renamed to `*.db.ts` / `FooDb`, all import sites updated, test count unchanged at N. Not committed."

Suggested commit message when the user green-lights it: `refactor(db): rename db layer to *.db.ts and FooDb`

---

### Task 2: Widen the dependency-cruiser rules

Config only. Roughly ten lines. Kept separate from Task 1 on purpose: Task 1 is a large mechanical diff and this is the small semantic one, and reviewing them together hides this one.

**Files:**
- Modify: `.dependency-cruiser.cjs`

- [ ] **Step 1: Replace the `no-orm-outside-db` rule**

Replace the existing rule (the one whose comment claims it guards "`*.db.ts` files" while matching on `^src/db/`) with, exactly:

```js
        {
            name: 'no-orm-outside-db',
            comment:
                'Prisma may only be imported by the db layer: anything under src/db/, or any *.db.ts file wherever it lives (so a colocated *.usecase.db.ts under src/api/ stays legal). Api services and controllers go through a db token.',
            severity: 'error',
            from: {
                pathNot: ['^src/db/', '\\.db\\.ts$', '\\.spec\\.ts$'],
            },
            to: {
                path: ['^node_modules/(@prisma/client|\\.prisma/client)'],
                dependencyTypesNot: ['type-only'],
            },
        },
```

The `^src/db/` clause **stays**. `\\.db\\.ts$` is additive. Eleven files under `src/db/` are legal today purely by location — ten type files and interfaces, plus `src/db/matches/matches.utils.ts`, which uses `Competition.CHAMPIONSHIP` as a runtime value and therefore cannot be made type-only. Removing the location clause would break all eleven.

The `'\\.spec\\.ts$'` entry **stays exactly as it is.** Spec D4 records why narrowing it was considered and rejected: four api specs legitimately use Prisma enums as runtime fixture values. Do not touch it.

- [ ] **Step 2: Replace the `no-db-from-controller` rule**

```js
        {
            name: 'no-db-from-controller',
            comment:
                'Controllers are the http boundary; they must call api services, never the db layer directly.',
            severity: 'error',
            from: { path: '\\.controller\\.ts$' },
            to: { path: ['^src/db/', '\\.db\\.ts$'] },
        },
```

Widened, not swapped: swapping `^src/db/` out for `\\.db\\.ts$` would newly permit a controller to import `src/db/sales/type/sale.type.ts`, which is forbidden today.

- [ ] **Step 3: Add `no-prisma-service-outside-db`**

Insert immediately after `no-db-from-controller`:

```js
        {
            name: 'no-prisma-service-outside-db',
            comment:
                "PrismaService is the db layer's own handle on the ORM. Api services, controllers and their modules reach the database through a db token, never by importing PrismaService.",
            severity: 'error',
            from: { pathNot: ['^src/db/', '\\.db\\.ts$'] },
            to: { path: '^src/db/prisma\\.service\\.ts$' },
        },
```

No exemption for `*.db.module.ts` is needed and none is added: those files (created in Task 3) import `PrismaModule` from `src/db/prisma.module.ts` and never name `PrismaService`, and dependency-cruiser matches direct edges only, so `sales.db.module.ts → prisma.module.ts` is not a `to` match.

- [ ] **Step 4: Leave `no-api-from-db`, `no-circular` and `no-orphans` untouched**

Confirm with `git diff .dependency-cruiser.cjs` that only the two rules above changed and one was added.

- [ ] **Step 5: Prove the new rules actually bite**

A rule that passes because it matches nothing is worse than no rule. Verify each one fires, then revert the probe:

```bash
# no-orm-outside-db still catches an api-layer ORM import
printf "import { SaleStatus } from '@prisma/client';\nexport const probe = SaleStatus.SOLD;\n" > src/api/health/probe.ts
npm run lint:deps    # expect: error no-orm-outside-db on src/api/health/probe.ts
rm src/api/health/probe.ts

# no-prisma-service-outside-db catches an api-layer PrismaService import
printf "import { PrismaService } from '../../db/prisma.service';\nexport const probe = PrismaService;\n" > src/api/health/probe.ts
npm run lint:deps    # expect: error no-prisma-service-outside-db on src/api/health/probe.ts
rm src/api/health/probe.ts
```

Both probes use the imported symbol as a **runtime value**, not in a type position: dependency-cruiser exempts `type-only` dependencies from `no-orm-outside-db`, so a type-position probe could pass for the right reason and be misread as the rule failing to bite. If either probe passes lint, the rule is misanchored — stop and report. Confirm `git status` shows no leftover `probe.ts`.

- [ ] **Step 6: Gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

Expected: all green with **zero** new violations. The whole point of widening rather than swapping is that today's tree is unaffected.

- [ ] **Step 7: Stage**

```bash
git add .dependency-cruiser.cjs
```

Report: "Task 2 staged — `no-orm-outside-db` and `no-db-from-controller` widened to recognise `*.db.ts`, `no-prisma-service-outside-db` added; both probes fired; zero new violations. Not committed."

Suggested commit message: `chore(deps): anchor db-layer rules on *.db.ts and guard PrismaService`

---

### Task 3: Replace `DbModule` with one db module per db service

The highest-risk task in this plan. Eleven consumers rewired by hand; a missed `imports:` entry is a runtime resolution error that `tsc` and eslint both sail past. Task 4 is its net.

**Files:**
- Create: `src/db/prisma.module.ts` and the eight `src/db/<m>/<m>.db.module.ts`
- Modify: the eleven consumer modules listed in Step 3
- Delete: `src/db/db.module.ts`

**Interfaces:**
- Produces: `PrismaModule`, `AccountingDbModule`, `HealthDbModule`, `MatchesDbModule`, `RecipientsDbModule`, `SalesDbModule`, `SalesImportDbModule`, `SeasonPassesDbModule`, `UsersDbModule`. Each db module exports exactly one token.
- Removes: `DbModule`.

- [ ] **Step 1: Create `src/db/prisma.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
```

**Not `@Global()`.** A global module would make `PrismaService` injectable from any api service with no import statement at all — the exact invisible-availability failure this task exists to remove. Because all eight db modules import this same module class, Nest instantiates it once: one `PrismaService`, one connection pool, no runtime change.

- [ ] **Step 2: Create the eight db modules**

Six follow this shape exactly (shown for accounting; repeat for health, matches, season-passes, users, recipients with the obvious substitutions):

```ts
// src/db/accounting/accounting.db.module.ts
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { AccountingDb } from './accounting.db';
import { IAccountingDbService } from './accounting.db.interface';

@Module({
    imports: [PrismaModule],
    providers: [{ provide: IAccountingDbService, useClass: AccountingDb }],
    exports: [IAccountingDbService],
})
export class AccountingDbModule {}
```

| File | Class | Token | `imports` |
|---|---|---|---|
| `src/db/accounting/accounting.db.module.ts` | `AccountingDbModule` | `IAccountingDbService` → `AccountingDb` | `[PrismaModule]` |
| `src/db/health/health.db.module.ts` | `HealthDbModule` | `IHealthDbService` → `HealthDb` | `[PrismaModule]` |
| `src/db/matches/matches.db.module.ts` | `MatchesDbModule` | `IMatchesDbService` → `MatchesDb` | `[PrismaModule]` |
| `src/db/recipients/recipients.db.module.ts` | `RecipientsDbModule` | `IRecipientsDbService` → `RecipientsDb` | `[PrismaModule]` |
| `src/db/season-passes/season-passes.db.module.ts` | `SeasonPassesDbModule` | `ISeasonPassesDbService` → `SeasonPassesDb` | `[PrismaModule]` |
| `src/db/users/users.db.module.ts` | `UsersDbModule` | `IUsersDbService` → `UsersDb` | `[PrismaModule]` |
| `src/db/sales/sales.db.module.ts` | `SalesDbModule` | `ISalesDbService` → `SalesDb` | `[PrismaModule, RecipientsDbModule]` |
| `src/db/sales-import/sales-import.db.module.ts` | `SalesImportDbModule` | `ISalesImportDbService` → `SalesImportDb` | `[PrismaModule, RecipientsDbModule]` |

The last two are not a mistake: `SalesDb` and `SalesImportDb` both inject `IRecipientsDbService` in their constructors, so their modules must import `RecipientsDbModule`. `RecipientsDbModule` imports only `PrismaModule`, so there is no cycle — `npm run lint:deps` would fail `no-circular` if there were.

**Do not import `RedisModule` anywhere here.** It is already `@Global()` and the current `DbModule` does not import it either; adding it would be a separate decision about a different module.

- [ ] **Step 3: Rewire the eleven consumers**

In each file, remove the `DbModule` import line and replace `DbModule` in the `imports:` array with the db modules below. **Leave every other entry in each `imports:` array exactly where it is** (`FootballDataModule`, `RedisModule`, `AuthModule`, `PassportModule`, `JwtModule.registerAsync(...)`), and leave `controllers`, `providers` and `exports` untouched.

| File | `DbModule` becomes |
|---|---|
| `src/api/accounting/accounting.module.ts` | `AccountingDbModule, SalesDbModule, SeasonPassesDbModule` |
| `src/api/admin/admin.module.ts` | `MatchesDbModule, UsersDbModule` |
| `src/api/health/health.module.ts` | `HealthDbModule` |
| `src/api/matches/matches.module.ts` | `MatchesDbModule` |
| `src/api/recipients/recipients.module.ts` | `RecipientsDbModule` |
| `src/api/sales-import/sales-import.module.ts` | `MatchesDbModule, SeasonPassesDbModule, SalesImportDbModule` |
| `src/api/sales/sales.module.ts` | `SalesDbModule, MatchesDbModule, SeasonPassesDbModule, RecipientsDbModule` |
| `src/api/season-passes/season-passes.module.ts` | `SeasonPassesDbModule` |
| `src/api/users/users.module.ts` | `UsersDbModule` |
| `src/auth/auth.module.ts` | `UsersDbModule` |
| `src/crons/cancel-sales/cancel-sales.module.ts` | `SalesDbModule` |

Import paths are `'../../db/<m>/<m>.db.module'` from `src/api/**` and `src/crons/cancel-sales/`, and `'../db/users/users.db.module'` from `src/auth/auth.module.ts`.

This mapping was derived by reading constructors, not by guessing. For reference, the injected tokens are: `accounting.service.ts` → `IAccountingDbService`, `ISalesDbService`, `ISeasonPassesDbService`; `admin.service.ts` → `IMatchesDbService`, `IUsersDbService`; `health.service.ts` → `IHealthDbService`; `matches.service.ts` → `IMatchesDbService`; `recipients.service.ts` → `IRecipientsDbService`; `sales-import.service.ts` → `IMatchesDbService`, `ISeasonPassesDbService`, `ISalesImportDbService`; `sales.service.ts` → `ISalesDbService`, `IMatchesDbService`, `ISeasonPassesDbService`, `IRecipientsDbService`; `season-passes.service.ts` → `ISeasonPassesDbService`; `users.service.ts` → `IUsersDbService`; `auth.service.ts` **and** `auth/strategies/jwt.strategy.ts` → `IUsersDbService`; `cancel-sales.service.ts` → `ISalesDbService`.

`src/api/ask/ask.module.ts` is deliberately absent — it reaches data only through `IAccountingService` and `IMatchesService` and imports no db module. Do not add one.

- [ ] **Step 4: Delete the barrel**

```bash
git rm src/db/db.module.ts
grep -rn "DbModule } from" src | grep -v "\.db\.module'"   # expect: no output
grep -rn "\bDbModule\b" src | grep -vE "[A-Za-z]DbModule"  # expect: no output
```

- [ ] **Step 5: Confirm `PrismaService` did not leak**

```bash
grep -rn "PrismaService" src/api src/auth src/crons   # expect: no output
```

`PrismaModule` exports `PrismaService` to its importers only, and only the eight db modules import it. `npm run lint:deps` now enforces this via `no-prisma-service-outside-db`.

- [ ] **Step 6: Gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

Expected: all green, test count unchanged. Note what this does **not** prove: the unit suite mocks db tokens directly and never compiles the real module graph, so a missed `imports:` entry here can still be green. Task 4 closes that hole.

- [ ] **Step 7: Stage**

```bash
git add -A src/db src/api src/auth src/crons
```

Report: "Task 3 staged — `DbModule` deleted, `PrismaModule` plus eight per-service db modules created, eleven consumers rewired. Not committed."

Suggested commit message: `refactor(db): replace the DbModule barrel with per-service db modules`

---

### Task 4: `AppModule` DI smoke spec

The only automated thing that catches a missed `imports:` entry from Task 3. It compiles the real `AppModule` graph. It must pass against both the pre-Task-3 `DbModule` wiring and the post-Task-3 wiring — if you would rather have it as a guard while doing Task 3, landing it first is acceptable and it should be green either way.

**Files:**
- Create: `src/app.module.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { Test } from '@nestjs/testing';

const STUB_ENV = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/psg_inventory_smoke',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_SECRET: 'smoke-secret',
    JWT_EXPIRES: '1d',
    FOOTBALL_DATA_API_KEY: 'smoke-key',
};

describe('AppModule', () => {
    describe('when the whole application graph is compiled', () => {
        const savedEnv = { ...process.env };

        beforeAll(() => {
            Object.assign(process.env, STUB_ENV);
            delete process.env.OBSERVE_APP_KEY;
            delete process.env.OBSERVE_APP_SECRET;
        });

        afterAll(() => {
            process.env = savedEnv;
        });

        it('resolves every provider', async () => {
            // Imported inside the test, not at the top of the file:
            // ConfigModule.forRoot validates and AppModule's ObserveModule
            // ternary is evaluated the moment app.module.ts is first
            // evaluated, so the stub env has to already be in place.
            const { AppModule } = await import('./app.module');

            await expect(
                Test.createTestingModule({ imports: [AppModule] }).compile(),
            ).resolves.toBeDefined();
        }, 30_000);
    });
});
```

Four things about this file are deliberate and must not be "cleaned up":

1. **No `.close()` on the compiled module.** `close()` fires `onModuleDestroy`, which calls `redis.quit()` on a client that never connected and throws. `compile()` opens nothing, so there is nothing to close.
2. **`NODE_ENV: 'production'`.** `src/app.module.ts` only attaches the `pino-pretty` transport when `NODE_ENV !== 'production'`, and that transport spawns a worker thread Jest will then report as an open handle.
3. **`OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` deleted, not stubbed.** `AppModule` registers `ObserveModule` only when both are set; leaving them unset is what keeps telemetry out of the test.
4. **`GEMINI_API_KEY` absent.** It is `@IsOptional()` in `src/env.schema.ts` and `LlmService` explicitly handles the unset case.

`src/env.schema.ts` requires exactly four variables — `JWT_SECRET`, `JWT_EXPIRES`, `FOOTBALL_DATA_API_KEY`, `REDIS_URL`. `DATABASE_URL` is not validated by the schema but the `PrismaClient` constructor needs it, which is why the stub sets it.

The second comment in the file is the only other one this plan writes. Both earn their place: each explains a non-obvious why that the next reader would otherwise "fix".

- [ ] **Step 2: Prove it opens no socket**

Run it with Postgres and Redis **down** — that is the claim, and reasoning about `onModuleInit` is not evidence:

```bash
npm run local:db:down
npx jest src/app.module.spec.ts --detectOpenHandles
```

Expected: PASS, no open-handle report, no connection error. If it hangs or reports a handle, something in the graph connects eagerly — stop and report which provider.

```bash
npm run local:db:up
```

- [ ] **Step 3: Prove it would have caught a Task 3 mistake**

Temporarily remove one db module from one consumer — for example drop `MatchesDbModule` from `src/api/sales/sales.module.ts`'s `imports` — and re-run:

```bash
npx jest src/app.module.spec.ts     # expect: FAIL, "Nest can't resolve dependencies of the SalesService"
```

Restore the line and confirm it passes again. A smoke test that cannot fail is not a test.

- [ ] **Step 4: Gate**

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

Expected: all green, test count is the Task 0 baseline plus one.

- [ ] **Step 5: Stage**

```bash
git add src/app.module.spec.ts
```

Report: "Task 4 staged — `AppModule` DI smoke spec added, verified green with Postgres and Redis down, and verified to fail when a db module import is removed. Not committed."

Suggested commit message: `test(app): compile the AppModule graph to catch missing module imports`

---

## Final verification

After all five tasks are staged, from a clean shell:

```bash
npm run typecheck && npm run lint && npm run lint:deps && npm test && npm run build && test -f dist/main.js
```

Then confirm the refactor is actually complete:

```bash
ls src/db/*/*.service.ts 2>&1                            # expect: No such file or directory
ls src/db/db.module.ts 2>&1                              # expect: No such file or directory
grep -rn "PrismaService" src/api src/auth src/crons      # expect: no output
grep -rn "as [A-Za-z]*DbService" src                     # expect: no output
ls src/db/*/*.db.module.ts | wc -l                       # expect: 8
grep -c "PrismaModule" src/db/*/*.db.module.ts           # expect: 2 per file (import + imports array)
```

And confirm the net-zero claim holds:

```bash
git diff --cached --stat -- package.json package-lock.json tsconfig.json tsconfig.build.json
```

Expected: no output — this change touches none of those four files.

Then report to the user that the full change is staged across five reviewable units and ready for `/crit`. Do not commit.
