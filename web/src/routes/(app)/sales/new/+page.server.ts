import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { api } from '$lib/api';
import { parseAllocationsFromForm } from '$lib/sale-allocations';
import type { FormattedMatch, SeasonPass } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const [allMatches, passes] = await Promise.all([
        api<FormattedMatch[]>(event, '/matches/current-season'),
        api<SeasonPass[]>(event, '/season-passes'),
    ]);
    // Most recent fixtures first; users log sales close to the match date.
    const matches = [...allMatches].sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
    );
    const presetMatchId = event.url.searchParams.get('matchId');

    return { matches, presetMatchId, passes };
};

export const actions: Actions = {
    default: async (event) => {
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

        throw redirect(303, '/sales');
    },
};
