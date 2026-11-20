import type { SeasonYear } from '@psg/shared/time';
import { parseSeasonParam } from '$lib/season';

export type AccountingScope = {
    view: 'current' | 'all-time' | 'season';
    year: SeasonYear | null;
};

export function resolveAccountingScope(url: URL): AccountingScope {
    const year = parseSeasonParam(url);

    if (year === 'all') {
        return { view: 'all-time', year: null };
    }

    if (year !== null) {
        return { view: 'season', year };
    }

    if (url.searchParams.get('view') === 'all-time') {
        return { view: 'all-time', year: null };
    }

    return { view: 'current', year: null };
}
