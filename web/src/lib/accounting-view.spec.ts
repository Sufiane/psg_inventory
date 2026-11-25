import { describe, expect, it } from 'vitest';
import type { MatchId } from '@psg/shared/ids';
import {
    filterSegments,
    hiddenWithSales,
    homeMatchCount,
    parseVenue,
    passCostPerMatch,
    stripOpponent,
    stripSegments,
    tableGroups,
    upcomingIndex,
    venueHref,
    type StripSegment,
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

    describe('when the match is away', () => {
        it('gives the segment atHome false', () => {
            const segments = stripSegments(
                [match('m1', 'Rival FC', '2026-09-01', false)],
                {},
                null,
            );

            expect(segments[0]?.atHome).toBe(false);
        });
    });

    describe('when the match is at home', () => {
        it('gives the segment atHome true', () => {
            const segments = stripSegments(
                [match('m1', 'Rival FC', '2026-09-01', true)],
                {},
                null,
            );

            expect(segments[0]?.atHome).toBe(true);
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

describe('upcomingIndex', () => {
    function segment(id: string, date: string): StripSegment {
        return {
            matchId: id as MatchId,
            opponent: id,
            date,
            status: null,
            isBreakEven: false,
            atHome: true,
        };
    }

    const today = new Date(2026, 8, 10, 14, 0);

    describe('when some fixtures are today or later', () => {
        it('returns the index of the first of them', () => {
            const segments = [
                segment('m1', new Date(2026, 8, 1, 20, 0).toISOString()),
                segment('m2', new Date(2026, 8, 15, 20, 0).toISOString()),
                segment('m3', new Date(2026, 8, 22, 20, 0).toISOString()),
            ];

            expect(upcomingIndex(segments, today)).toBe(1);
        });
    });

    describe('when a fixture is today but earlier in the day', () => {
        it('returns that fixture', () => {
            const segments = [
                segment('m1', new Date(2026, 8, 1, 20, 0).toISOString()),
                segment('m2', new Date(2026, 8, 10, 9, 0).toISOString()),
                segment('m3', new Date(2026, 8, 22, 20, 0).toISOString()),
            ];

            expect(upcomingIndex(segments, today)).toBe(1);
        });
    });

    describe('when all fixtures are past', () => {
        it('returns the last index', () => {
            const segments = [
                segment('m1', new Date(2026, 8, 1, 20, 0).toISOString()),
                segment('m2', new Date(2026, 8, 5, 20, 0).toISOString()),
            ];

            expect(upcomingIndex(segments, today)).toBe(1);
        });
    });

    describe('when there are no segments', () => {
        it('returns -1', () => {
            expect(upcomingIndex([], today)).toBe(-1);
        });
    });
});

function venueSegment(
    id: string,
    atHome: boolean,
    status: SaleStatus | null = null,
): StripSegment {
    return {
        matchId: id as MatchId,
        opponent: id,
        date: '2026-09-01',
        status,
        isBreakEven: false,
        atHome,
    };
}

describe('parseVenue', () => {
    describe('when the value is a known venue', () => {
        it.each(['home', 'away', 'both'] as const)('passes %s through', (value) => {
            expect(parseVenue(value)).toBe(value);
        });
    });

    describe('when the value is null', () => {
        it('returns both', () => {
            expect(parseVenue(null)).toBe('both');
        });
    });

    describe('when the value is unknown', () => {
        it('returns both', () => {
            expect(parseVenue('garbage')).toBe('both');
        });
    });
});

describe('filterSegments', () => {
    const segments = [
        venueSegment('m1', true),
        venueSegment('m2', false),
        venueSegment('m3', true),
    ];

    describe('when the venue is both', () => {
        it('returns every segment in order', () => {
            expect(filterSegments(segments, 'both')).toEqual(segments);
        });
    });

    describe('when the venue is home', () => {
        it('keeps only home segments', () => {
            expect(
                filterSegments(segments, 'home').map((segment) => segment.matchId),
            ).toEqual(['m1', 'm3']);
        });
    });

    describe('when the venue is away', () => {
        it('keeps only away segments', () => {
            expect(
                filterSegments(segments, 'away').map((segment) => segment.matchId),
            ).toEqual(['m2']);
        });
    });

    describe('when the list is empty', () => {
        it('returns an empty list', () => {
            expect(filterSegments([], 'home')).toEqual([]);
        });
    });
});

describe('hiddenWithSales', () => {
    const segments = [
        venueSegment('m1', true, 'SOLD'),
        venueSegment('m2', false, 'PENDING'),
        venueSegment('m3', false),
        venueSegment('m4', false, 'SOLD'),
    ];

    describe('when the venue is both', () => {
        it('returns 0', () => {
            expect(hiddenWithSales(segments, 'both')).toBe(0);
        });
    });

    describe('when the venue is home', () => {
        it('counts away segments that have a sale', () => {
            expect(hiddenWithSales(segments, 'home')).toBe(2);
        });
    });

    describe('when the venue is away', () => {
        it('counts home segments that have a sale', () => {
            expect(hiddenWithSales(segments, 'away')).toBe(1);
        });
    });
});

describe('venueHref', () => {
    describe('when setting home', () => {
        it('adds venue and keeps year', () => {
            const href = venueHref(new URL('http://x.test/accounting?year=2025'), 'home');

            expect(href).toBe('/accounting?year=2025&venue=home');
        });
    });

    describe('when setting both', () => {
        it('removes venue and keeps other params', () => {
            const href = venueHref(
                new URL('http://x.test/accounting?venue=away&view=table'),
                'both',
            );

            expect(href).toBe('/accounting?view=table');
        });
    });

    describe('when no params remain', () => {
        it('returns the bare path', () => {
            expect(
                venueHref(new URL('http://x.test/accounting?venue=away'), 'both'),
            ).toBe('/accounting');
        });
    });
});

describe('stripOpponent', () => {
    describe('when the match is away', () => {
        it('prefixes the opponent with @', () => {
            expect(stripOpponent({ ...venueSegment('Rival FC', false) })).toBe(
                '@ Rival FC',
            );
        });
    });

    describe('when the match is at home', () => {
        it('returns the opponent unchanged', () => {
            expect(stripOpponent({ ...venueSegment('Rival FC', true) })).toBe('Rival FC');
        });
    });
});
