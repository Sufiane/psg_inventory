import { getCurrentSeasonDate, getSeasonBucket } from './season.utils';

describe('season.utils', () => {
    describe('getSeasonBucket', () => {
        it('buckets a date before August into the season that started last August', () => {
            expect(getSeasonBucket(new Date(2026, 6, 29))).toEqual({
                start: new Date(2025, 7, 1),
                end: new Date(2026, 6, 31),
            });
        });

        it('buckets a date on or after August into the season starting this August', () => {
            expect(getSeasonBucket(new Date(2026, 7, 15))).toEqual({
                start: new Date(2026, 7, 1),
                end: new Date(2027, 6, 31),
            });
        });

        it('treats August 1st itself as the start of the new season', () => {
            expect(getSeasonBucket(new Date(2026, 7, 1))).toEqual({
                start: new Date(2026, 7, 1),
                end: new Date(2027, 6, 31),
            });
        });
    });

    describe('getCurrentSeasonDate', () => {
        it('buckets the current date the same way as getSeasonBucket', () => {
            jest.useFakeTimers().setSystemTime(new Date(2026, 6, 29));

            expect(getCurrentSeasonDate()).toEqual(
                getSeasonBucket(new Date(2026, 6, 29)),
            );

            jest.useRealTimers();
        });
    });
});
