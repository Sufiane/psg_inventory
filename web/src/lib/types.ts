export type Role = 'ADMIN' | 'USER';

export type SessionUser = {
    sub: string;
    email: string;
    role: Role;
    exp?: number;
};

export type Competition =
    | 'CHAMPIONS_LEAGUE'
    | 'CHAMPIONSHIP'
    | 'FRENCH_CUP'
    | 'LEAGUE_CUP';

export const COMPETITIONS: Competition[] = [
    'CHAMPIONS_LEAGUE',
    'CHAMPIONSHIP',
    'FRENCH_CUP',
    'LEAGUE_CUP',
];

export type FormattedMatch = {
    id: string;
    date: string;
    atHome: boolean;
    competition: string;
    opponent: string;
    result?: { isWin?: boolean; score?: string };
};

export type SaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED';

export type SaleListItem = {
    id: string;
    listedPrice: number;
    profit: number;
    invest: number;
    nbTickets: number;
    status: SaleStatus;
    opponent: { id: string; name: string };
};

export type SaleDetail = {
    id: string;
    userId: string;
    matchId: string;
    listedPrice: number;
    profit: number;
    invest: number;
    nbTickets: number;
    status: SaleStatus;
    Match: {
        Opponent: { id: string; name: string };
    };
};

type MatchInfo = {
    opponent: string;
    date: string;
    atHome: boolean;
    competition: string;
};

type MaxMinData = {
    price: number;
    profit: number;
    match: MatchInfo;
};

export type Accounting = {
    totalSales: number;
    totalProfit: number;
    totalInvest: number;
    totalNbTickets: number;
    averageTicketPrice: number;
    averageProfit: number;
    highest: MaxMinData;
    lowest: MaxMinData;
};

export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
};

export type AddSalePayload = {
    matchId: string;
    nbTickets: number;
    invest?: number;
    listedPrice: number;
};

export type UpdateSalePayload = Partial<AddSalePayload> & {
    saleId: string;
    sold: boolean;
};

export type CreateMatchPayload = {
    opponent: string;
    date: string;
    atHome: boolean;
    competition: Competition;
    result?: { isWin: boolean; score: string };
};

export type LoginResponse = { token: string };
