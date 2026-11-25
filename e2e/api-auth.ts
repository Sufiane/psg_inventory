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
