export type FormattedAggregate = {
    totalSales: number;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: number;
    averageTicketPrice: number;
    averageProfit: number;
    lowest: {
        profit: number;
        price: number;
        nbTickets: number;
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
        nbTickets: number;
        match: {
            opponent: string;
            date: Date;
            atHome: boolean;
            competition: string;
        };
    };
};
