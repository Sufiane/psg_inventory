# Backend (NestJS `src/`)

## Layers
```
controller (.controller.ts)  →  service interface + service (.service.ts)  →  db token  →  db layer (src/db/**, *.db.ts)  →  Prisma
```
- `src/api/<feature>/`: controller, service interface (`interfaces/*.interface.ts`), service, DTOs, formatters, usecases.
- `src/db/<feature>/`: queries (`*.query.ts`), row types (`type/*.type.ts`), Prisma-backed repositories. Leaf — never imports `src/api`.
- `*.db.ts` anywhere is legal for Prisma imports (lets a colocated `<x>.usecase.db.ts` own its transaction).
- Cross-cutting: `src/common/` (exceptions, filters), `src/shared/` (guards, decorators, utils, types), `src/auth/`, `src/redis/`, `src/crons/`.

## Non-obvious
- Controllers must not reach data access even indirectly — inject the service, pass a db token down.
- `src/redis/CACHE_KEYS.ts` owns cache key definitions plus `invalidateSales`/`invalidateAccounting`/`invalidateRecipients`. Any new cached read must register its key here and invalidate through it; `RedisService.get` is the highest fan-in function in the codebase (73 callers).
- Cache invalidation is a common regression point: after changing what a query returns, check which invalidator covers it.
- `src/env.schema.ts` validates env at boot — a new env var must be added there, not read via `process.env` directly.
- Modules are being split per usecase (`docs/plans/2026-09-22-psg-24-usecase-module-split.md`); when adding behaviour prefer a new usecase module over extending an existing service.
- Tests needing state: seed with `npm run local:db:seed`; the demo logins are `demo1@psg.fr` / `demo1234`.