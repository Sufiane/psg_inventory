import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { Amortization, TimePeriodAccounting } from '$lib/types';

function currentSeasonStartYear(): number {
    const now = new Date();

    return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

export const load: PageServerLoad = (event) => {
    const view = event.url.searchParams.get('view') ?? 'current';
    const yearParam = event.url.searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : null;

    let path = '/accounting/current-season';
    let amortizationYear: number | null = currentSeasonStartYear();

    if (view === 'all-time') {
        path = '/accounting/all-time';
        amortizationYear = null;
    } else if (view === 'season' && year && Number.isFinite(year)) {
        path = `/accounting/season/${year}`;
        amortizationYear = year;
    }

    // Return the promises unawaited so SvelteKit streams them.
    // The page shell renders immediately; the cards show skeletons until the
    // backend responds.
    const accounting = api<TimePeriodAccounting>(event, path);
    const amortization: Promise<Amortization | null> =
        amortizationYear !== null
            ? api<Amortization>(event, `/accounting/amortization/${amortizationYear}`)
            : Promise.resolve(null);

    return { accounting, amortization, view, year };
};
