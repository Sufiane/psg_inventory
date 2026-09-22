import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { FormattedMatch, MatchSale } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const { matchId } = event.params;

    const match = await api<FormattedMatch>(event, `/matches/${matchId}?withResult=true`);

    let sales: MatchSale[] = [];

    try {
        sales = await api<MatchSale[]>(event, `/sales/match/${matchId}`);
    } catch {
        // Sales API is down — page still renders with match data, just no sales table.
    }

    return { match, sales };
};
