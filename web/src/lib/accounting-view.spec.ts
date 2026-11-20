import { describe, expect, it } from 'vitest';
import type { MatchId } from '@psg/shared/ids';
import {
    homeMatchCount,
    passCostPerMatch,
    stripSegments,
    tableGroups,
} from './accounting-view';
import type { FormattedMatch, SaleListItem, SaleStatus } from './types';

function match(
    id: string,
    opponent: string,
    date: string,
    atHome = true,
): FormattedMatch {
    return {
        id: id as MatchId,
        date,
        atHome,
        competition: 'CHAMPIONSHIP',
        opponent: opponent as FormattedMatch['opponent'],
    };
}

function sale(id: string, matchId: string, status: SaleStatus): SaleListItem {
    return {
        id,
        matchId,
        listedPrice: 10,
        profit: 10,
        invest: 0,
        nbTickets: 1,
        status,
        opponent: { id: 'op1', name: 'Rival FC' },
        matchDate: '2026-09-01T15:00:00.000Z',
        Gift: null,
    } as unknown as SaleListItem;
}

describe('passCostPerMatch', () => {
    describe('when 19 matches are given', () => {
        it('divides the pass price by the match count', () => {
            expect(passCostPerMatch(190, 19)).toBe(10);
        });
    });

    describe('when zero matches are given', () => {
        it('returns 0', () => {
            expect(passCostPerMatch(190, 0)).toBe(0);
        });
    });
});

describe('stripSegments', () => {
    describe('when a match has no sale', () => {
        it('gives the segment a null status', () => {
            const segments = stripSegments(
                [match('m1', 'Rival FC', '2026-09-01')],
                {},
                null,
            );

            expect(segments).toHaveLength(1);
            expect(segments[0]?.status).toBeNull();
            expect(segments[0]?.opponent).toBe('Rival FC');
        });
    });

    describe('when SOLD and PENDING sales share a match', () => {
        it('gives the segment status SOLD', () => {
            const segments = stripSegments(
                [match('m1', 'Rival FC', '2026-09-01')],
                { m1: [sale('s1', 'm1', 'PENDING'), sale('s2', 'm1', 'SOLD')] },
                null,
            );

            expect(segments[0]?.status).toBe('SOLD');
        });
    });

    describe('when the break-even match is given', () => {
        it('flags only that segment', () => {
            const segments = stripSegments(
                [
                    match('m1', 'A', '2026-09-01'),
                    match('m2', 'B', '2026-09-08'),
                    match('m3', 'C', '2026-09-15'),
                ],
                {},
                'm2' as MatchId,
            );

            expect(segments.map((segment) => segment.isBreakEven)).toEqual([
                false,
                true,
                false,
            ]);
        });
    });

    describe('when two matches are given', () => {
        it('returns one segment per match in input order', () => {
            const segments = stripSegments(
                [match('m1', 'A', '2026-09-01'), match('m2', 'B', '2026-09-08')],
                {},
                null,
            );

            expect(segments.map((segment) => segment.matchId)).toEqual(['m1', 'm2']);
            expect(segments.map((segment) => segment.date)).toEqual([
                '2026-09-01',
                '2026-09-08',
            ]);
        });
    });
});

describe('tableGroups', () => {
    describe('when a match has two sales', () => {
        it('returns one group holding both sales in input order', () => {
            const groups = tableGroups([match('m1', 'Rival FC', '2026-09-01')], {
                m1: [sale('s1', 'm1', 'SOLD'), sale('s2', 'm1', 'GIFTED')],
            });

            expect(groups).toHaveLength(1);
            expect(groups[0]?.sales.map((row) => row.id)).toEqual(['s1', 's2']);
            expect(groups[0]?.competition).toBe('CHAMPIONSHIP');
        });
    });

    describe('when a match has no sale', () => {
        it('omits the match', () => {
            const groups = tableGroups([match('m1', 'Rival FC', '2026-09-01')], {
                m1: [],
            });

            expect(groups).toEqual([]);
        });
    });

    describe('when a sale references a match missing from the list', () => {
        it('appends the orphan group last', () => {
            const groups = tableGroups([match('m1', 'A', '2026-09-01')], {
                m1: [sale('s1', 'm1', 'SOLD')],
                orphan: [sale('s2', 'orphan', 'SOLD')],
            });

            expect(groups.map((group) => group.matchId)).toEqual(['m1', 'orphan']);
            expect(groups[1]?.opponent).toBe('Rival FC');
            expect(groups[1]?.date).toBe('2026-09-01T15:00:00.000Z');
        });
    });
});

describe('homeMatchCount', () => {
    describe('when the list mixes home and away matches', () => {
        it('counts only the home matches', () => {
            const matches = [
                match('m1', 'A', '2026-09-01'),
                match('m2', 'B', '2026-09-08', false),
                match('m3', 'C', '2026-09-15'),
            ];

            expect(homeMatchCount(matches)).toBe(2);
        });
    });

    describe('when every match is away', () => {
        it('returns 0', () => {
            expect(homeMatchCount([match('m1', 'A', '2026-09-01', false)])).toBe(0);
        });
    });

    describe('when the list is empty', () => {
        it('returns 0', () => {
            expect(homeMatchCount([])).toBe(0);
        });
    });
});
