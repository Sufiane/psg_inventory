import { expect, test } from '@playwright/test';
import { E2E_OPPONENT_NAME } from '../fixtures';

test.describe('season accounting', () => {
    test('shows title, matchday strip for the seeded match and totals', async ({
        page,
    }) => {
        await page.goto('/accounting');

        await expect(
            page.getByRole('heading', { level: 1, name: 'Season accounting' }),
        ).toBeVisible();

        const strip = page.getByRole('list', { name: 'Matchday strip' });

        await expect(
            strip.getByRole('listitem', { name: new RegExp(E2E_OPPONENT_NAME) }),
        ).toHaveCount(1);

        await expect(page.getByText('Net before season pass')).toBeVisible();
    });
});
