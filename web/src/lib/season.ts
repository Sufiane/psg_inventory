import type { SeasonYear } from '@psg/shared/time';

const AUGUST = 7;

// A season runs Aug 1 -> Jul 31 UTC; anything before August belongs to the previous start year.
// Uses UTC explicitly (not the browser's local timezone) so bucketing matches the backend,
// which runs in UTC — otherwise a kickoff near the Aug 1 boundary can land in different
// seasons on the client vs. the server.
export function seasonStartYearFromDate(date: Date): SeasonYear {
    return (
        date.getUTCMonth() < AUGUST ? date.getUTCFullYear() - 1 : date.getUTCFullYear()
    ) as SeasonYear;
}

export function seasonLabel(year: SeasonYear): string {
    return `${year}/${year + 1}`;
}

// The backend only accepts a 4-digit start year (`/^\d{4}$/`) on its season routes.
const SEASON_PARAM = /^\d{4}$/;
const RETAINED_PARAMS = ['venue', 'competition', 'status'] as const;
const SEASON_ONLY_PATHS = new Set(['/dashboard', '/matches', '/season']);
const SEASON_OR_ALL_PATHS = new Set(['/sales', '/accounting']);

export type SeasonScope = 'none' | 'season' | 'season-or-all';

export function parseSeasonParam(url: URL): SeasonYear | 'all' | null {
    const raw = url.searchParams.get('year');

    if (raw === 'all') {
        return 'all';
    }

    if (raw !== null && SEASON_PARAM.test(raw)) {
        return Number.parseInt(raw, 10) as SeasonYear;
    }

    return null;
}

export function parseSeasonYearParam(url: URL): SeasonYear | null {
    const parsed = parseSeasonParam(url);

    return parsed === 'all' ? null : parsed;
}

export function resolveSeason(
    url: URL,
    allowAll: boolean,
    now: Date = new Date(),
): SeasonYear | 'all' {
    const parsed = parseSeasonParam(url);

    if (parsed === 'all' && allowAll) {
        return 'all';
    }

    return parsed === null || parsed === 'all' ? seasonStartYearFromDate(now) : parsed;
}

export function resolveSeasonYear(url: URL, now: Date = new Date()): SeasonYear {
    return resolveSeason(url, false, now) as SeasonYear;
}

export function seasonScope(pathname: string): SeasonScope {
    const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

    if (SEASON_ONLY_PATHS.has(path)) {
        return 'season';
    }

    return SEASON_OR_ALL_PATHS.has(path) ? 'season-or-all' : 'none';
}

export function carrySeason(href: string, from: URL): string {
    const year = parseSeasonParam(from);

    if (year === null) {
        return href;
    }

    const [beforeHash, ...hashParts] = href.split('#');
    const [path, ...queryParts] = beforeHash.split('?');
    const scope = seasonScope(path);

    if (scope === 'none' || (year === 'all' && scope !== 'season-or-all')) {
        return href;
    }

    const params = new URLSearchParams(queryParts.join('?'));
    const hash = hashParts.length > 0 ? `#${hashParts.join('#')}` : '';

    params.set('year', String(year));

    return `${path}?${params.toString()}${hash}`;
}

export function retainedParams(url: URL): [string, string][] {
    const pairs: [string, string][] = [];

    for (const name of RETAINED_PARAMS) {
        const value = url.searchParams.get(name);

        if (value !== null) {
            pairs.push([name, value]);
        }
    }

    return pairs;
}

export function seasonChoices(
    now: Date,
    count: number,
    selected: SeasonYear | null,
): { year: SeasonYear; label: string }[] {
    const choices = seasonOptions(now, count);

    if (selected !== null && !choices.some((choice) => choice.year === selected)) {
        choices.push({ year: selected, label: seasonLabel(selected) });
    }

    return choices;
}

/**
 * `seasonLabel(seasonStartYearFromDate(...))` for a match date, handling the
 * "no match picked yet" case call sites already test for separately.
 */
export function seasonLabelFromDate(date: Date | string | null | undefined): string {
    if (date == null) {
        return '';
    }

    return seasonLabel(
        seasonStartYearFromDate(date instanceof Date ? date : new Date(date)),
    );
}

export function seasonOptions(
    now: Date,
    count: number,
): { year: SeasonYear; label: string }[] {
    const current = seasonStartYearFromDate(now);
    const options: { year: SeasonYear; label: string }[] = [];

    for (let i = 0; i < count; i++) {
        const year = (current - i) as SeasonYear;

        options.push({ year, label: seasonLabel(year) });
    }

    return options;
}
