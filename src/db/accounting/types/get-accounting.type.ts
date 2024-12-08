export type AccountingAggregate = {
    _sum: {
        profit: number,
        nbTickets: number,
        invest: number,
        listedPrice: number,
    },
    _avg: {
        profit: number,
        nbTickets: number,
        invest: number,
        listedPrice: number,
    },
    _min: {
        profit: number,
        nbTickets: number,
        invest: number,
        listedPrice: number,
    },
    _max: {
        profit: number,
        nbTickets: number,
        invest: number,
        listedPrice: number,
    },
}
