import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { FormattedMatch, TimePeriodAccounting } from '$lib/types';

export const load: PageServerLoad = async (event) => {
    const [accounting, matches] = await Promise.all([
        api<TimePeriodAccounting>(event, '/accounting/current-season'),
        api<FormattedMatch[]>(event, '/matches/current-season?withResult=true'),
    ]);

    return { accounting, matches };
};
