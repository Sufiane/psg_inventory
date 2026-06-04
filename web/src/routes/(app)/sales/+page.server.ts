import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { SaleDetail, SaleListItem } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;
    const editId = event.url.searchParams.get('edit');
    const path =
        year && Number.isFinite(year) ? `/sales/season/${year}` : '/sales/current-season';

    const sales = await api<SaleListItem[]>(event, path);

    let editSale: SaleDetail | null = null;

    if (editId) {
        try {
            editSale = await api<SaleDetail>(event, `/sales/${editId}`);
        } catch {
            editSale = null;
        }
    }

    return { sales, year, editSale };
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

    const nbTicketsRaw = form.get('nbTickets');

    if (typeof nbTicketsRaw === 'string' && nbTicketsRaw.length > 0) {
        const value = Number(nbTicketsRaw);

        if (!Number.isInteger(value) || value < 1) {
            return { error: 'Tickets must be at least 1.' };
        }

        payload.nbTickets = value;
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
};
