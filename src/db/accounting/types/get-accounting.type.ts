import type { TicketCount } from '@psg/shared/counts';
import type {
    AvgProfit,
    AvgTicketPrice,
    Invest,
    ListedPrice,
    Profit,
} from '@psg/shared/money';

export type AccountingAggregate = {
    _sum: {
        profit: Profit;
        nbTickets: TicketCount;
        invest: Invest;
        listedPrice: ListedPrice;
    };
    _avg: {
        profit: AvgProfit;
        nbTickets: number;
        invest: number;
        listedPrice: AvgTicketPrice;
    };
    _min: {
        profit: Profit;
        nbTickets: TicketCount;
        invest: Invest;
        listedPrice: ListedPrice;
    };
    _max: {
        profit: Profit;
        nbTickets: TicketCount;
        invest: Invest;
        listedPrice: ListedPrice;
    };
};
