import type { Handle } from '@sveltejs/kit';
import { JWT_COOKIE } from '$lib/api';
import { decodeJwt } from '$lib/jwt';

export const handle: Handle = async ({ event, resolve }) => {
    const token = event.cookies.get(JWT_COOKIE);

    if (token) {
        const user = decodeJwt(token);

        if (user) {
            event.locals.user = user;
        } else {
            event.locals.user = null;
            event.cookies.delete(JWT_COOKIE, { path: '/' });
        }
    } else {
        event.locals.user = null;
    }

    return resolve(event);
};
