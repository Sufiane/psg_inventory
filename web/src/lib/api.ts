import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { backendUrl } from './env';

export const JWT_COOKIE = 'jwt';

type ApiInit = Omit<RequestInit, 'body'> & {
    json?: unknown;
    expectEmpty?: boolean;
};

export async function api<T = unknown>(
    event: RequestEvent,
    path: string,
    init: ApiInit = {},
): Promise<T> {
    const token = event.cookies.get(JWT_COOKIE);
    const headers = new Headers(init.headers);

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    if (init.json !== undefined) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await event.fetch(`${backendUrl(event)}${path}`, {
        ...init,
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });

    if (!response.ok) {
        const message = await extractMessage(response);

        if (response.status === 401) {
            event.cookies.delete(JWT_COOKIE, { path: '/' });
        }

        throw error(response.status, message);
    }

    if (init.expectEmpty || response.status === 204) {
        return undefined as T;
    }

    const text = await response.text();

    if (text.length === 0) {
        return undefined as T;
    }

    return JSON.parse(text) as T;
}

async function extractMessage(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { message?: string | string[] };

        if (Array.isArray(body.message)) {
            return body.message.join(', ');
        }

        if (typeof body.message === 'string') {
            return body.message;
        }
    } catch {
        // fall through
    }

    return `Request failed (${response.status})`;
}
