import type { SeasonYear } from '@psg/shared/time';
import {
    getCurrentSeasonDate,
    getSeasonBucket,
    getSeasonWindow,
    seasonStartYearFromDate,
} from './season.utils';

describe('season.utils', () => {
    describe('getSeasonBucket', () => {
        it('buckets a date before August into the season that started last August', () => {
            expect(getSeasonBucket(new Date('2026-07-29T00:00:00.000Z'))).toEqual({
                start: new Date('2025-08-01T00:00:00.000Z'),
                end: new Date('2026-07-31T00:00:00.000Z'),
            });
        });

        it('buckets a date on or after August into the season starting this August', () => {
            expect(getSeasonBucket(new Date('2026-08-15T00:00:00.000Z'))).toEqual({
                start: new Date('2026-08-01T00:00:00.000Z'),
                end: new Date('2027-07-31T00:00:00.000Z'),
            });
        });

        it('treats August 1st itself as the start of the new season', () => {
            expect(getSeasonBucket(new Date('2026-08-01T00:00:00.000Z'))).toEqual({
                start: new Date('2026-08-01T00:00:00.000Z'),
                end: new Date('2027-07-31T00:00:00.000Z'),
            });
        });

        it('stays in the prior season just before the Aug 1 UTC boundary, regardless of process timezone', () => {
            // 23:00 UTC on Jul 31 is already Aug 1 in timezones ahead of UTC
            // (e.g. UTC+2) — this pins the bucket to UTC fields, not local ones.
            expect(getSeasonBucket(new Date('2026-07-31T23:00:00.000Z'))).toEqual({
                start: new Date('2025-08-01T00:00:00.000Z'),
                end: new Date('2026-07-31T00:00:00.000Z'),
            });
        });

        it('rolls into the new season just after the Aug 1 UTC boundary, regardless of process timezone', () => {
            // 01:00 UTC on Aug 1 is still Jul 31 in timezones behind UTC
            // (e.g. UTC-2) — this pins the bucket to UTC fields, not local ones.
            expect(getSeasonBucket(new Date('2026-08-01T01:00:00.000Z'))).toEqual({
                start: new Date('2026-08-01T00:00:00.000Z'),
                end: new Date('2027-07-31T00:00:00.000Z'),
            });
        });
    });

    describe('getCurrentSeasonDate', () => {
        it('buckets the current date the same way as getSeasonBucket', () => {
            jest.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));

            expect(getCurrentSeasonDate()).toEqual(
                getSeasonBucket(new Date('2026-07-29T00:00:00.000Z')),
            );

            jest.useRealTimers();
        });
    });

    describe('seasonStartYearFromDate', () => {
        it('buckets a date before August UTC into the season that started last August', () => {
            expect(seasonStartYearFromDate(new Date('2026-07-29T00:00:00.000Z'))).toBe(
                2025,
            );
        });

        it('buckets a date on or after August UTC into the season starting this August', () => {
            expect(seasonStartYearFromDate(new Date('2026-08-15T00:00:00.000Z'))).toBe(
                2026,
            );
        });

        it('classifies by UTC fields just before the Aug 1 boundary, regardless of process timezone', () => {
            // 23:00 UTC on Jul 31 is already Aug 1 in timezones ahead of UTC (e.g. UTC+2).
            expect(seasonStartYearFromDate(new Date('2026-07-31T23:00:00.000Z'))).toBe(
                2025,
            );
        });

        it('classifies by UTC fields just after the Aug 1 boundary, regardless of process timezone', () => {
            // 01:00 UTC on Aug 1 is still Jul 31 in timezones behind UTC (e.g. UTC-2).
            expect(seasonStartYearFromDate(new Date('2026-08-01T01:00:00.000Z'))).toBe(
                2026,
            );
        });
    });

    describe('getSeasonWindow', () => {
        describe("when end is 'inclusive'", () => {
            it('returns the Aug 1 -> Jul 31 UTC range for a season start year', () => {
                expect(getSeasonWindow(2026 as SeasonYear, 'inclusive')).toEqual({
                    start: new Date('2026-08-01T00:00:00.000Z'),
                    end: new Date('2027-07-31T00:00:00.000Z'),
                });
            });
        });

        describe("when end is 'exclusive'", () => {
            it('returns the Aug 1 -> next Aug 1 UTC range for a season start year', () => {
                expect(getSeasonWindow(2026 as SeasonYear, 'exclusive')).toEqual({
                    start: new Date('2026-08-01T00:00:00.000Z'),
                    end: new Date('2027-08-01T00:00:00.000Z'),
                });
            });

            it("lines up with the next season's inclusive start, so lt/gte queries don't overlap or gap", () => {
                expect(getSeasonWindow(2026 as SeasonYear, 'exclusive').end).toEqual(
                    getSeasonWindow(2027 as SeasonYear, 'inclusive').start,
                );
            });
        });
    });
});
