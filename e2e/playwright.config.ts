import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_FILE } from './paths';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    globalSetup: './global-setup.ts',
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'auth',
            testMatch: 'auth.e2e-spec.ts',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'authenticated',
            testMatch: /(sale|season-pass)\.e2e-spec\.ts/,
            use: { ...devices['Desktop Chrome'], storageState: E2E_AUTH_FILE },
        },
    ],
});
