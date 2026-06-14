import type { TicketCount } from '@psg/shared/counts';
import type {
    AvgProfit,
    AvgTicketPrice,
    Invest,
    ListedPrice,
    Profit,
} from '@psg/shared/money';
import { AggregatePayload } from '../types/aggregate-payload.type';
import { formatAggregate } from './format-aggregate.util';

describe('formatAggregate', () => {
    it('return a formatted aggregate', () => {
        const payload: AggregatePayload = {
            sum: {
                listedPrice: 1 as ListedPrice,
                profit: 1 as Profit,
                invest: 1 as Invest,
                nbTickets: 1 as TicketCount,
            },
            avg: {
                listedPrice: 1 as AvgTicketPrice,
                profit: 1 as AvgProfit,
            },
            min: {
                profit: 1 as Profit,
                listedPrice: 1 as ListedPrice,
                nbTickets: 1 as TicketCount,
                match: {
                    opponent: 'opponent',
                    date: new Date(),
                    atHome: false,
                    competition: 'competition',
                },
            },
            max: {
                profit: 1 as Profit,
                listedPrice: 1 as ListedPrice,
                nbTickets: 1 as TicketCount,
                match: {
                    opponent: 'opponent',
                    date: new Date(),
                    atHome: false,
                    competition: 'competition',
                },
            },
        };

        const expected = {
            totalSales: payload.sum.listedPrice,
            totalProfit: payload.sum.profit,
            totalInvest: payload.sum.invest,
            totalNbTickets: payload.sum.nbTickets,
            averageTicketPrice: payload.avg.listedPrice,
            averageProfit: payload.avg.profit,
            lowest: {
                profit: payload.min.profit,
                price: payload.min.listedPrice,
                nbTickets: payload.min.nbTickets,
                match: {
                    opponent: payload.min.match.opponent,
                    date: payload.min.match.date,
                    atHome: payload.min.match.atHome,
                    competition: payload.min.match.competition,
                },
            },
            highest: {
                profit: payload.max.profit,
                price: payload.max.listedPrice,
                nbTickets: payload.max.nbTickets,
                match: {
                    opponent: payload.max.match.opponent,
                    date: payload.max.match.date,
                    atHome: payload.max.match.atHome,
                    competition: payload.max.match.competition,
                },
            },
        };

        expect(formatAggregate(payload)).toEqual(expected);
    });
});
