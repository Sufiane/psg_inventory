import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { JWT_COOKIE } from '$lib/api';
import { backendUrl } from '$lib/env';
import { decodeJwt } from '$lib/jwt';
import { Logger } from '$lib/logger';
import type { LoginResponse } from '$lib/types';

const logger = new Logger('HomeDemoAction');

const DEMO_ACCOUNTS = {
    demo1: { email: 'demo1@psg.fr', password: 'demo1234' },
    demo2: { email: 'demo2@psg.fr', password: 'demo1234' },
} as const;

type DemoKey = keyof typeof DEMO_ACCOUNTS;

export const load: PageServerLoad = ({ locals }) => {
    if (locals.user) {
        throw redirect(303, '/dashboard');
    }

    return { demoAccounts: DEMO_ACCOUNTS };
};

export const actions: Actions = {
    demo: async (event) => {
        const form = await event.request.formData();
        const account = form.get('account');
        const key: DemoKey = account === 'demo2' ? 'demo2' : 'demo1';
        const credentials = DEMO_ACCOUNTS[key];

        const target = `${backendUrl(event)}/users/login`;
        let response: Response;

        try {
            response = await event.fetch(target, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            });
        } catch (err) {
            logger.error('demo login fetch failed', {
                target,
                error: err instanceof Error ? err.message : String(err),
            });

            return fail(502, {
                message: `Backend unreachable at ${target}.`,
            });
        }

        if (!response.ok) {
            const bodyText = await response.text();
            logger.error('demo login non-ok', {
                target,
                status: response.status,
                body: bodyText,
            });

            return fail(response.status, {
                message: `Demo sign-in failed (${response.status}). The demo account may not be seeded.`,
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

        throw redirect(303, '/dashboard');
    },
};
