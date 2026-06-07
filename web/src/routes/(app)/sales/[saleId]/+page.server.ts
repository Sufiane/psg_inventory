import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import type { SaleDetail, SeasonPass } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const { saleId } = event.params;
    const [sale, passes] = await Promise.all([
        api<SaleDetail>(event, `/sales/${saleId}`),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);

    return { sale, passes };
};

export const actions: Actions = {
    update: async (event) => {
        const { saleId } = event.params;
        const form = await event.request.formData();
        const sold = form.get('sold') === 'on' || form.get('sold') === 'true';
        const listedPriceRaw = form.get('listedPrice');
        const investRaw = form.get('invest');

        const payload: Record<string, unknown> = { saleId, sold };

        const allocations = parseAllocationsFromForm(form);

        if (allocations.length > 0) {
            payload.allocations = allocations;
        }

        if (typeof listedPriceRaw === 'string' && listedPriceRaw.length > 0) {
            const value = Number(listedPriceRaw);

            if (!Number.isFinite(value) || value < 1) {
                return fail(400, { message: 'Listed price must be at least 1.' });
            }

            payload.listedPrice = value;
        }

        if (typeof investRaw === 'string' && investRaw.length > 0) {
            const value = Number(investRaw);

            if (!Number.isFinite(value) || value < 0) {
                return fail(400, { message: 'Invest must be 0 or more.' });
            }

            payload.invest = value;
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

        throw redirect(303, '/sales');
    },

    delete: async (event) => {
        const { saleId } = event.params;

        try {
            await api(event, `/sales/${saleId}`, { method: 'DELETE', expectEmpty: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed.';

            return fail(400, { message });
        }

        throw redirect(303, '/sales');
    },
};
