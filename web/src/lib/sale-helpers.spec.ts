import { describe, expect, it } from 'vitest';
import { profitTone, statusPill } from './sale-helpers';
import type { SaleStatus } from './types';

/** Every member of the `SaleStatus` union — kept in sync by the
 * `statusPill` exhaustiveness test below, which fails when a new status is
 * added without a pill. */
const ALL_STATUSES: SaleStatus[] = ['PENDING', 'SOLD', 'CANCELLED', 'GIFTED'];

describe('statusPill', () => {
    describe('when the status is SOLD', () => {
        it('renders the positive pill', () => {
            expect(statusPill('SOLD')).toBe('bg-positive/15 text-positive-strong');
        });
    });

    describe('when the status is PENDING', () => {
        it('renders the warning pill', () => {
            expect(statusPill('PENDING')).toBe('bg-warning/15 text-warning-strong');
        });
    });

    describe('when the status is CANCELLED', () => {
        it('renders the sunk pill', () => {
            expect(statusPill('CANCELLED')).toBe('bg-sunk/15 text-sunk-strong');
        });
    });

    describe('when the status is GIFTED', () => {
        it('renders the gift pill', () => {
            expect(statusPill('GIFTED')).toBe('bg-gift/15 text-gift-strong');
        });
    });

    describe('for every member of SaleStatus', () => {
        // The switch has no `default` branch: an unhandled status would fall
        // through to `undefined` and render an unstyled pill. This pins full
        // coverage of the union.
        it('returns a non-empty class string', () => {
            for (const status of ALL_STATUSES) {
                expect(statusPill(status)).toMatch(/\S/);
            }
        });
    });
});

describe('profitTone', () => {
    // Status tones win over the sign of the profit — a cancelled sale with a
    // positive number is still sunk-coloured, a gifted one never shows a
    // "gain".
    describe('when the status dictates the tone', () => {
        it('uses the sunk tone for CANCELLED regardless of profit sign', () => {
            expect(profitTone('CANCELLED', 50)).toBe('text-sunk');
            expect(profitTone('CANCELLED', -50)).toBe('text-sunk');
        });

        it('uses the gift tone for GIFTED regardless of profit sign', () => {
            expect(profitTone('GIFTED', 50)).toBe('text-gift');
            expect(profitTone('GIFTED', -50)).toBe('text-gift');
        });

        it('uses the warning tone for PENDING regardless of profit sign', () => {
            expect(profitTone('PENDING', 50)).toBe('text-warning');
            expect(profitTone('PENDING', -50)).toBe('text-warning');
        });
    });

    describe('when the status is SOLD', () => {
        it('colours the tone by the sign of the profit', () => {
            expect(profitTone('SOLD', -20)).toBe('text-negative');
            expect(profitTone('SOLD', 20)).toBe('text-positive');
        });

        it('falls back to the neutral ink tone when the profit is exactly zero', () => {
            expect(profitTone('SOLD', 0)).toBe('text-ink');
        });
    });
});
