import { error, json, type RequestHandler } from '@sveltejs/kit';
import { JWT_COOKIE } from '$lib/api';
import { backendUrl } from '$lib/env';

export const POST: RequestHandler = async (event) => {
    const token = event.cookies.get(JWT_COOKIE);
    const formData = await event.request.formData();
    const headers = new Headers();

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await event.fetch(`${backendUrl(event)}/sales/import/preview`, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!response.ok) {
        const message = await extractMessage(response);

        throw error(response.status, message);
    }

    return json(await response.json());
};

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
