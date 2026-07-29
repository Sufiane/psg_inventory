import type { TicketCount } from '@psg/shared/counts';
import type { MatchId, SeasonPassId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';
import type { IsoDateString } from '@psg/shared/time';

export type SaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED';

export type DraftRowStatus =
    | 'ok'
    | 'warn:opponent-mismatch'
    | 'warn:multi-ticket-single-pass'
    | 'error:match-missing'
    | 'error:opponent-not-found'
    | 'error:unallocated'
    | 'error:invalid-cell'
    | 'error:sold-after-kickoff';

export type DraftAllocation = {
    seasonPassId: SeasonPassId;
    nbTickets: TicketCount;
};

export type DraftRow = {
    rowIndex: number;
    date: string;
    opponent: string;
    listedPrice: ListedPrice;
    nbTickets: TicketCount;
    invest: Invest;
    status: SaleStatus;
    soldAt?: IsoDateString;
    matchId?: MatchId;
    allocations: DraftAllocation[];
    rowStatus: DraftRowStatus;
};

export type PreviewSummary = {
    total: number;
    errors: number;
    warnings: number;
};

export type MissingMatch = {
    matchId: string;
    date: string;
    opponentName: string;
};

export type PreviewResponse = {
    rows: DraftRow[];
    summary: PreviewSummary;
    missingMatches: MissingMatch[];
    seasonStartYear: number;
};

export type CommitResult = {
    batchId: string;
    salesCreated: number;
};

export type RevertResult = {
    deleted: number;
};
