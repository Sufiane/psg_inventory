import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { JWT_COOKIE } from '$lib/api';
import { backendUrl } from '$lib/env';
import { decodeJwt } from '$lib/jwt';
import { Logger } from '$lib/logger';
import type { LoginResponse, TimePeriodAccounting } from '$lib/types';

const logger = new Logger('HomeDemoAction');

const DEMO_ACCOUNTS = {
    demo1: { email: 'demo1@psg.fr', password: 'demo1234' },
    demo2: { email: 'demo2@psg.fr', password: 'demo1234' },
} as const;

type DemoKey = keyof typeof DEMO_ACCOUNTS;

export type DemoStatus =
    | { kind: 'ok' }
    | { kind: 'backend-down'; reason: string }
    | { kind: 'db-down' };

export type Showcase = {
    netProfit: number;
    realizedProceeds: number;
    realizedInvest: number;
    seasonInvest: number;
    soldCount: number;
    seasonStartYear: number | null;
    fetchedAt: number;
};

const HEALTH_PROBE_TIMEOUT_MS = 1500;
const SHOWCASE_PROBE_TIMEOUT_MS = 2500;
const SHOWCASE_CACHE_MS = 60_000;

let showcaseCache: { value: Showcase | null; expiresAt: number } | null = null;

async function probeDemoStatus(
    event: Parameters<PageServerLoad>[0],
): Promise<DemoStatus> {
    const target = `${backendUrl(event)}/health?db=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);

    try {
        const response = await event.fetch(target, { signal: controller.signal });

        if (!response.ok) {
            return { kind: 'backend-down', reason: `health ${response.status}` };
        }

        const body = (await response.json()) as { status?: string; db?: string };

        if (body.db && body.db !== 'ok') {
            return { kind: 'db-down' };
        }

        return { kind: 'ok' };
    } catch (err) {
        return {
            kind: 'backend-down',
            reason: err instanceof Error ? err.message : String(err),
        };
    } finally {
        clearTimeout(timer);
    }
}

async function fetchShowcase(
    event: Parameters<PageServerLoad>[0],
): Promise<Showcase | null> {
    const now = Date.now();

    if (showcaseCache && showcaseCache.expiresAt > now) {
        return showcaseCache.value;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SHOWCASE_PROBE_TIMEOUT_MS);
    const base = backendUrl(event);

    try {
        const loginResponse = await event.fetch(`${base}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(DEMO_ACCOUNTS.demo1),
            signal: controller.signal,
        });

        if (!loginResponse.ok) {
            return cacheShowcase(null, now);
        }

        const { token } = (await loginResponse.json()) as LoginResponse;

        const accountingResponse = await event.fetch(
            `${base}/accounting/current-season`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            },
        );

        if (!accountingResponse.ok) {
            return cacheShowcase(null, now);
        }

        const accounting = (await accountingResponse.json()) as TimePeriodAccounting;
        const realizedProceeds = accounting.realized?.totalProfit ?? 0;
        const realizedInvest = accounting.realized?.totalInvest ?? 0;
        const seasonInvest = accounting.totalSeasonInvestment;
        const netProfit = realizedProceeds - realizedInvest - seasonInvest;
        const soldCount = accounting.realized?.totalSales ?? 0;
        const seasonStartYear = accounting.seasonInvestments[0]?.seasonStartYear ?? null;

        return cacheShowcase(
            {
                netProfit,
                realizedProceeds,
                realizedInvest,
                seasonInvest,
                soldCount,
                seasonStartYear,
                fetchedAt: now,
            },
            now,
        );
    } catch (err) {
        logger.error('showcase fetch failed', {
            error: err instanceof Error ? err.message : String(err),
        });

        return cacheShowcase(null, now);
    } finally {
        clearTimeout(timer);
    }
}

function cacheShowcase(value: Showcase | null, now: number): Showcase | null {
    showcaseCache = { value, expiresAt: now + SHOWCASE_CACHE_MS };

    return value;
}

export const load: PageServerLoad = async (event) => {
    if (event.locals.user) {
        throw redirect(303, '/dashboard');
    }

    const demoStatus = await probeDemoStatus(event);
    const showcase = demoStatus.kind === 'ok' ? await fetchShowcase(event) : null;

    return { demoAccounts: DEMO_ACCOUNTS, demoStatus, showcase };
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
