import type { TicketCount } from '@psg/shared/counts';
import type { IsoDateString } from '@psg/shared/time';
import type { Match } from '../../db/matches/types/match.type';
import type { DraftRowDto, DraftRowStatus } from './dto/draft-row.dto';
import type { RawImportRow, SaleRowStatus } from './sales-import.csv';
import { normalizeRecipientName } from '../../shared/utils/recipient-name.util';
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

// A sale can't be marked SOLD or GIFTED after the match has kicked off — same
// rule the api layer enforces for the manual flow (sales.service.ts), and the
// same rule for both statuses since the D5 revision of 2026-09-12. soldAt is a
// date-only field here, so the check is day-level: sold or gifted the same day
// as the match is allowed (kickoff time within the day is unknown), later days
// aren't. The guard applies to PENDING and CANCELLED rows too — soldAt is a
// free-standing optional column, not exclusive to SOLD — so there is no
// per-status branch at all. This is about *when the gift happened*; attaching a
// recipient to an imported gift afterwards is a separate claim and is not
// guarded (D10). See docs/specs/2026-09-11-gifted-sale-status-design.md, D5/D10.
function resolveSoldAtStatus(
    raw: { soldAt: IsoDateString | null },
    match: Match | null,
): DraftRowStatus | null {
    if (raw.soldAt == null || match == null) {
        return null;
    }

    return raw.soldAt > isoDate(match.date) ? 'error:sold-after-kickoff' : null;
}

