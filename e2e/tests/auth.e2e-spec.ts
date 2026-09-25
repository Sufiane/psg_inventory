import { expect, test } from '@playwright/test';
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from '../fixtures';

test.describe('login', () => {
    test('valid credentials redirect to the dashboard', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel('Email').fill(E2E_USER_EMAIL);
        await page.getByLabel('Password').fill(E2E_USER_PASSWORD);
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('invalid credentials show an inline error and stay on login', async ({
        page,
    }) => {
        await page.goto('/login');
        await page.getByLabel('Email').fill(E2E_USER_EMAIL);
        await page.getByLabel('Password').fill('definitely-wrong-password');
        await page.getByRole('button', { name: 'Sign in' }).click();

        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });
});
