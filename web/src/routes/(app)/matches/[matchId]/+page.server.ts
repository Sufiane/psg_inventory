import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { FormattedMatch } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const { matchId } = event.params;
    const match = await api<FormattedMatch>(event, `/matches/${matchId}?withResult=true`);

    return { match };
};
