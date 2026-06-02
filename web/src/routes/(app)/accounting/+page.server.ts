import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { TimePeriodAccounting } from '$lib/types';

export const load: PageServerLoad = (event) => {
    const view = event.url.searchParams.get('view') ?? 'current';
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;

    let path = '/accounting/current-season';

    if (view === 'all-time') {
        path = '/accounting/all-time';
    } else if (view === 'season' && year && Number.isFinite(year)) {
        path = `/accounting/season/${year}`;
    }

    // Return the promise unawaited so SvelteKit streams it.
    // The page shell renders immediately; the cards show skeletons until the
    // backend responds.
    const accounting = api<TimePeriodAccounting>(event, path);

    return { accounting, view, year };
};
