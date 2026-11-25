import type { TicketCount } from '@psg/shared/counts';
import { sumTickets } from './sum-tickets.util';
import { passId } from '../test-support/sales.fixtures';

describe('sumTickets', () => {
    describe('when there are allocations', () => {
        it('sums nbTickets across them', () => {
            const total = sumTickets([
                { seasonPassId: passId, nbTickets: 2 as TicketCount },
                { seasonPassId: 'pass-2' as never, nbTickets: 3 as TicketCount },
            ]);

            expect(total).toBe(5);
        });
    });

    describe('when the list is empty', () => {
        it('returns 0', () => {
            expect(sumTickets([])).toBe(0);
        });
    });
});
