type MatchInfo = {
    opponent: string;
    date: Date;
    atHome: boolean;
    competition: string;
}

export type AggregatePayload = {
    sum: {
        listedPrice: number;
        profit: number;
        invest: number;
        nbTickets: number;
    };
    avg: {
        listedPrice: number;
        profit: number;
    };
    min: {
        profit: number;
        listedPrice: number;
        match: MatchInfo;
    };
    max: {
        profit: number;
        listedPrice: number;
        match: MatchInfo;
    };
}
