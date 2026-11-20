import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type { Amortization, TimePeriodAccounting } from '$lib/types';
import { seasonStartYearFromDate } from '$lib/season';
import { resolveAccountingScope } from './accounting-scope';

export const load: PageServerLoad = (event) => {
    const scope = resolveAccountingScope(event.url);
    let path = '/accounting/current-season';
    let amortizationYear: number | null = seasonStartYearFromDate(new Date());

    if (scope.view === 'all-time') {
        path = '/accounting/all-time';
        amortizationYear = null;
    } else if (scope.view === 'season') {
        path = `/accounting/season/${scope.year}`;
        amortizationYear = scope.year;
    }

    // Return the promises unawaited so SvelteKit streams them.
    // The page shell renders immediately; the cards show skeletons until the
    // backend responds.
    const accounting = api<TimePeriodAccounting>(event, path);
    const amortization: Promise<Amortization | null> =
        amortizationYear !== null
            ? api<Amortization>(event, `/accounting/amortization/${amortizationYear}`)
            : Promise.resolve(null);

    return { accounting, amortization, view: scope.view, year: scope.year };
};
