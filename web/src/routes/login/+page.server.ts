import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { JWT_COOKIE } from '$lib/api';
import { backendUrl } from '$lib/env';
import { decodeJwt } from '$lib/jwt';
import type { LoginResponse } from '$lib/types';

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

        const response = await event.fetch(`${backendUrl(event)}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            return fail(response.status, {
                email,
                message: 'Invalid email or password.',
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
