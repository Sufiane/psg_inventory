# Task Completion

A coding task is done only when all of these pass, in this order (mirrors `.github/workflows/ci.yml`):

```bash
npm run typecheck
npm run lint
npm run lint:deps
npm test
npm run build
test -f dist/main.js   # CI asserts the build emitted a runnable entrypoint
```

Add when the change touches `web/`:

```bash
npm --prefix web run typecheck
npm --prefix web run check
npm --prefix web test
```

Add when the change touches `e2e/`:

```bash
npm --prefix e2e run typecheck
```

Notes
- `lint` and `lint:deps` both gate CI; a passing `tsc` does not imply layer rules pass.
- The build can exit 0 while emitting nothing (stale `.tsbuildinfo`) — keep the `dist/main.js` check.
- Prisma schema change ⇒ run `npm run local:db:migrate` locally and commit the generated migration under `src/prisma/migrations/`.
- If you added a dependency, add it exact-pinned (no range) and commit the lockfile.