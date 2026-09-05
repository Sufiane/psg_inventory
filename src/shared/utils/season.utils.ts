import type { SeasonYear } from '@psg/shared/time';

const SEASON_START_MONTH = 7;

// A season runs Aug 1 -> Jul 31 UTC; anything before August belongs to the
// previous start year. All season boundaries in the backend must be built
// from UTC fields — mixing this with a local-time `new Date(year, month, day)`
// construction lets a match near the Aug 1 boundary be classified into one
// season but excluded from that season's query range on a non-UTC host.
export function seasonStartYearFromDate(date: Date): SeasonYear {
    return (
        date.getUTCMonth() < SEASON_START_MONTH
            ? date.getUTCFullYear() - 1
            : date.getUTCFullYear()
    ) as SeasonYear;
}

// Aug 1 UTC start of the given season through to its end, in either shape a
// caller's query needs:
// - 'inclusive': end = Jul 31 00:00 UTC, for callers filtering `date <= end`
//   (e.g. Prisma `lte`).
// - 'exclusive': end = the following Aug 1 00:00 UTC, for callers filtering
//   `date < end` (e.g. Prisma `lt`). Use this whenever the same query result
//   set is ever compared against the next season's `gte` start, so a match at
//   exactly Aug 1 00:00:00.000 UTC lands in one season, not both.
export function getSeasonWindow(
    seasonStartYear: SeasonYear,
    end: 'inclusive' | 'exclusive',
): { start: Date; end: Date } {
    const start = new Date(Date.UTC(seasonStartYear, SEASON_START_MONTH, 1));
    const boundary =
        end === 'inclusive'
            ? new Date(Date.UTC(seasonStartYear + 1, SEASON_START_MONTH - 1, 31))
            : new Date(Date.UTC(seasonStartYear + 1, SEASON_START_MONTH, 1));

    return { start, end: boundary };
}

export function getSeasonBucket(referenceDate: Date): { start: Date; end: Date } {
    return getSeasonWindow(seasonStartYearFromDate(referenceDate), 'inclusive');
}

export function getCurrentSeasonDate(): { start: Date; end: Date } {
    return getSeasonBucket(new Date());
}
