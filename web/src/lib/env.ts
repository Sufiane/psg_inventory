import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function backendUrl(event: RequestEvent): string {
    const fromPlatform = event.platform?.env?.BACKEND_URL;
    const fromProcess = env.BACKEND_URL;
    const url = fromPlatform ?? fromProcess;

    if (!url) {
        throw new Error('BACKEND_URL is not set');
    }

    return url.replace(/\/+$/, '');
}
