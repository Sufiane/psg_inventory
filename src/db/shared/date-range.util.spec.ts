import { buildInclusiveDateRangeFilter } from './date-range.util';

describe('buildInclusiveDateRangeFilter', () => {
    describe('when no end date is given', () => {
        it('returns only a gte bound', () => {
            const from = new Date('2026-07-01');

            expect(buildInclusiveDateRangeFilter(from)).toEqual({
                gte: from,
            });
        });
    });

    describe('when an end date is given', () => {
        it('returns an inclusive gte/lte range', () => {
            const from = new Date('2026-07-01');
            const to = new Date('2027-06-30');

            expect(buildInclusiveDateRangeFilter(from, to)).toEqual({
                gte: from,
                lte: to,
            });
        });
    });
});
