import type {
    AvgProfit,
    AvgTicketPrice,
    CategoryLabel,
    Email,
    Invest,
    JwtToken,
    LeadDays,
    ListedPrice,
    MatchId,
    MatchScore,
    OpponentId,
    OpponentName,
    PassLabel,
    Profit,
    RowLabel,
    SaleCount,
    SaleId,
    SeasonPassId,
    SeasonPassPrice,
    SeasonYear,
    SeatLabel,
    SoldCount,
    TicketCount,
    UserId,
} from '@psg/shared';

export type Role = 'ADMIN' | 'USER';

export type SessionUser = {
    sub: UserId;
    email: Email;
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
    id: MatchId;
    date: string;
    atHome: boolean;
    competition: string;
    opponent: OpponentName;
    result?: { isWin?: boolean; score?: MatchScore };
};

export type SaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED';

export type SaleAllocation = {
    id?: SeasonPassId;
    seasonPassId: SeasonPassId;
    nbTickets: TicketCount;
};

export type SaleListItem = {
    id: SaleId;
    listedPrice: ListedPrice;
    profit: Profit;
    invest: Invest;
    nbTickets: TicketCount;
    status: SaleStatus;
    opponent: { id: OpponentId; name: OpponentName };
    matchDate?: string;
    createdAt?: string;
    soldAt?: string | null;
    cancelledAt?: string | null;
    Allocations?: SaleAllocation[];
};

export type SaleDetail = {
    id: SaleId;
    userId: UserId;
    matchId: MatchId;
    listedPrice: ListedPrice;
    profit: Profit;
    invest: Invest;
    nbTickets: TicketCount;
    status: SaleStatus;
    createdAt?: string;
    soldAt?: string | null;
    cancelledAt?: string | null;
    Match: {
        date: string;
        Opponent: { id: OpponentId; name: OpponentName };
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
    price: ListedPrice;
    profit: Profit;
    match: MatchInfo;
};

export type Accounting = {
    totalSales: SaleCount;
    totalProfit: Profit;
    totalInvest: Invest;
    totalNbTickets: TicketCount;
    averageTicketPrice: AvgTicketPrice;
    averageProfit: AvgProfit;
    highest: MaxMinData;
    lowest: MaxMinData;
};

export type SeasonInvestment = {
    id: SeasonPassId;
    price: SeasonPassPrice;
    seasonStartYear: SeasonYear;
    label: PassLabel;
    category: CategoryLabel;
    row: RowLabel;
    seat: SeatLabel;
};

export type LeadTime = {
    soldCount: SoldCount;
    avgLeadDays: LeadDays;
    medianLeadDays: LeadDays;
    minLeadDays: LeadDays;
    maxLeadDays: LeadDays;
};

export type TimePeriodAccounting = {
    realized: Accounting | null;
    unrealized: Accounting | null;
    pending: Accounting | null;
    seasonInvestments: SeasonInvestment[];
    totalSeasonInvestment: SeasonPassPrice;
    leadTime: LeadTime | null;
};

export type AmortizationMatchRow = {
    matchId: MatchId;
    date: string;
    opponent: string;
    competition: string;
    atHome: boolean;
    matchProfit: number;
    cumulative: number;
    isBreakEven: boolean;
};

export type AmortizationBreakEven = {
    matchId: MatchId;
    date: string;
    opponent: string;
    cumulative: number;
};

export type AmortizationPass = {
    id: SeasonPassId;
    label: PassLabel;
    price: SeasonPassPrice;
};

export type Amortization = {
    seasonStartYear: SeasonYear;
    passPrice: SeasonPassPrice;
    hasPass: boolean;
    totalRealized: Profit;
    progress: number;
    remaining: number;
    surplus: number;
    breakEven: AmortizationBreakEven | null;
    perMatch: AmortizationMatchRow[];
    passes: AmortizationPass[];
};

export type SeasonPass = {
    id: SeasonPassId;
    userId: UserId;
    seasonStartYear: SeasonYear;
    price: SeasonPassPrice;
    label: PassLabel;
    category: CategoryLabel;
    row: RowLabel;
    seat: SeatLabel;
    createdAt: string;
    updatedAt: string;
};

export type CreateSeasonPassPayload = {
    seasonStartYear: SeasonYear;
    price: SeasonPassPrice;
    label: PassLabel;
    category: CategoryLabel;
    row: RowLabel;
    seat: SeatLabel;
};

export type UpdateSeasonPassPayload = {
    price: SeasonPassPrice;
    label: PassLabel;
    category: CategoryLabel;
    row: RowLabel;
    seat: SeatLabel;
};

export type AddSalePayload = {
    matchId: MatchId;
    allocations: SaleAllocation[];
    invest?: Invest;
    listedPrice: ListedPrice;
};

export type UpdateSalePayload = {
    saleId: SaleId;
    sold: boolean;
    invest?: Invest;
    listedPrice?: ListedPrice;
    allocations?: SaleAllocation[];
};

export type CreateMatchPayload = {
    opponent: OpponentName;
    date: string;
    atHome: boolean;
    competition: Competition;
    result?: { isWin: boolean; score: MatchScore };
};

export type LoginResponse = { token: JwtToken };
