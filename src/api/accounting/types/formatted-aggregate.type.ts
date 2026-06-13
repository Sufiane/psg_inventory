import type { SaleCount, TicketCount } from '@psg/shared';

export type FormattedAggregate = {
    totalSales: SaleCount;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: TicketCount;
    averageTicketPrice: number;
    averageProfit: number;
    lowest: {
        profit: number;
        price: number;
        nbTickets: TicketCount;
        match: {
            opponent: string;
            date: Date;
            atHome: boolean;
            competition: string;
        };
    };
    highest: {
        profit: number;
        price: number;
        nbTickets: TicketCount;
        match: {
            opponent: string;
            date: Date;
            atHome: boolean;
            competition: string;
        };
    };
};
