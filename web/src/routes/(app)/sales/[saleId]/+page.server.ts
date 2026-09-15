import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { passesForSale } from '$lib/sale-passes';
import { readPayload } from './read-payload';
import type { SaleDetail, SeasonPass } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const { saleId } = event.params;
    const [sale, passes] = await Promise.all([
        api<SaleDetail>(event, `/sales/${saleId}`),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);

    return { sale, passes: passesForSale(passes, sale) };
};

export const actions: Actions = {
    update: async (event) => {
        const { saleId } = event.params;
        const form = await event.request.formData();
        const { payload, error } = readPayload(form, saleId);

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
