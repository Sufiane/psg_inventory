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

## Testing
- Unit tests are colocated `*.spec.ts` next to the source; Vitest globals are on (`describe`/`it`/`expect` need no import), mocks via `vitest-mock-extended`.
- Tests needing the DB run against the Docker stack — never a remote database.