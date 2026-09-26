# Suggested Commands

Run from the repo root. Darwin/zsh: quote globs and use `npm --prefix` rather than `cd`.

## Backend
```bash
npm run start:dev        # build + nest watch (port 7777)
npm run build            # nest build + tsc-alias
npm test                 # vitest run (unit, src/**/*.spec.ts)
npm run test:watch
npm run test:cov
npm run typecheck        # tsc --noEmit
npm run lint             # eslint src+scripts, --max-warnings 0
npm run lint:deps        # dependency-cruiser layer rules
npm run format           # prettier --write src/**/*.ts
```

## Local stack (Docker; required before tests/seed)
```bash
npm run local:db:up        # docker compose up -d --wait (postgres + redis)
npm run local:db:migrate   # prisma migrate deploy
npm run local:db:seed      # demo users + synthetic fixtures
npm run local:db:seed:e2e  # e2e fixtures
npm run local:db:down      # stop, keep volumes
npm run local:db:destroy   # stop and delete volumes
```

## Frontend (`web/`)
```bash
npm --prefix web run dev        # vite dev
npm --prefix web run check      # svelte-check
npm --prefix web run typecheck  # tsc --noEmit
npm --prefix web test           # vitest run
npm --prefix web run build
```

## E2E (`e2e/`, needs the web preview on 4173 + seeded db)
```bash
npm --prefix e2e test           # playwright test
npm --prefix e2e run typecheck
```

## One-off scripts
```bash
npm run ungift -- <userId> <saleId> --yes   # has its own usage guard; read scripts/ungift-sale.ts
```

## Git
```bash
git log --oneline -15
gh pr create --base main
```