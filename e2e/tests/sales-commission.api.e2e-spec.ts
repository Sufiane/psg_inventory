import { expect, test } from '@playwright/test';
import { loginAsE2eUser } from '../api-auth';

test.describe('GET /sales/commission', () => {
    test.describe('when the request carries a valid token', () => {
        test('returns the commission percent, not a sale lookup', async ({ request }) => {
            const headers = await loginAsE2eUser(request);
            const response = await request.get('/sales/commission', { headers });

            expect(response.status()).toBe(200);
            expect(await response.json()).toEqual({
                commissionPercent: expect.any(Number),
            });
        });
    });

    test.describe('when the request has no token', () => {
        test('rejects the request', async ({ request }) => {
            const response = await request.get('/sales/commission');

            expect(response.status()).toBe(401);
        });
    });
});
