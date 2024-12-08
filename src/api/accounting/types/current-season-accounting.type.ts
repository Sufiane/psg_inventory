export type CurrentSeasonAccounting = {
    totalSales: number;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: number;
    averageTicketPrice: number;
    averageProfit: number
    highest: MaxMinData,
    lowest: MaxMinData
}

type MaxMinData = {
    price: number,
    profit: number,
    match: Match
}

type Match = {
    opponent: string;
    date: Date;
    atHome: boolean
    competition: string
}
