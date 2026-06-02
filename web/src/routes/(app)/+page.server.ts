import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { FormattedMatch, TimePeriodAccounting } from '$lib/types';

export const load: PageServerLoad = (event) => {
    // Streamed: both fly to the client independently and the page shell
    // renders immediately with skeletons in their slots.
    const accounting = api<TimePeriodAccounting>(event, '/accounting/current-season');
    const matches = api<FormattedMatch[]>(
        event,
        '/matches/current-season?withResult=true',
    );

    return { accounting, matches };
};
