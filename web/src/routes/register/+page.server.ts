import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { JWT_COOKIE } from '$lib/api';
import { backendUrl } from '$lib/env';
import { decodeJwt } from '$lib/jwt';
import { Logger } from '$lib/logger';
import type { LoginResponse } from '$lib/types';

const logger = new Logger('RegisterAction');

type FormValues = {
    email: string;
    firstName: string;
    lastName: string;
};

function failWith(
    status: number,
    values: FormValues,
    message: string,
    fieldErrors: Partial<Record<keyof FormValues | 'password', string>> = {},
) {
    return fail(status, { ...values, message, fieldErrors });
}

export const load: PageServerLoad = ({ locals, url }) => {
    if (locals.user) {
        const next = url.searchParams.get('next') ?? '/dashboard';

        throw redirect(303, next);
    }

    return {};
};

export const actions: Actions = {
    default: async (event) => {
        const form = await event.request.formData();
        const email = (form.get('email') ?? '').toString().trim();
        const firstName = (form.get('firstName') ?? '').toString().trim();
        const lastName = (form.get('lastName') ?? '').toString().trim();
        const password = (form.get('password') ?? '').toString();
        const confirmPassword = (form.get('confirmPassword') ?? '').toString();

        const values: FormValues = { email, firstName, lastName };
        const fieldErrors: Partial<Record<keyof FormValues | 'password', string>> = {};

        if (!email) {
            fieldErrors.email = 'Required.';
        }

        if (!firstName) {
            fieldErrors.firstName = 'Required.';
        }

        if (!lastName) {
            fieldErrors.lastName = 'Required.';
        }

        if (password.length < 7) {
            fieldErrors.password = 'At least 7 characters.';
        } else if (password !== confirmPassword) {
            fieldErrors.password = 'Passwords do not match.';
        }

        if (Object.keys(fieldErrors).length > 0) {
            return failWith(400, values, 'Fix the highlighted fields.', fieldErrors);
        }

        const base = backendUrl(event);
        const createTarget = `${base}/users`;
        let createResponse: Response;

        try {
            createResponse = await event.fetch(createTarget, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, firstName, lastName, password }),
            });
        } catch (err) {
            logger.error('register fetch failed', {
                target: createTarget,
                error: err instanceof Error ? err.message : String(err),
            });

            return failWith(502, values, `Backend unreachable at ${createTarget}.`);
        }

        if (!createResponse.ok) {
            const bodyText = await createResponse.text();
            logger.error('register non-ok', {
                target: createTarget,
                status: createResponse.status,
                body: bodyText,
            });

            const friendly =
                createResponse.status === 409
                    ? 'An account with that email already exists.'
                    : `Sign-up failed (${createResponse.status}): ${bodyText.slice(0, 200) || 'no body'}`;

            return failWith(createResponse.status, values, friendly);
        }

        const loginTarget = `${base}/users/login`;
        let loginResponse: Response;

        try {
            loginResponse = await event.fetch(loginTarget, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
        } catch (err) {
            logger.error('post-register login fetch failed', {
                target: loginTarget,
                error: err instanceof Error ? err.message : String(err),
            });

            throw redirect(303, '/login');
        }

        if (!loginResponse.ok) {
            logger.error('post-register login non-ok', {
                target: loginTarget,
                status: loginResponse.status,
            });

            throw redirect(303, '/login');
        }

        const body = (await loginResponse.json()) as LoginResponse;
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

        const next = event.url.searchParams.get('next') ?? '/dashboard';

        throw redirect(303, next);
    },
};
