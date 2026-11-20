import { expect, test } from '@playwright/test';
import { E2E_OPPONENT_NAME } from '../fixtures';

const SEEDED_DAYS_FROM_NOW = 30;
const AUGUST = 7;

function seededSeasonYear(): number {
    const kickoff = new Date();

    kickoff.setUTCDate(kickoff.getUTCDate() + SEEDED_DAYS_FROM_NOW);

    return kickoff.getUTCMonth() < AUGUST
        ? kickoff.getUTCFullYear() - 1
        : kickoff.getUTCFullYear();
}

test.describe('matches', () => {
    test('selecting a match opens its inspector', async ({ page }) => {
        await page.goto(`/matches?year=${seededSeasonYear()}`);
        await page.waitForLoadState('networkidle');

        const row = page
            .getByRole('link', { name: new RegExp(E2E_OPPONENT_NAME) })
            .first();

        await expect(async () => {
            await row.click();
            await expect(page).toHaveURL(/[?&]match=/, { timeout: 1000 });
        }).toPass();

        await expect(
            page.getByRole('heading', { name: new RegExp(E2E_OPPONENT_NAME) }),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Log sale' })).toBeVisible();
    });
});
