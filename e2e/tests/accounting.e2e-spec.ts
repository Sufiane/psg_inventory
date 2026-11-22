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

        const scroller = page.getByRole('region', { name: 'Matchday strip scroller' });

        await expect(scroller).toBeVisible();
        await expect(scroller.getByText(E2E_OPPONENT_NAME).first()).toBeVisible();

        await expect(page.getByText('Net before season pass')).toBeVisible();
    });

    test.describe('venue filter', () => {
        test.describe('when venue is home', () => {
            test('lists the seeded home match', async ({ page }) => {
                await page.goto('/accounting?venue=home');

                const strip = page.getByRole('list', { name: 'Matchday strip' });

                await expect(
                    strip.getByRole('listitem', { name: new RegExp(E2E_OPPONENT_NAME) }),
                ).toHaveCount(1);
            });
        });

        test.describe('when venue is away', () => {
            test('shows the empty message and no seeded match', async ({ page }) => {
                await page.goto('/accounting?venue=away');

                await expect(page.getByText('No away matches this season.')).toBeVisible();
                await expect(page.getByRole('list', { name: 'Matchday strip' })).toHaveCount(0);
            });
        });

        test.describe('when clicking the Home tab', () => {
            test('sets venue=home in the URL', async ({ page }) => {
                await page.goto('/accounting');
                await page
                    .getByRole('navigation', { name: 'Venue' })
                    .getByRole('link', { name: 'Home' })
                    .click();

                await expect(page).toHaveURL(/venue=home/);
            });
        });
    });
});
