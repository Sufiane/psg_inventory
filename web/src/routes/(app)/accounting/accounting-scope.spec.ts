import { describe, expect, it } from 'vitest';
import { resolveAccountingScope } from './accounting-scope';

function scopeFor(query: string): ReturnType<typeof resolveAccountingScope> {
    return resolveAccountingScope(new URL(`https://x/accounting${query}`));
}

describe('resolveAccountingScope', () => {
    describe('when year is absent', () => {
        it('is the current season', () => {
            expect(scopeFor('')).toEqual({ view: 'current', year: null });
        });
    });

    describe('when year is 2025', () => {
        it('is season 2025', () => {
            expect(scopeFor('?year=2025')).toEqual({ view: 'season', year: 2025 });
        });
    });

    describe('when year is all', () => {
        it('is all-time', () => {
            expect(scopeFor('?year=all')).toEqual({ view: 'all-time', year: null });
        });
    });

    describe('when year is absent and view is all-time', () => {
        it('is all-time', () => {
            expect(scopeFor('?view=all-time')).toEqual({ view: 'all-time', year: null });
        });
    });

    describe('when year is 2025 and view is all-time', () => {
        it('lets year win', () => {
            expect(scopeFor('?year=2025&view=all-time')).toEqual({
                view: 'season',
                year: 2025,
            });
        });
    });

    describe('when year is invalid', () => {
        it('is the current season', () => {
            expect(scopeFor('?year=abc')).toEqual({ view: 'current', year: null });
        });
    });
});
