import type { SaleCount, TicketCount } from '@psg/shared';

export type Accounting = {
    totalSales: SaleCount;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: TicketCount;
    averageTicketPrice: number;
    averageProfit: number;
    highest: MaxMinData;
    lowest: MaxMinData;
};

type MaxMinData = {
    price: number;
    profit: number;
    match: Match;
};

type Match = {
    opponent: string;
    date: Date;
    atHome: boolean;
    competition: string;
};
