import type { Invest, ListedPrice } from '@psg/shared/money';
import type { TicketCount } from '@psg/shared/counts';
import type { IsoDateString } from '@psg/shared/time';
import type { Match } from '../../db/matches/types/match.type';
import type { DraftRowDto, DraftRowStatus } from './dto/draft-row.dto';
import type { RawImportRow } from './sales-import.csv';
import { DATE_ONLY_REGEX } from './utils/date-only.util';

export type ResolveInput = {
    rawRows: RawImportRow[];
    homeMatches: Match[];
    selectedPassIds: string[];
};

export type MissingMatch = {
    matchId: string;
    date: string;
    opponentName: string;
};

export type ResolveOutput = {
    rows: DraftRowDto[];
    missingMatches: MissingMatch[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
    };
};

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function normalize(text: string): string {
    return text.trim().toLowerCase();
}

function matchesByDate(homeMatches: Match[]): Map<string, Match[]> {
    const index = new Map<string, Match[]>();

    for (const match of homeMatches) {
        const key = isoDate(match.date);
        const bucket = index.get(key) ?? [];

        bucket.push(match);
        index.set(key, bucket);
    }

    return index;
}

function isInvalidRow(raw: RawImportRow): boolean {
    if (!Number.isInteger(raw.listedPrice) || raw.listedPrice < 0) {
        return true;
    }

    if (!Number.isInteger(raw.invest) || raw.invest < 0) {
        return true;
    }

    if (!Number.isInteger(raw.nbTickets) || raw.nbTickets < 1) {
        return true;
    }

    if (!DATE_ONLY_REGEX.test(raw.date)) {
        return true;
    }

    if (raw.soldAt != null && !DATE_ONLY_REGEX.test(raw.soldAt)) {
        return true;
    }

    return false;
}

// A sale can't be marked SOLD after the match has kicked off — same rule the
// api layer enforces for the normal sell flow (sales.service.ts). soldAt is a
// date-only field here, so the check is day-level: sold the same day as the
// match is allowed (kickoff time within the day is unknown), later days aren't.
function resolveSoldAtStatus(
    raw: { soldAt: IsoDateString | null },
    match: Match | null,
): DraftRowStatus | null {
    if (raw.soldAt == null || match == null) {
        return null;
    }

    return raw.soldAt > isoDate(match.date) ? 'error:sold-after-kickoff' : null;
}

function resolveMatch(
    raw: RawImportRow,
    byDate: Map<string, Match[]>,
): { match: Match | null; status: DraftRowStatus | null } {
    const bucket = byDate.get(raw.date) ?? [];

    if (bucket.length === 0) {
        return { match: null, status: 'error:match-missing' };
    }

    if (bucket.length === 1) {
        const only = bucket[0]!;
        const namesMatch = normalize(only.Opponent.name) === normalize(raw.opponent);

        return {
            match: only,
            status: namesMatch ? null : 'warn:opponent-mismatch',
        };
    }

    const target = normalize(raw.opponent);
    const byOpponent = bucket.find(
        (candidate) => normalize(candidate.Opponent.name) === target,
    );

    if (byOpponent == null) {
        return { match: null, status: 'error:opponent-not-found' };
    }

    return { match: byOpponent, status: null };
}

function buildAllocations(
    nbTickets: number,
    selectedPassIds: string[],
): {
    allocations: DraftRowDto['allocations'];
    status: DraftRowStatus | null;
} {
    if (selectedPassIds.length === 0) {
        return { allocations: [], status: 'error:unallocated' };
    }

    const firstPassId = selectedPassIds[0]!;

    if (nbTickets === 1) {
        return {
            allocations: [{ seasonPassId: firstPassId, nbTickets: 1 }],
            status: null,
        };
    }

    if (selectedPassIds.length === 1) {
        return {
            allocations: [{ seasonPassId: firstPassId, nbTickets }],
            status: 'warn:multi-ticket-single-pass',
        };
    }

    return { allocations: [], status: 'error:unallocated' };
}

export type ValidateInput = {
    rows: DraftRowDto[];
    homeMatches: Match[];
    selectedPassIds: string[];
};

export type ValidateOutput = {
    rows: DraftRowDto[];
    summary: { total: number; errors: number; warnings: number };
};

