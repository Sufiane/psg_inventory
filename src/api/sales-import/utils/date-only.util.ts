export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// A date-only string (YYYY-MM-DD) has no time-of-day. Anchoring it at noon
// UTC keeps the same calendar date across every real-world timezone offset
// (only offsets beyond UTC+12/-12 could shift it, and none of ours go that
// far) — anchoring at midnight would roll back a day in negative offsets.
export function dateOnlyToUtcNoon(value: string): Date {
    return new Date(`${value}T12:00:00.000Z`);
}
