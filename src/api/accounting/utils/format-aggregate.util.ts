import type { SaleCount } from '@psg/shared/counts';
import { AggregatePayload } from '../types/aggregate-payload.type';
import { FormattedAggregate } from '../types/formatted-aggregate.type';

export function formatAggregate(payload: AggregatePayload): FormattedAggregate {
    return {
        totalSales: (payload.sum.listedPrice ?? 0) as unknown as SaleCount,
        totalProfit: payload.sum.profit ?? 0,
        totalInvest: payload.sum.invest ?? 0,
        totalNbTickets: payload.sum.nbTickets ?? 0,
        averageTicketPrice: payload.avg.listedPrice ?? 0,
        averageProfit: payload.avg.profit ?? 0,
        lowest: {
            profit: payload.min.profit ?? 0,
            price: payload.min.listedPrice ?? 0,
            nbTickets: payload.min.nbTickets,
            match: {
                opponent: payload.min.match.opponent,
                date: payload.min.match.date,
                atHome: payload.min.match.atHome,
                competition: payload.min.match.competition,
            },
        },
        highest: {
            profit: payload.max.profit ?? 0,
            price: payload.max.listedPrice ?? 0,
            nbTickets: payload.max.nbTickets,
            match: {
                opponent: payload.max.match.opponent,
                date: payload.max.match.date,
                atHome: payload.max.match.atHome,
                competition: payload.max.match.competition,
            },
        },
    };
}
