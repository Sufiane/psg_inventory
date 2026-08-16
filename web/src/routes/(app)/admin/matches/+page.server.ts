import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { COMPETITIONS, type Competition, type CacheFlushResult } from '$lib/types';

export const load: PageServerLoad = () => {
    return { competitions: COMPETITIONS };
};

export const actions: Actions = {
    loadCurrent: async (event) => {
        try {
            await api(event, '/admin/matches/load/current-season', {
                method: 'POST',
                expectEmpty: true,
            });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Failed to load matches.';

            return fail(400, { message });
        }

        return { success: true, info: 'Current season matches loaded.' };
    },

    loadSeason: async (event) => {
        const form = await event.request.formData();
        const yearRaw = form.get('year');

        if (typeof yearRaw !== 'string' || yearRaw.length === 0) {
            return fail(400, { message: 'Season year is required.' });
        }

        const year = Number.parseInt(yearRaw, 10);

        if (!Number.isFinite(year)) {
            return fail(400, { message: 'Season year must be a number.' });
        }

        try {
            await api(event, `/admin/matches/load/${year}`, {
                method: 'POST',
                expectEmpty: true,
            });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Failed to load matches.';

            return fail(400, { message });
        }

        return { success: true, info: `Season ${year} matches loaded.` };
    },

    create: async (event) => {
        const form = await event.request.formData();
        const opponent = form.get('opponent');
        const date = form.get('date');
        const atHome = form.get('atHome') === 'on' || form.get('atHome') === 'true';
        const competition = form.get('competition');
        const score = form.get('score');
        const isWinRaw = form.get('isWin');

        if (typeof opponent !== 'string' || opponent.length === 0) {
            return fail(400, { message: 'Opponent is required.' });
        }

        if (typeof date !== 'string' || date.length === 0) {
            return fail(400, { message: 'Date is required.' });
        }

        if (
            typeof competition !== 'string' ||
            !COMPETITIONS.includes(competition as Competition)
        ) {
            return fail(400, { message: 'Valid competition is required.' });
        }

        const iso = new Date(date).toISOString();

        const payload: Record<string, unknown> = {
            opponent,
            date: iso,
            atHome,
            competition,
        };

        if (typeof score === 'string' && score.length > 0) {
            if (!/^\d{1,2} - \d{1,2}$/.test(score)) {
                return fail(400, { message: 'Score must match "X - Y" format.' });
            }

            payload.result = { isWin: isWinRaw === 'on' || isWinRaw === 'true', score };
        }

        try {
            await api(event, '/admin/matches', {
                method: 'POST',
                json: payload,
                expectEmpty: true,
            });
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Failed to create match.';

            return fail(400, { message });
        }

        return { success: true, info: `Match vs ${opponent} created.` };
    },

    cancelStaleSales: async (event) => {
        try {
            await api(event, '/cron/cancel-sales', {
                method: 'POST',
                expectEmpty: true,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to run cron.';

            return fail(400, { message });
        }

        return { success: true, info: 'Stale unrealized sales cancelled.' };
    },

    flushUserCache: async (event) => {
        const form = await event.request.formData();
        const email = form.get('email');

        if (typeof email !== 'string' || email.length === 0) {
            return fail(400, { message: 'Email is required.' });
        }

        let results: CacheFlushResult[];

        try {
            results = await api<CacheFlushResult[]>(event, '/admin/users/cache/flush', {
                method: 'POST',
                json: { email },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to flush cache.';

            return fail(400, { message });
        }

        const failedKeys = results
            .filter((result) => result.status === 'failed')
            .map((result) => result.key);

        // `success`/`info`/`message` only matter when JS never hydrates and
        // use:enhance never runs, so the client-side toast handler ignores
        // them. Any failure is surfaced as the negative banner (`message`),
        // not glossed as a partial success.
        if (failedKeys.length > 0) {
            const message =
                failedKeys.length === results.length
                    ? `Cache flush failed for ${email} (${failedKeys.join(', ')}).`
                    : `Cache flushed for ${email}, but ${failedKeys.join(', ')} failed.`;

            return { email, failedKeys, total: results.length, message };
        }

        return {
            success: true,
            email,
            failedKeys,
            total: results.length,
            info: `Cache flushed for ${email}.`,
        };
    },
};
