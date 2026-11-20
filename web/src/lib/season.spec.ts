import { describe, expect, it } from 'vitest';
import { seasonOptions } from './season';

describe('seasonOptions', () => {
    describe('when now is in November 2026', () => {
        it('starts at 2026/2027', () => {
            const options = seasonOptions(new Date('2026-11-20T12:00:00Z'), 3);

            expect(options[0]).toEqual({ year: 2026, label: '2026/2027' });
        });

        it('lists seasons newest first', () => {
            const options = seasonOptions(new Date('2026-11-20T12:00:00Z'), 3);

            expect(options.map((option) => option.label)).toEqual([
                '2026/2027',
                '2025/2026',
                '2024/2025',
            ]);
        });
    });

    describe('when now is in March 2027', () => {
        it('starts at the season that began in 2026', () => {
            const options = seasonOptions(new Date('2027-03-10T12:00:00Z'), 2);

            expect(options[0].year).toBe(2026);
        });
    });

    describe('when count is 1', () => {
        it('returns a single option', () => {
            expect(seasonOptions(new Date('2026-11-20T12:00:00Z'), 1)).toHaveLength(1);
        });
    });

    describe('when count is 0', () => {
        it('returns no options', () => {
            expect(seasonOptions(new Date('2026-11-20T12:00:00Z'), 0)).toEqual([]);
        });
    });
});
