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

    const [seasonPasses, passes] = await Promise.all([
        api<SeasonPass[]>(event, `/season-passes?season=${year}`),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);

    return { seasonPasses, passes, year };
};

function parsePayload(form: FormData): {
    payload: {
        price: number;
        label: string;
        category: string;
        row: string;
        seat: string;
    } | null;
    error?: string;
} {
    const priceRaw = form.get('price');
    const label = form.get('label');
    const category = form.get('category');
    const row = form.get('row');
    const seat = form.get('seat');

    if (typeof priceRaw !== 'string' || priceRaw.length === 0) {
        return { payload: null, error: 'Price is required.' };
    }

    const price = Number(priceRaw);

    if (!Number.isInteger(price) || price < 0) {
        return { payload: null, error: 'Price must be a non-negative integer.' };
    }

    if (typeof label !== 'string' || label.trim().length === 0) {
        return { payload: null, error: 'Label is required.' };
    }

    if (typeof category !== 'string' || category.trim().length === 0) {
        return { payload: null, error: 'Category is required.' };
    }

    if (typeof row !== 'string' || row.trim().length === 0) {
        return { payload: null, error: 'Row is required.' };
    }

    if (typeof seat !== 'string' || seat.trim().length === 0) {
        return { payload: null, error: 'Seat is required.' };
    }

    return {
        payload: {
            price,
            label: label.trim(),
            category: category.trim(),
            row: row.trim(),
            seat: seat.trim(),
        },
    };
}

export const actions: Actions = {
    create: async (event) => {
        const form = await event.request.formData();
        const yearRaw = form.get('seasonStartYear');

        if (typeof yearRaw !== 'string' || !/^\d{4}$/.test(yearRaw)) {
            return fail(400, { message: 'Season start year must be 4 digits.' });
        }

        const { payload, error } = parsePayload(form);

        if (!payload) {
            return fail(400, { message: error ?? 'Invalid payload.' });
        }

        try {
            await api(event, '/season-passes', {
                method: 'POST',
                json: { ...payload, seasonStartYear: Number(yearRaw) },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Save failed.';

            return fail(400, { message });
        }

        return { success: true, info: `Pass added to season ${yearRaw}.` };
    },

    update: async (event) => {
        const form = await event.request.formData();
        const passId = form.get('passId');

        if (typeof passId !== 'string' || passId.length === 0) {
            return fail(400, { message: 'Pass id is required.' });
        }

        const { payload, error } = parsePayload(form);

        if (!payload) {
            return fail(400, { message: error ?? 'Invalid payload.' });
        }

        try {
            await api(event, `/season-passes/${passId}`, {
                method: 'PUT',
                json: payload,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Save failed.';

            return fail(400, { message });
        }

        return { success: true, info: 'Pass updated.' };
    },

    remove: async (event) => {
        const form = await event.request.formData();
        const passId = form.get('passId');

        if (typeof passId !== 'string' || passId.length === 0) {
            return fail(400, { message: 'Pass id is required.' });
        }

        try {
            await api(event, `/season-passes/${passId}`, {
                method: 'DELETE',
                expectEmpty: true,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed.';

            return fail(400, { message });
        }

        return { success: true, info: 'Pass removed.' };
    },
};