// Value-level, not structural: a match-missing or allocation error means the
// row maps to nothing, so those take precedence. Recipient and kickoff are
// both about the row's own values, and a row that trips both must report the
// same one every time — the position in the chain is arbitrary but it must
// be identical here and in validateCommitRow, or a preview and its commit
// disagree on which error a tampered/edited row shows (spec D10).
function resolveGiftRecipientStatus(raw: {
    status: SaleRowStatus;
    recipient: string | null;
}): DraftRowStatus | null {
    if (raw.status !== 'GIFTED') {
        return null;
    }

    return normalizeRecipientName(raw.recipient ?? '').length === 0
        ? 'error:gift-recipient-missing'
        : null;
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
    nbTickets: TicketCount,
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
            allocations: [{ seasonPassId: firstPassId, nbTickets: 1 as TicketCount }],
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

function errorOnly(status: DraftRowStatus | null): DraftRowStatus | null {
    return status?.startsWith('error:') ? status : null;
}

function firstStatus(candidates: ReadonlyArray<DraftRowStatus | null>): DraftRowStatus {
    return candidates.find((candidate) => candidate != null) ?? 'ok';
}

function countIssues(rows: DraftRowDto[]): { errors: number; warnings: number } {
    return {
        errors: rows.filter((row) => row.rowStatus.startsWith('error:')).length,
        warnings: rows.filter((row) => row.rowStatus.startsWith('warn:')).length,
    };
}

function toCommitRaw(row: DraftRowDto): RawImportRow {
    return {
        rowIndex: row.rowIndex,
        date: row.date,
        opponent: row.opponent,
        listedPrice: row.listedPrice,
        nbTickets: row.nbTickets,
        invest: row.invest,
        status: row.status,
        soldAt: (row.soldAt ?? null) as IsoDateString | null,
        recipient: (row.recipient ?? null) as string | null,
    };
}

function hasValidAllocations(row: DraftRowDto, selected: Set<string>): boolean {
    const allocationsSum = row.allocations.reduce(
        (total, allocation) => total + allocation.nbTickets,
        0,
    );

    return (
        row.allocations.length > 0 &&
        allocationsSum === row.nbTickets &&
        row.allocations.every((allocation) => selected.has(allocation.seasonPassId))
    );
}

function withoutMatchId(row: DraftRowDto): Omit<DraftRowDto, 'matchId'> {
    const copy = { ...row };

    delete copy.matchId;

    return copy;
}

function validateCommitRow(
    row: DraftRowDto,
    byDate: Map<string, Match[]>,
    selected: Set<string>,
): DraftRowDto {
    const raw = toCommitRaw(row);
    const serverRow = withoutMatchId(row);

    if (isInvalidRow(raw)) {
        return { ...serverRow, rowStatus: 'error:invalid-cell' };
    }

    const { match, status: matchStatus } = resolveMatch(raw, byDate);
    const matchIdSpread = match != null ? { matchId: match.id } : {};

    if (matchStatus?.startsWith('error:')) {
        return { ...serverRow, ...matchIdSpread, rowStatus: matchStatus };
    }

    const rowStatus = firstStatus([
        hasValidAllocations(row, selected) ? null : 'error:unallocated',
        resolveGiftRecipientStatus(raw),
        resolveSoldAtStatus(raw, match),
        matchStatus,
    ]);

    return { ...serverRow, ...matchIdSpread, rowStatus };
}

export function validateCommitRows(input: ValidateInput): ValidateOutput {
    const byDate = matchesByDate(input.homeMatches);
    const selected = new Set(input.selectedPassIds);
    const rows = input.rows.map((row) => validateCommitRow(row, byDate, selected));
    const { errors, warnings } = countIssues(rows);

    return { rows, summary: { total: input.rows.length, errors, warnings } };
}

function toDraftRowBase(
    raw: RawImportRow,
): Omit<DraftRowDto, 'allocations' | 'rowStatus' | 'matchId'> {
    return {
        rowIndex: raw.rowIndex,
        date: raw.date,
        opponent: raw.opponent,
        listedPrice: raw.listedPrice,
        nbTickets: raw.nbTickets,
        invest: raw.invest,
        status: raw.status,
        ...(raw.soldAt != null ? { soldAt: raw.soldAt } : {}),
        ...(raw.recipient != null ? { recipient: raw.recipient } : {}),
    };
}

function resolveDraftRow(
    raw: RawImportRow,
    byDate: Map<string, Match[]>,
    selectedPassIds: string[],
): DraftRowDto {
    if (isInvalidRow(raw)) {
        return {
            ...toDraftRowBase(raw),
            allocations: [],
            rowStatus: 'error:invalid-cell',
        };
    }

    const { match, status: matchStatus } = resolveMatch(raw, byDate);
    const allocationResult = buildAllocations(raw.nbTickets, selectedPassIds);
    const giftRecipientStatus = resolveGiftRecipientStatus(raw);
    const soldAtStatus = resolveSoldAtStatus(raw, match);
    const rowStatus = firstStatus([
        errorOnly(matchStatus),
        errorOnly(allocationResult.status),
        giftRecipientStatus,
        soldAtStatus,
        matchStatus,
        allocationResult.status,
    ]);

    return {
        ...toDraftRowBase(raw),
        ...(match != null ? { matchId: match.id } : {}),
        allocations: allocationResult.allocations,
        rowStatus,
    };
}

function findMissingMatches(homeMatches: Match[], rows: DraftRowDto[]): MissingMatch[] {
    const usedMatchIds = new Set(
        rows.flatMap((row) => (row.matchId != null ? [row.matchId] : [])),
    );

    return homeMatches
        .filter((match) => !usedMatchIds.has(match.id))
        .map((match) => ({
            matchId: match.id,
            date: isoDate(match.date),
            opponentName: match.Opponent.name,
        }));
}

export function resolveDraftRows(input: ResolveInput): ResolveOutput {
    const byDate = matchesByDate(input.homeMatches);
    const rows = input.rawRows.map((raw) =>
        resolveDraftRow(raw, byDate, input.selectedPassIds),
    );
    const { errors, warnings } = countIssues(rows);

    return {
        rows,
        missingMatches: findMissingMatches(input.homeMatches, rows),
        summary: {
            total: input.rawRows.length,
            errors,
            warnings,
        },
    };
}
