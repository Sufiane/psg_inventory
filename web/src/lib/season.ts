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

/**
 * Reads and sanitizes the `?year=` query param, shared by every page that
 * accepts a season-start-year filter. `?year=` is a seasonStartYear, and the
 * backend only accepts a 4-digit one (`/^\d{4}$/`) — `Number.isFinite` alone
 * lets 0 (and other non-4-digit values) through, which 404s against
 * `/matches/season/:year` and `/sales/season/:year`. Returns `null` (fall
 * back to current-season) for anything missing, non-numeric, or outside the
 * 4-digit range.
 */
export function parseSeasonYearParam(url: URL): SeasonYear | null {
    const yearParam = url.searchParams.get('year');
    const parsed = yearParam ? Number.parseInt(yearParam, 10) : null;

    return parsed !== null && Number.isFinite(parsed) && parsed > 999 && parsed < 10000
        ? (parsed as SeasonYear)
        : null;
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
