# PSG-100: API-level e2e for GET /sales/commission

## Problem

`GET /sales/commission` (PSG-92) returns `{ commissionPercent }` and has a unit spec only. It must stay declared before `GET /sales/:saleId` in `SalesController`; if it moves below, `commission` is parsed as a `saleId` and the route breaks. No test catches that. `e2e/tests` holds browser specs only, so there is no API-request pattern to reuse.

## Findings

- Web has no proxy route for `/sales/commission` (`web/src/routes/api` only has `sales-import/*`). The web app calls the backend server-side via `api()` in `web/src/lib/api.ts`, using `BACKEND_URL`. So the route is not reachable through the web origin (`localhost:4173`); the spec must hit the backend directly.
- CI e2e job already starts the backend on `:7777` and exports `BACKEND_URL=http://localhost:7777`. No CI change needed.
- Auth is a global guard (only `@Public()` routes skip it). Login is `POST /users/login` with `{ email, password }`, returns `{ accessToken }`. Seeded e2e user is in `e2e/fixtures.ts`.
- `playwright.config.ts` projects use `testMatch` and a `baseURL` shared via top-level `use`. Browser projects use `E2E_AUTH_FILE` (cookie); that does not apply to bearer-auth API calls.

## Design

- New Playwright project `api`: `testMatch: /\.api\.e2e-spec\.ts$/`, `use: { baseURL: apiURL }`, no browser device. `apiURL = process.env.BACKEND_URL ?? 'http://localhost:7777'`. File suffix `.api.e2e-spec.ts` is the convention for all future API checks; adding one needs no config edit.
- Existing project regexes (`sale|season-pass|...\.e2e-spec\.ts`) do not match `*.api.e2e-spec.ts`, so no double-run. Verify this.
- New helper `e2e/api-auth.ts`: `loginAsE2eUser(request): Promise<{ Authorization: string }>`. POSTs `/users/login`, returns bearer header. Reusable by future API specs.
- New spec `e2e/tests/sales-commission.api.e2e-spec.ts` (uses the `request` fixture):
  - authenticated: 200, body has numeric `commissionPercent` (shape only, not the constant 12; value is covered by the unit spec). A 200 with this body, not 400/404, is what proves the route is declared before `/:saleId`.
  - unauthenticated: 401.
- Backend and web untouched. e2e-only.

## Out of scope

- Asserting the exact commission value (unit spec owns it).
- Moving existing browser specs, a shared API client, or other route coverage (new tickets as needed).

## Open decisions

1. Reuse `BACKEND_URL` for the API base (chosen: already set in CI) vs a new `E2E_API_URL`.
2. Assert shape only (chosen) vs exact value 12.
3. Login per spec file via helper (chosen, simple) vs caching a token in globalSetup.

## Size

XS, about 60 lines: config ~8, helper ~15, spec ~35.
