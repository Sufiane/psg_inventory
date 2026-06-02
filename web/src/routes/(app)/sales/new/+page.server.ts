import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { FormattedMatch } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const matches = await api<FormattedMatch[]>(event, '/matches/current-season');
    const presetMatchId = event.url.searchParams.get('matchId');

    return { matches, presetMatchId };
};

export const actions: Actions = {
    default: async (event) => {
        const form = await event.request.formData();
        const matchId = form.get('matchId');
        const nbTickets = Number(form.get('nbTickets'));
        const listedPrice = Number(form.get('listedPrice'));
        const investRaw = form.get('invest');
        const invest =
            investRaw !== null && investRaw !== '' ? Number(investRaw) : undefined;

        if (typeof matchId !== 'string' || matchId.length === 0) {
            return fail(400, { message: 'Match is required.' });
        }

        if (!Number.isInteger(nbTickets) || nbTickets < 1) {
            return fail(400, { message: 'Tickets must be at least 1.' });
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
                    nbTickets,
                    listedPrice,
                    ...(invest !== undefined ? { invest } : {}),
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create sale.';

            return fail(400, { message });
        }

        throw redirect(303, '/sales');
    },
};
