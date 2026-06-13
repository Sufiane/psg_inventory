import type { TicketCount } from '@psg/shared';

type MatchInfo = {
    opponent: string;
    date: Date;
    atHome: boolean;
    competition: string;
};

type ExtremeSaleInfo = {
    profit: number;
    listedPrice: number;
    nbTickets: TicketCount;
    match: MatchInfo;
};

export type AggregatePayload = {
    sum: {
        listedPrice: number;
        profit: number;
        invest: number;
        nbTickets: TicketCount;
    };
    avg: {
        listedPrice: number;
        profit: number;
    };
    min: ExtremeSaleInfo;
    max: ExtremeSaleInfo;
};
