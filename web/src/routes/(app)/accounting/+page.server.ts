import type { PageServerLoad } from './$types';
import { api } from '$lib/api';
import type {
    Amortization,
    FormattedMatch,
    SaleListItem,
    TimePeriodAccounting,
} from '$lib/types';
import type { SeasonYear } from '@psg/shared/time';
import { seasonStartYearFromDate } from '$lib/season';
import { resolveAccountingScope } from './accounting-scope';

export const load: PageServerLoad = (event) => {
    const scope = resolveAccountingScope(event.url);
    const currentYear = seasonStartYearFromDate(new Date());
    const season: SeasonYear | 'all' =
        scope.view === 'all-time' ? 'all' : (scope.year ?? currentYear);

    if (season === 'all') {
        return {
            accounting: api<TimePeriodAccounting>(event, '/accounting/all-time'),
            seasonView: Promise.resolve({ amortization: null, matches: [], sales: [] }),
            season,
        };
    }

    const isCurrent = season === currentYear;
    const accountingPath = isCurrent
        ? '/accounting/current-season'
        : `/accounting/season/${season}`;
    const matchesPath = isCurrent
        ? '/matches/current-season'
        : `/matches/season/${season}`;
    const salesPath = isCurrent ? '/sales/current-season' : `/sales/season/${season}`;

    return {
        accounting: api<TimePeriodAccounting>(event, accountingPath),
        seasonView: Promise.all([
            api<Amortization | null>(event, `/accounting/amortization/${season}`),
            api<FormattedMatch[]>(event, matchesPath),
            api<SaleListItem[]>(event, salesPath),
        ]).then(([amortization, matches, sales]) => ({ amortization, matches, sales })),
        season,
    };
};
