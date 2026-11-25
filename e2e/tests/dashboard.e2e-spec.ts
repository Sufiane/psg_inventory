import { expect, test } from '@playwright/test';

test.describe('dashboard', () => {
    test('shows the redesigned sections', async ({ page }) => {
        await page.goto('/dashboard');

        await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Log sale' })).toHaveAttribute(
            'href',
            '/sales/new',
        );
        await expect(
            page.getByRole('heading', { name: 'Net realized profit' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Season pass recovery' }),
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Recent sales' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Average ticket price' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Average net per match' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'ROI' })).toBeVisible();
        await expect(
            page
                .getByRole('img', { name: /Cumulative sold proceeds/ })
                .or(page.getByText('No sold sales with a sold date yet.')),
        ).toBeVisible();
    });
});
