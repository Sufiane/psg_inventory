import { describe, expect, it } from 'vitest';
import type { TicketCount } from '@psg/shared/counts';
import type { Invest, ListedPrice } from '@psg/shared/money';
import {
    formatFileSize,
    needsRecipient,
    rowStateClass,
    rowStateLabel,
    rowStateTone,
    selectedSeasonYears,
    summarizeDraft,
} from './import-draft';
import type { SeasonPass } from './types';
import type { DraftRow, DraftRowStatus, SaleStatus } from './types/sales-import';

const ALL_ROW_STATUSES: DraftRowStatus[] = [
    'ok',
    'warn:opponent-mismatch',
    'warn:multi-ticket-single-pass',
    'error:match-missing',
    'error:opponent-not-found',
    'error:unallocated',
    'error:invalid-cell',
    'error:sold-after-kickoff',
    'error:gift-recipient-missing',
];

function makeRow(patch: Partial<DraftRow> = {}): DraftRow {
    return {
        rowIndex: 0,
        date: '2026-08-15',
        opponent: 'Lyon',
        listedPrice: 0 as ListedPrice,
        nbTickets: 1 as TicketCount,
        invest: 0 as Invest,
        status: 'SOLD' as SaleStatus,
        allocations: [],
        rowStatus: 'ok',
        ...patch,
    };
}

describe('summarizeDraft', () => {
    describe('when rows is empty', () => {
        it('returns all zeros', () => {
            expect(summarizeDraft([])).toEqual({
                total: 0,
                ready: 0,
                attention: 0,
                errors: 0,
            });
        });
    });

    describe('when rows mix ok, warn and error', () => {
        it('counts ready, attention and errors', () => {
            const rows = [
                makeRow({ rowStatus: 'ok' }),
                makeRow({ rowStatus: 'ok' }),
                makeRow({ rowStatus: 'warn:opponent-mismatch' }),
                makeRow({ rowStatus: 'error:unallocated' }),
            ];

            expect(summarizeDraft(rows)).toEqual({
                total: 4,
                ready: 2,
                attention: 2,
                errors: 1,
            });
        });
    });
});

describe('rowStateTone', () => {
    describe('when status is ok', () => {
        it('returns ok', () => {
            expect(rowStateTone('ok')).toBe('ok');
        });
    });

    describe('when status starts with warn:', () => {
        it('returns warn', () => {
            expect(rowStateTone('warn:opponent-mismatch')).toBe('warn');
        });
    });

    describe('when status starts with error:', () => {
        it('returns error', () => {
            expect(rowStateTone('error:invalid-cell')).toBe('error');
        });
    });
});

describe('rowStateLabel', () => {
    describe('for every row status', () => {
        it('returns a non-empty label', () => {
            for (const status of ALL_ROW_STATUSES) {
                expect(rowStateLabel(status).length).toBeGreaterThan(0);
            }
        });

        it('returns distinct labels', () => {
            const labels = new Set(
                ALL_ROW_STATUSES.map((status) => rowStateLabel(status)),
            );

            expect(labels.size).toBe(ALL_ROW_STATUSES.length);
        });
    });

    describe('for known statuses', () => {
        it('returns the spec labels', () => {
            expect(rowStateLabel('ok')).toBe('Ready');
            expect(rowStateLabel('warn:opponent-mismatch')).toBe('Opponent differs');
            expect(rowStateLabel('warn:multi-ticket-single-pass')).toBe('Split tickets');
            expect(rowStateLabel('error:match-missing')).toBe('No match on date');
            expect(rowStateLabel('error:opponent-not-found')).toBe('Opponent not found');
            expect(rowStateLabel('error:unallocated')).toBe('Not allocated');
            expect(rowStateLabel('error:invalid-cell')).toBe('Invalid value');
            expect(rowStateLabel('error:sold-after-kickoff')).toBe('Sold after match');
            expect(rowStateLabel('error:gift-recipient-missing')).toBe(
                'Recipient missing',
            );
        });
    });
});

describe('rowStateClass', () => {
    describe('when tone is ok', () => {
        it('returns muted text', () => {
            expect(rowStateClass('ok')).toBe('text-ink-muted');
        });
    });

    describe('when tone is warn', () => {
        it('returns the warning chip', () => {
            expect(rowStateClass('warn')).toBe('bg-warning/15 text-warning-strong');
        });
    });

    describe('when tone is error', () => {
        it('returns the negative chip', () => {
            expect(rowStateClass('error')).toBe('bg-negative/15 text-negative-strong');
        });
    });
});

describe('needsRecipient', () => {
    describe('when GIFTED with no recipient', () => {
        it.each([undefined, '', '   '])('returns true for %j', (recipient) => {
            expect(needsRecipient(makeRow({ status: 'GIFTED', recipient }))).toBe(true);
        });
    });

    describe('when GIFTED with a name', () => {
        it('returns false', () => {
            expect(needsRecipient(makeRow({ status: 'GIFTED', recipient: 'Ana' }))).toBe(
                false,
            );
        });
    });

    describe('when status is not GIFTED', () => {
        it('returns false', () => {
            expect(needsRecipient(makeRow({ status: 'SOLD', recipient: '' }))).toBe(
                false,
            );
        });
    });
});

function makePass(id: string, seasonStartYear: number): SeasonPass {
    return { id, seasonStartYear } as unknown as SeasonPass;
}

describe('selectedSeasonYears', () => {
    const passes = [makePass('a', 2026), makePass('b', 2026), makePass('c', 2025)];

    describe('when nothing is selected', () => {
        it('returns no years', () => {
            expect(selectedSeasonYears(passes, [])).toEqual([]);
        });
    });

    describe('when passes of one season are selected', () => {
        it('returns that year once', () => {
            expect(selectedSeasonYears(passes, ['a', 'b'])).toEqual([2026]);
        });
    });

    describe('when passes of two seasons are selected', () => {
        it('returns both years', () => {
            expect(selectedSeasonYears(passes, ['a', 'c']).sort()).toEqual([2025, 2026]);
        });
    });
});

describe('formatFileSize', () => {
    describe('when under 1 KB', () => {
        it('formats bytes', () => {
            expect(formatFileSize(512)).toBe('512 B');
        });
    });

    describe('when under 1 MB', () => {
        it('formats kilobytes', () => {
            expect(formatFileSize(43_827)).toBe('42.8 KB');
        });
    });

    describe('when 1 MB or more', () => {
        it('formats megabytes', () => {
            expect(formatFileSize(2_621_440)).toBe('2.5 MB');
        });
    });
});
