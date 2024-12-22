import { formatAggregate } from './format-aggregate.util';

describe('formatAggregate', () => {
    it('return a formatted aggregate', () => {
        const payload = {
            sum: {
                listedPrice: 1,
                profit: 1,
                invest: 1,
                nbTickets: 1,
            },
            avg: {
                listedPrice: 1,
                profit: 1,
            },
            min: {
                profit: 1,
                listedPrice: 1,
                nbTickets: 1,
                match: {
                    opponent: 'opponent',
                    date: new Date(),
                    atHome: false,
                    competition: 'competition',
                },
            },
            max: {
                profit: 1,
                listedPrice: 1,
                nbTickets: 1,
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
                nbTickets: payload.min.nbTickets,
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
