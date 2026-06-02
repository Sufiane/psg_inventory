import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { SeasonPass } from '$lib/types';

function currentSeasonStartYear(): number {
    const now = new Date();

    return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const parsed = yearParam ? Number.parseInt(yearParam, 10) : null;
    const year = parsed && Number.isFinite(parsed) ? parsed : currentSeasonStartYear();

    const [pass, passes] = await Promise.all([
        api<SeasonPass | null>(event, `/season-passes/season/${year}`),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);

    return { pass, passes, year };
};

export const actions: Actions = {
    upsert: async (event) => {
        const form = await event.request.formData();
        const yearRaw = form.get('seasonStartYear');
        const priceRaw = form.get('price');
        const category = form.get('category');
        const row = form.get('row');
        const seat = form.get('seat');

        if (typeof yearRaw !== 'string' || !/^\d{4}$/.test(yearRaw)) {
            return fail(400, { message: 'Season start year must be 4 digits.' });
        }

        if (typeof priceRaw !== 'string' || priceRaw.length === 0) {
            return fail(400, { message: 'Price is required.' });
        }

        const price = Number(priceRaw);

        if (!Number.isInteger(price) || price < 0) {
            return fail(400, { message: 'Price must be a non-negative integer.' });
        }

        const payload: Record<string, unknown> = { price };

        if (typeof category === 'string' && category.length > 0) {
            payload.category = category;
        }

        if (typeof row === 'string' && row.length > 0) {
            payload.row = row;
        }

        if (typeof seat === 'string' && seat.length > 0) {
            payload.seat = seat;
        }

        try {
            await api(event, `/season-passes/season/${yearRaw}`, {
                method: 'PUT',
                json: payload,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Save failed.';

            return fail(400, { message });
        }

        return { success: true, info: `Season ${yearRaw} pass saved.` };
    },

    remove: async (event) => {
        const form = await event.request.formData();
        const yearRaw = form.get('seasonStartYear');

        if (typeof yearRaw !== 'string' || !/^\d{4}$/.test(yearRaw)) {
            return fail(400, { message: 'Season start year must be 4 digits.' });
        }

        try {
            await api(event, `/season-passes/season/${yearRaw}`, {
                method: 'DELETE',
                expectEmpty: true,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed.';

            return fail(400, { message });
        }

        return { success: true, info: `Season ${yearRaw} pass removed.` };
    },
};
