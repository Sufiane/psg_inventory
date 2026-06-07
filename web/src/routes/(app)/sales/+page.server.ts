import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import type { FormattedMatch, SaleDetail, SaleListItem, SeasonPass } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;
    const editId = event.url.searchParams.get('edit');
    const isNew = event.url.searchParams.get('new') !== null;
    const path =
        year && Number.isFinite(year) ? `/sales/season/${year}` : '/sales/current-season';

    const sales = await api<SaleListItem[]>(event, path);

    let editSale: SaleDetail | null = null;

    if (editId && !isNew) {
        try {
            editSale = await api<SaleDetail>(event, `/sales/${editId}`);
        } catch {
            editSale = null;
        }
    }

    let matches: FormattedMatch[] = [];
    let passes: SeasonPass[] = [];

    if ((isNew && !editId) || editSale != null) {
        passes = await api<SeasonPass[]>(event, '/season-passes');
    }

    if (isNew && !editId) {
        const allMatches = await api<FormattedMatch[]>(event, '/matches/current-season');

        // Most recent first: latest fixture date at the top. User typically
        // logs a sale right after listing tickets, which is rarely for a match
        // months away; sorting desc surfaces today's / upcoming fixtures first
        // and pushes long-tail past fixtures to the bottom.
        matches = [...allMatches].sort(
            (left, right) =>
                new Date(right.date).getTime() - new Date(left.date).getTime(),
        );
    }

    return { sales, year, editSale, matches, isNew, passes };
};

function readPayload(form: FormData): {
    payload?: Record<string, unknown>;
    error?: string;
} {
    const saleId = form.get('saleId');

    if (typeof saleId !== 'string' || saleId.length === 0) {
        return { error: 'Missing sale id.' };
    }

    const sold = form.get('sold') === 'on' || form.get('sold') === 'true';
    const payload: Record<string, unknown> = { saleId, sold };

    const allocations = parseAllocationsFromForm(form);

    if (allocations.length > 0) {
        payload.allocations = allocations;
    }

    const listedPriceRaw = form.get('listedPrice');

    if (typeof listedPriceRaw === 'string' && listedPriceRaw.length > 0) {
        const value = Number(listedPriceRaw);

        if (!Number.isFinite(value) || value < 1) {
            return { error: 'Listed price must be at least 1.' };
        }

        payload.listedPrice = value;
    }

    const investRaw = form.get('invest');

    if (typeof investRaw === 'string' && investRaw.length > 0) {
        const value = Number(investRaw);

        if (!Number.isFinite(value) || value < 0) {
            return { error: 'Invest must be 0 or more.' };
        }

        payload.invest = value;
    }

    return { payload };
}

export const actions: Actions = {
    update: async (event) => {
        const form = await event.request.formData();
        const { payload, error } = readPayload(form);

        if (error || !payload) {
            return fail(400, { message: error ?? 'Invalid form.' });
        }

        try {
            await api(event, '/sales/update', {
                method: 'POST',
                json: payload,
                expectEmpty: true,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Update failed.';

            return fail(400, { message });
        }

        const yearParam = event.url.searchParams.get('year');
        const redirectTarget = yearParam ? `/sales?year=${yearParam}` : '/sales';

        throw redirect(303, redirectTarget);
    },

    delete: async (event) => {
        const form = await event.request.formData();
        const saleId = form.get('saleId');

        if (typeof saleId !== 'string' || saleId.length === 0) {
            return fail(400, { message: 'Missing sale id.' });
        }

        try {
            await api(event, `/sales/${saleId}`, { method: 'DELETE', expectEmpty: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed.';

            return fail(400, { message });
        }

        const yearParam = event.url.searchParams.get('year');
        const redirectTarget = yearParam ? `/sales?year=${yearParam}` : '/sales';

        throw redirect(303, redirectTarget);
    },

    create: async (event) => {
        const form = await event.request.formData();
        const matchId = form.get('matchId');
        const listedPrice = Number(form.get('listedPrice'));
        const investRaw = form.get('invest');
        const invest =
            investRaw !== null && investRaw !== '' ? Number(investRaw) : undefined;
        const allocations = parseAllocationsFromForm(form);

        if (typeof matchId !== 'string' || matchId.length === 0) {
            return fail(400, { message: 'Match is required.' });
        }

        if (allocations.length === 0) {
            return fail(400, {
                message: 'Pick at least one pass and how many tickets it contributes.',
            });
        }

        if (!Number.isFinite(listedPrice) || listedPrice < 1) {
            return fail(400, { message: 'Listed price must be at least 1.' });
        }

        if (invest !== undefined && (!Number.isFinite(invest) || invest < 0)) {
            return fail(400, { message: 'Invest must be 0 or more.' });
        }

        try {
            await api<{ id: string }>(event, '/sales', {
                method: 'POST',
                json: {
                    matchId,
                    allocations,
                    listedPrice,
                    ...(invest !== undefined ? { invest } : {}),
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create sale.';

            return fail(400, { message });
        }

        const yearParam = event.url.searchParams.get('year');
        const redirectTarget = yearParam ? `/sales?year=${yearParam}` : '/sales';

        throw redirect(303, redirectTarget);
    },
};