export function validateCommitRows(input: ValidateInput): ValidateOutput {
    const byDate = matchesByDate(input.homeMatches);
    const selected = new Set(input.selectedPassIds);
    const rows: DraftRowDto[] = [];
    let errors = 0;
    let warnings = 0;

    for (const row of input.rows) {
        const raw = {
            rowIndex: row.rowIndex,
            date: row.date,
            opponent: row.opponent,
            listedPrice: row.listedPrice as ListedPrice,
            nbTickets: row.nbTickets as TicketCount,
            invest: row.invest as Invest,
            status: row.status,
            soldAt: (row.soldAt ?? null) as IsoDateString | null,
        };
        let rowStatus: DraftRowStatus = 'ok';
        let matchId: string | undefined;

        if (isInvalidRow(raw)) {
            rowStatus = 'error:invalid-cell';
        } else {
            const { match, status: matchStatus } = resolveMatch(raw, byDate);

            if (match != null) {
                matchId = match.id;
            }

            if (matchStatus?.startsWith('error:')) {
                rowStatus = matchStatus;
            } else {
                const allocationsSum = row.allocations.reduce(
                    (total, allocation) => total + allocation.nbTickets,
                    0,
                );
                const allValid = row.allocations.every((allocation) =>
                    selected.has(allocation.seasonPassId),
                );
                const soldAtStatus = resolveSoldAtStatus(raw, match);

                if (
                    row.allocations.length === 0 ||
                    allocationsSum !== row.nbTickets ||
                    !allValid
                ) {
                    rowStatus = 'error:unallocated';
                } else if (soldAtStatus != null) {
                    rowStatus = soldAtStatus;
                } else if (matchStatus != null) {
                    rowStatus = matchStatus;
                }
            }
        }

        if (rowStatus.startsWith('error:')) {
            errors++;
        } else if (rowStatus.startsWith('warn:')) {
            warnings++;
        }

        rows.push({
            ...row,
            ...(matchId != null ? { matchId } : {}),
            rowStatus,
        });
    }

    return { rows, summary: { total: input.rows.length, errors, warnings } };
}

export function resolveDraftRows(input: ResolveInput): ResolveOutput {
    const byDate = matchesByDate(input.homeMatches);
    const rows: DraftRowDto[] = [];
    const usedMatchIds = new Set<string>();
    let errors = 0;
    let warnings = 0;

    for (const raw of input.rawRows) {
        if (isInvalidRow(raw)) {
            rows.push({
                rowIndex: raw.rowIndex,
                date: raw.date,
                opponent: raw.opponent,
                listedPrice: raw.listedPrice,
                nbTickets: raw.nbTickets,
                invest: raw.invest,
                status: raw.status,
                ...(raw.soldAt != null ? { soldAt: raw.soldAt } : {}),
                allocations: [],
                rowStatus: 'error:invalid-cell',
            });
            errors++;
            continue;
        }

        const { match, status: matchStatus } = resolveMatch(raw, byDate);
        const allocationResult = buildAllocations(raw.nbTickets, input.selectedPassIds);
        const soldAtStatus = resolveSoldAtStatus(raw, match);

        let finalStatus: DraftRowStatus = 'ok';

        if (matchStatus?.startsWith('error:')) {
            finalStatus = matchStatus;
        } else if (allocationResult.status?.startsWith('error:')) {
            finalStatus = allocationResult.status;
        } else if (soldAtStatus != null) {
            finalStatus = soldAtStatus;
        } else if (matchStatus != null) {
            finalStatus = matchStatus;
        } else if (allocationResult.status != null) {
            finalStatus = allocationResult.status;
        }

        if (finalStatus.startsWith('error:')) {
            errors++;
        } else if (finalStatus.startsWith('warn:')) {
            warnings++;
        }

        if (match != null) {
            usedMatchIds.add(match.id);
        }

        rows.push({
            rowIndex: raw.rowIndex,
            date: raw.date,
            opponent: raw.opponent,
            listedPrice: raw.listedPrice,
            nbTickets: raw.nbTickets,
            invest: raw.invest,
            status: raw.status,
            ...(raw.soldAt != null ? { soldAt: raw.soldAt } : {}),
            matchId: match?.id,
            allocations: allocationResult.allocations,
            rowStatus: finalStatus,
        });
    }

    const missingMatches: MissingMatch[] = input.homeMatches
        .filter((match) => !usedMatchIds.has(match.id))
        .map((match) => ({
            matchId: match.id,
            date: isoDate(match.date),
            opponentName: match.Opponent.name,
        }));

    return {
        rows,
        missingMatches,
        summary: {
            total: input.rawRows.length,
            errors,
            warnings,
        },
    };
}
