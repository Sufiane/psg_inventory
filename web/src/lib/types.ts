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

export type SaleAllocation = {
    id?: string;
    seasonPassId: string;
    nbTickets: number;
};

export type SaleListItem = {
    id: string;
    listedPrice: number;
    profit: number;
    invest: number;
    nbTickets: number;
    status: SaleStatus;
    opponent: { id: string; name: string };
    matchDate?: string;
    createdAt?: string;
    soldAt?: string | null;
    cancelledAt?: string | null;
    Allocations?: SaleAllocation[];
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
    createdAt?: string;
    soldAt?: string | null;
    cancelledAt?: string | null;
    Match: {
        date: string;
        Opponent: { id: string; name: string };
    };
    Allocations?: SaleAllocation[];
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

export type SeasonInvestment = {
    id: string;
    price: number;
    seasonStartYear: number;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export type LeadTime = {
    soldCount: number;
    avgLeadDays: number;
    medianLeadDays: number;
    minLeadDays: number;
    maxLeadDays: number;
};

export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
    seasonInvestments: SeasonInvestment[];
    totalSeasonInvestment: number;
    leadTime: LeadTime | null;
};

export type AmortizationMatchRow = {
    matchId: string;
    date: string;
    opponent: string;
    competition: string;
    atHome: boolean;
    matchProfit: number;
    cumulative: number;
    isBreakEven: boolean;
};

export type AmortizationBreakEven = {
    matchId: string;
    date: string;
    opponent: string;
    cumulative: number;
};

export type AmortizationPass = {
    id: string;
    label: string;
    price: number;
};

export type Amortization = {
    seasonStartYear: number;
    passPrice: number;
    hasPass: boolean;
    totalRealized: number;
    progress: number;
    remaining: number;
    surplus: number;
    breakEven: AmortizationBreakEven | null;
    perMatch: AmortizationMatchRow[];
    passes: AmortizationPass[];
};

export type SeasonPass = {
    id: string;
    userId: string;
    seasonStartYear: number;
    price: number;
    label: string;
    category: string;
    row: string;
    seat: string;
    createdAt: string;
    updatedAt: string;
};

export type CreateSeasonPassPayload = {
    seasonStartYear: number;
    price: number;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export type UpdateSeasonPassPayload = {
    price: number;
    label: string;
    category: string;
    row: string;
    seat: string;
};

export type AddSalePayload = {
    matchId: string;
    allocations: SaleAllocation[];
    invest?: number;
    listedPrice: number;
};

export type UpdateSalePayload = {
    saleId: string;
    sold: boolean;
    invest?: number;
    listedPrice?: number;
    allocations?: SaleAllocation[];
};

export type CreateMatchPayload = {
    opponent: string;
    date: string;
    atHome: boolean;
    competition: Competition;
    result?: { isWin: boolean; score: string };
};

export type LoginResponse = { token: string };
