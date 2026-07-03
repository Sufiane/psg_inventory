export type SaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED';

export type DraftRowStatus =
    | 'ok'
    | 'warn:opponent-mismatch'
    | 'warn:multi-ticket-single-pass'
    | 'error:match-missing'
    | 'error:opponent-not-found'
    | 'error:unallocated'
    | 'error:invalid-cell';

export type DraftAllocation = {
    seasonPassId: string;
    nbTickets: number;
};

export type DraftRow = {
    rowIndex: number;
    date: string;
    opponent: string;
    listedPrice: number;
    nbTickets: number;
    invest: number;
    status: SaleStatus;
    matchId?: string;
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
