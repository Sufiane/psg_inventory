import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SessionUser } from './types';

export function requireAuth(event: RequestEvent): SessionUser {
    if (!event.locals.user) {
        const next = encodeURIComponent(event.url.pathname + event.url.search);

        throw redirect(303, `/login?next=${next}`);
    }

    return event.locals.user;
}

export function requireAdmin(event: RequestEvent): SessionUser {
    const user = requireAuth(event);

    if (user.role !== 'ADMIN') {
        throw redirect(303, '/');
    }

    return user;
}
