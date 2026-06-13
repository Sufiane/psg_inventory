import type {
    AvgProfit,
    AvgTicketPrice,
    Invest,
    ListedPrice,
    Profit,
    SaleCount,
    TicketCount,
} from '@psg/shared';

export type Accounting = {
    totalSales: SaleCount;
    totalProfit: Profit;
    totalInvest: Invest;
    totalNbTickets: TicketCount;
    averageTicketPrice: AvgTicketPrice;
    averageProfit: AvgProfit;
    highest: MaxMinData;
    lowest: MaxMinData;
};

type MaxMinData = {
    price: ListedPrice;
    profit: Profit;
    match: Match;
};

type Match = {
    opponent: string;
    date: Date;
    atHome: boolean;
    competition: string;
};
