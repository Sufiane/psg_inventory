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
