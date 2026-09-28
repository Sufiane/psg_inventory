# Conventions

## Style
- Prettier is authoritative: 4-space indent, single quotes, semicolons, trailing commas, **printWidth 90**.
- `no-console` is an ESLint **error** in app code; only CLI scripts escape it via a file-level `/* eslint-disable no-console -- reason */` comment with a reason.
- `@typescript-eslint/explicit-function-return-type` is an error — annotate every function's return type (`: void`, `: Promise<X>`).
- Prefer `const`; `noUnusedLocals`/`noUnusedParameters` mean unused imports/params fail typecheck.

## Commits & branches
- Conventional Commits enforced by commitlint: `feat(scope): ...`, `refactor(scope): ...`, `fix(scope): ...`; scope is the feature area (`sales`, `ask`, `e2e`, `accounting`).
- Ticket ids appear as a suffix: `refactor(ask): extract ask into its own usecase (PSG-27)`.
- History is squash-merged to main, so a PR branch shows each commit twice (local + merged squash).

## Documentation workflow
- Non-trivial work gets a dated design doc in `docs/specs/` and a phased plan in `docs/plans/`, same slug for both. Plans are the source of truth for sequencing.

## Architecture (enforced by `npm run lint:deps`, see `.dependency-cruiser.cjs`)
- Prisma is importable ONLY from `src/db/**` or any `*.db.ts` file. API services take a db token.
- Controllers must never import the db layer (type-only imports are exempt).
- `PrismaService`/`PrismaModule` are reachable only from `src/db/`, `*.db.ts`, `*.module.ts`.
- `src/db/` is a leaf: never imports from `src/api/`.
- No circular dependencies; orphan files warn.

## Backend structure
- Feature verticals live in `src/api/<feature>/` (controller → service interface → service) with the data access counterpart in `src/db/<feature>/`. Both use matching folder names.
- Business logic is being extracted into dedicated usecase modules (`<feature>/<verb>-<noun>.usecase.ts`); prefer adding a usecase over growing a service.
- Domain errors: `src/common/exceptions/domain.exception.ts` + `error-codes.enum.ts`; HTTP mapping in `src/common/exceptions/http-exception.mapper.ts`. Throw domain errors, not raw `HttpException`.
- Season maths are centralized in `src/shared/utils/season/utils.ts` — never re-derive a season window inline.
- Money maths is branded: use the types from `@psg/shared/money` and `computeProfit` rather than raw arithmetic on `number`.

## Branded types (PSG-36/PSG-39)
- **Where the cast lives:** at the raw-data boundary — where the row *materializes* (the `*.db.ts` method), never inside `src/redis/CACHE_KEYS.ts` and never at a consuming sink. `users.db.ts` brands its `Users` rows once via `UserRecord = Users & { id: UserId; email: Email }` (users.db.interface.ts) so sinks (admin/auth/jwt) get brands for free; brand whole results with `as Promise<XRecord | null>` (no spread, no added `await`, zero emitted-JS change). Never cast to force an already-branded value to compile.
- **One cast at the source beats N at the sinks** (same reasoning as PSG-39 D4's `updatedMatchIds: MatchId[]`). User review drove this: the first PSG-39 implementation cast in `admin.service.ts` and was rejected in favor of the db-layer brand.
- Test literals get inline casts (`'sale-1' as SaleId`), matching repo convention.
- Do NOT invent new brands to fill a gap without an explicit decision: `familyId`, refresh `secret`, and `hourBucket` on CACHE_KEYS deliberately stay `string` (PSG-39 D2). Note `RefreshToken` is the *combined* `${familyId}.${secret}` token — never reuse it for the parts.
- Type-level refactors use `npm run typecheck` as the failing test (RED census of call sites); prove key templates stay byte-identical by diffing `grep -o`-extracted backtick templates between HEAD and the working tree.

## Testing
- Unit tests are colocated `*.spec.ts` next to the source; Vitest globals are on (`describe`/`it`/`expect` need no import), mocks via `vitest-mock-extended`.
- Tests needing the DB run against the Docker stack — never a remote database.
- Structure convention: one `describe('when <condition>')` per conditional branch; `it` titles state ONLY the outcome and never repeat the condition; shared setup lives in that `describe`'s own `beforeEach`. Stated verbatim in `docs/plans/*` headers (e.g. `docs/plans/2026-08-30-ask-a-question.md` line 22); reference implementations: `get-amortization.usecase.spec.ts` (PSG-37, commit 1ccc96d) and `import-passes.validator.spec.ts` (PSG-41). NOT enforced by any lint rule (no title-content ESLint rule exists).
- Gotcha: `docs/tech-debt.md` entry 5 attributes the test convention to a `CLAUDE.md` that does not exist in this repo, and the entry itself is stale — PSG-37 shipped (commit 1ccc96d, PR #62) but the ledger entry was never deleted despite the file's "Delete it when it's done" rule. Check/fix on the next ledger cleanup.