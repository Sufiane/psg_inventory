import type {
    AvgProfit,
    AvgTicketPrice,
    Invest,
    ListedPrice,
    Profit,
    TicketCount,
} from '@psg/shared';

type MatchInfo = {
    opponent: string;
    date: Date;
    atHome: boolean;
    competition: string;
};

type ExtremeSaleInfo = {
    profit: Profit;
    listedPrice: ListedPrice;
    nbTickets: TicketCount;
    match: MatchInfo;
};

export type AggregatePayload = {
    sum: {
        listedPrice: ListedPrice;
        profit: Profit;
        invest: Invest;
        nbTickets: TicketCount;
    };
    avg: {
        listedPrice: AvgTicketPrice;
        profit: AvgProfit;
    };
    min: ExtremeSaleInfo;
    max: ExtremeSaleInfo;
};
