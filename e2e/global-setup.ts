import { chromium, type FullConfig } from '@playwright/test';
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from './fixtures';
import { E2E_AUTH_FILE } from './paths';

export default async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:4173';
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_USER_EMAIL);
    await page.getByLabel('Password').fill(E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');

    await context.storageState({ path: E2E_AUTH_FILE });
    await browser.close();
}
