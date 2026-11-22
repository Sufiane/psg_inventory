import type { SeasonPass } from './types';
import type { DraftRow, DraftRowStatus } from './types/sales-import';

export type RowStateTone = 'ok' | 'warn' | 'error';

export type DraftSummary = {
    total: number;
    ready: number;
    attention: number;
    errors: number;
};

const ROW_STATE_LABELS: Record<DraftRowStatus, string> = {
    ok: 'Ready',
    'warn:opponent-mismatch': 'Opponent differs',
    'warn:multi-ticket-single-pass': 'Split tickets',
    'error:match-missing': 'No match on date',
    'error:opponent-not-found': 'Opponent not found',
    'error:unallocated': 'Not allocated',
    'error:invalid-cell': 'Invalid value',
    'error:sold-after-kickoff': 'Sold after match',
    'error:gift-recipient-missing': 'Recipient missing',
};

const ROW_STATE_CLASSES: Record<RowStateTone, string> = {
    ok: 'text-ink-muted',
    warn: 'bg-warning/15 text-warning-strong',
    error: 'bg-negative/15 text-negative-strong',
};

export function rowStateTone(status: DraftRowStatus): RowStateTone {
    if (status.startsWith('error:')) {
        return 'error';
    }

    if (status.startsWith('warn:')) {
        return 'warn';
    }

    return 'ok';
}

export function rowStateLabel(status: DraftRowStatus): string {
    return ROW_STATE_LABELS[status];
}

export function rowStateClass(tone: RowStateTone): string {
    return ROW_STATE_CLASSES[tone];
}

export function summarizeDraft(rows: DraftRow[]): DraftSummary {
    let attention = 0;
    let errors = 0;

    for (const row of rows) {
        const tone = rowStateTone(row.rowStatus);

        if (tone !== 'ok') {
            attention += 1;
        }

        if (tone === 'error') {
            errors += 1;
        }
    }

    return { total: rows.length, ready: rows.length - attention, attention, errors };
}

export function needsRecipient(row: DraftRow): boolean {
    return row.status === 'GIFTED' && (row.recipient ?? '').trim().length === 0;
}

export function selectedSeasonYears(
    passes: SeasonPass[],
    selectedPassIds: string[],
): number[] {
    const years = new Set<number>();

    for (const pass of passes) {
        if (selectedPassIds.includes(pass.id)) {
            years.add(pass.seasonStartYear);
        }
    }

    return [...years];
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1_048_576) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
