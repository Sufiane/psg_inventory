import type { SaleCount, TicketCount } from '@psg/shared/counts';
import type {
    AvgProfit,
    AvgTicketPrice,
    Invest,
    ListedPrice,
    Profit,
    TotalListedValue,
} from '@psg/shared/money';

export type FormattedAggregate = {
    totalListedValue: TotalListedValue;
    salesCount: SaleCount;
    totalProfit: Profit;
    totalInvest: Invest;
    totalNbTickets: TicketCount;
    averageTicketPrice: AvgTicketPrice;
    averageProfit: AvgProfit;
    lowest: {
        profit: Profit;
        price: ListedPrice;
        nbTickets: TicketCount;
        match: {
            opponent: string;
            date: Date;
            atHome: boolean;
            competition: string;
        };
    };
    highest: {
        profit: Profit;
        price: ListedPrice;
        nbTickets: TicketCount;
        match: {
            opponent: string;
            date: Date;
            atHome: boolean;
            competition: string;
        };
    };
};
