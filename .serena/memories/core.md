# Core

PSG ticket-resale ledger: two deployable apps plus shared types in one repo.

## Source map
- `src/` — NestJS API. Layering, module and usecase rules: `mem:backend/core`.
- `web/` — SvelteKit SPA deployed separately (Cloudflare). UI conventions: `mem:frontend/core`.
- `shared/` — TYPE-ONLY branded nominal types (`*.d.ts`, no runtime code, no `index.ts`). Import only as `import type { X } from '@psg/shared/<module>'` with a deep path (`@psg/shared/ids`, `/money`, `/cache`, `/strings`, `/time`, `/counts`, `/percentage`, `/brand`); the bare `@psg/shared` specifier does not resolve.
- `scripts/` — tsx CLI entrypoints (seed-demo, seed-e2e, ungift-sale).
- `e2e/` — separate Playwright package with its own package.json and node_modules.
- `docs/specs/` + `docs/plans/` — dated design/plan pair per non-trivial change (`YYYY-MM-DD-<TICKET>-<slug>.md`). Read both before touching a feature that has one.
- `PRODUCT.md` — product voice, design principles, anti-references. Binding for any UI/copy work.
- `graphify-out/`, `dist/`, `.impeccable/` — generated; never edit by hand.

## Project-wide invariants
- Node is pinned to 24.21.0 (`engines`, CI). TypeScript 6, `strict` plus `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` — indexed access is `T | undefined`.
- Local dev and tests only ever talk to the Docker stack from `docker-compose.yml`. Production connection strings never belong in a local `.env`.
- API default port 7777; each Conductor workspace derives its own API/web/postgres/redis ports in `.conductor/settings.local.toml`.
- Dependencies are pinned exact (no ranges) in package.json; do not add `^`/`~`.

## Tooling policy (always)
- Prefer Serena's symbolic tools over raw read/grep/edit for code files: `get_symbols_overview` → `find_symbol` → `replace_symbol_body`/`replace_content`/`replace_in_files`; `find_referencing_symbols` for impact. Grep/glob only for discovery.
- Prefer the codebase-memory graph (CBM) over grep for anything structural: `search_graph`/`search_code` to locate definitions, `trace_path` for callers/callees and data flow, `get_architecture` for the big picture, `query_graph` for multi-hop/Cypher questions, `detect_changes` for impact of a diff.
- Both MCPs are configured and expected to be used on every task in this repo.

## Reference index
- Tech stack, versions, package managers: `mem:tech_stack`
- Commands you will actually run: `mem:suggested_commands`
- Naming/style/architecture conventions: `mem:conventions`
- Exact gates that mean "task done": `mem:task_completion`
- Backend module/layer specifics: `mem:backend/core`
- Frontend (SvelteKit) specifics: `mem:frontend/core`