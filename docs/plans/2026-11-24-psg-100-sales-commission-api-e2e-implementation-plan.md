# PSG-100 Implementation Plan: API e2e for GET /sales/commission

Spec: `docs/specs/2026-11-24-psg-100-sales-commission-api-e2e-design.md`

Single PR, e2e-only, about 60 lines. No split needed. Commit type: `test(e2e)`. No PR-number refs.

Conventions (repo CLAUDE.md): explicit return types, no single-letter vars, braces on every `if`, blank line before `if/return/throw`, no comments unless a non-obvious why, no barrel files.

## Task 1: API project in Playwright config

File: `e2e/playwright.config.ts`

1. Add `const apiURL = process.env.BACKEND_URL ?? 'http://localhost:7777';` next to `baseURL`.
2. Append a project:
   ```ts
   {
       name: 'api',
       testMatch: /\.api\.e2e-spec\.ts$/,
       use: { baseURL: apiURL },
   },
   ```
3. Confirm existing `auth` and `authenticated` regexes do not match `sales-commission.api.e2e-spec.ts` (the `sale\.e2e-spec` alternative needs `sale.` directly before `e2e-spec`).

## Task 2: Auth helper

File: `e2e/api-auth.ts`

```ts
import type { APIRequestContext } from '@playwright/test';
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from './fixtures';

export async function loginAsE2eUser(
    request: APIRequestContext,
): Promise<{ Authorization: string }> {
    const response = await request.post('/users/login', {
        data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD },
    });

    if (!response.ok()) {
        throw new Error(`e2e login failed with ${response.status()}`);
    }

    const { accessToken } = (await response.json()) as { accessToken: string };

    return { Authorization: `Bearer ${accessToken}` };
}
```

Check `LoginResponse` shape against `web/src/routes/login/+page.server.ts` (`accessToken`) and the login DTO field names before finalizing.

## Task 3: Spec

File: `e2e/tests/sales-commission.api.e2e-spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { loginAsE2eUser } from '../api-auth';

test.describe('GET /sales/commission', () => {
    test('returns the commission percent, not a sale lookup', async ({ request }) => {
        const headers = await loginAsE2eUser(request);
        const response = await request.get('/sales/commission', { headers });

        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual({
            commissionPercent: expect.any(Number),
        });
    });

    test('rejects requests without a token', async ({ request }) => {
        const response = await request.get('/sales/commission');

        expect(response.status()).toBe(401);
    });
});
```

Keep the `describe`/`it` naming rule from repo conventions if reshaping (condition in `describe`, outcome in `test`).

## Task 4: Verify (hand to qa-verifier)

1. `cd e2e && npm run typecheck && npm run lint`.
2. With backend on `:7777` and e2e seed applied: `npx playwright test --project=api` passes.
3. Mutation check: temporarily move `@Get('/commission')` below `@Get('/:saleId')` in `src/api/sales/sales.controller.ts`; the first test must fail; revert.
4. Confirm `npx playwright test --list` shows the new spec only under the `api` project.
5. CI: the existing `Run Playwright tests` step runs all projects; `BACKEND_URL` is already exported. No workflow change.

## Task 5: Pattern note (optional, 2 lines)

Add to `README.md` e2e section (if one exists) or skip: "API checks go in `e2e/tests/*.api.e2e-spec.ts`, use the `request` fixture and `loginAsE2eUser`."
