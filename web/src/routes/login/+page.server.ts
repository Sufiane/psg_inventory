import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { JWT_COOKIE } from '$lib/api';
import { backendUrl } from '$lib/env';
import { decodeJwt } from '$lib/jwt';
import { Logger } from '$lib/logger';
import type { LoginResponse } from '$lib/types';

const logger = new Logger('LoginAction');

export const load: PageServerLoad = ({ locals, url }) => {
    if (locals.user) {
        const next = url.searchParams.get('next') ?? '/';

        throw redirect(303, next);
    }

    return {};
};

export const actions: Actions = {
    default: async (event) => {
        const form = await event.request.formData();
        const email = form.get('email');
        const password = form.get('password');

        if (typeof email !== 'string' || typeof password !== 'string') {
            return fail(400, {
                email: typeof email === 'string' ? email : '',
                message: 'Email and password are required.',
            });
        }

        const target = `${backendUrl(event)}/users/login`;
        let response: Response;

        try {
            response = await event.fetch(target, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
        } catch (err) {
            logger.error('login fetch failed', {
                target,
                error: err instanceof Error ? err.message : String(err),
            });

            return fail(502, {
                email,
                message: `Backend unreachable at ${target}.`,
            });
        }

        if (!response.ok) {
            const bodyText = await response.text();
            logger.error('login non-ok', {
                target,
                status: response.status,
                body: bodyText,
            });

            return fail(response.status, {
                email,
                message: `Login failed (${response.status}): ${bodyText.slice(0, 200) || 'no body'}`,
            });
        }

        const body = (await response.json()) as LoginResponse;
        const claims = decodeJwt(body.token);
        const maxAge = claims?.exp
            ? Math.max(claims.exp - Math.floor(Date.now() / 1000), 60)
            : 60 * 60 * 24;

        event.cookies.set(JWT_COOKIE, body.token, {
            httpOnly: true,
            secure: event.url.protocol === 'https:',
            sameSite: 'lax',
            path: '/',
            maxAge,
        });

        const next = event.url.searchParams.get('next') ?? '/';

        throw redirect(303, next);
    },
};
