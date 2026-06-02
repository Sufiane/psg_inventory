import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { FormattedMatch } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;
    const path =
        year && Number.isFinite(year)
            ? `/matches/season/${year}?withResult=true`
            : '/matches/current-season?withResult=true';

    const matches = await api<FormattedMatch[]>(event, path);

    return { matches, year };
};
