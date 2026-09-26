# Tech Stack

## Backend (`src/`, package.json at repo root)
- NestJS 12 (Express platform), TypeScript 6.0.3, ESM (`"type": "module"`), Node 24.21.0.
- Prisma 6 (`src/prisma/schema.prisma`) over PostgreSQL; migrations applied with `prisma migrate deploy`.
- node-redis 4 for caching; `src/redis/CACHE_KEYS.ts` is the single registry of cache keys and invalidators.
- Auth: Passport (jwt + local), bcrypt, `@nestjs/jwt`.
- Logging: nestjs-pino. Scheduling: `@nestjs/schedule` (e.g. `src/crons/cancel-sales`).
- External APIs: football-data.org v4 (`src/football-data/`), `@google/genai` (`src/llm/`, the "ask" feature).
- Validation: class-validator + class-transformer; env validated by `src/env.schema.ts` (zod-style schema).

## Frontend (`web/`, own package.json + lockfile)
- SvelteKit 2 + Svelte 5 (runes), Vite 8, TypeScript 6, Tailwind CSS v4 (`@theme` tokens live in `web/src/app.css`).
- `@sveltejs/adapter-cloudflare` + `wrangler.jsonc` — deployed on Cloudflare, not Node.
- Talks to the API via `BACKEND_URL` from `web/.env`.

## Shared
- `shared/` is declaration-only branded types consumed by both apps via the `@psg/shared/*` path alias (backend) / tsconfig path (frontend).

## Tooling
- Build: Nest CLI + `tsc-alias --resolve-full-paths`.
- Lint: ESLint 9 flat config (`eslint.config.mjs`) + typescript-eslint; `dependency-cruiser` enforces layer boundaries.
- Format: Prettier (`.prettierrc`: singleQuote, semi, trailingComma all, printWidth 90, **tabWidth 4**).
- Git hooks: husky → lint-staged (`.lintstagedrc`: `prettier --write` + `eslint --max-warnings 0` on staged `*.ts`); commitlint with `@commitlint/config-conventional`.
- Tests: Vitest 5 (swc plugin) for unit; Playwright 1.49 in `e2e/` for e2e.
- Package manager: npm (lockfiles committed, `npm ci` in CI).