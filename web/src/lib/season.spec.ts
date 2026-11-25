import { describe, expect, it } from 'vitest';
import type { SeasonYear } from '@psg/shared/time';
import {
    carrySeason,
    parseSeasonParam,
    resolveSeason,
    resolveSeasonYear,
    retainedParams,
    seasonChoices,
    seasonOptions,
    seasonScope,
} from './season';

describe('seasonOptions', () => {
    describe('when now is in November 2026', () => {
        it('starts at 2026/2027', () => {
            const options = seasonOptions(new Date('2026-11-20T12:00:00Z'), 3);

            expect(options[0]).toEqual({ year: 2026, label: '2026/2027' });
        });

        it('lists seasons newest first', () => {
            const options = seasonOptions(new Date('2026-11-20T12:00:00Z'), 3);

            expect(options.map((option) => option.label)).toEqual([
                '2026/2027',
                '2025/2026',
                '2024/2025',
            ]);
        });
    });

    describe('when now is in March 2027', () => {
        it('starts at the season that began in 2026', () => {
            const options = seasonOptions(new Date('2027-03-10T12:00:00Z'), 2);

            expect(options[0].year).toBe(2026);
        });
    });

    describe('when count is 1', () => {
        it('returns a single option', () => {
            expect(seasonOptions(new Date('2026-11-20T12:00:00Z'), 1)).toHaveLength(1);
        });
    });

    describe('when count is 0', () => {
        it('returns no options', () => {
            expect(seasonOptions(new Date('2026-11-20T12:00:00Z'), 0)).toEqual([]);
        });
    });
});

function urlWithYear(value: string | null): URL {
    return new URL(value === null ? 'https://x/sales' : `https://x/sales?year=${value}`);
}

describe('parseSeasonParam', () => {
    describe('when year is 2025', () => {
        it('returns 2025', () => {
            expect(parseSeasonParam(urlWithYear('2025'))).toBe(2025);
        });
    });

    describe('when year is all', () => {
        it('returns all', () => {
            expect(parseSeasonParam(urlWithYear('all'))).toBe('all');
        });
    });

    describe.each(['0', 'abc', '2025abc', '12345', '', null])(
        'when year is %j',
        (value) => {
            it('returns null', () => {
                expect(parseSeasonParam(urlWithYear(value))).toBeNull();
            });
        },
    );
});

describe('resolveSeason', () => {
    const now = new Date('2026-11-20T12:00:00Z');

    describe('when year is absent', () => {
        it('returns the current season', () => {
            expect(resolveSeason(urlWithYear(null), true, now)).toBe(2026);
        });
    });

    describe('when year is 2024', () => {
        it('returns 2024', () => {
            expect(resolveSeason(urlWithYear('2024'), false, now)).toBe(2024);
        });
    });

    describe('when year is all and all is allowed', () => {
        it('returns all', () => {
            expect(resolveSeason(urlWithYear('all'), true, now)).toBe('all');
        });
    });

    describe('when year is all and all is not allowed', () => {
        it('returns the current season', () => {
            expect(resolveSeason(urlWithYear('all'), false, now)).toBe(2026);
        });
    });

    describe('when now is March 2027 and year is absent', () => {
        it('returns the season that began in 2026', () => {
            expect(
                resolveSeason(urlWithYear(null), true, new Date('2027-03-10T12:00:00Z')),
            ).toBe(2026);
        });
    });
});

describe('seasonScope', () => {
    describe.each(['/dashboard', '/matches', '/season'])('when path is %s', (path) => {
        it('is season', () => {
            expect(seasonScope(path)).toBe('season');
        });
    });

    describe.each(['/sales', '/accounting', '/sales/'])('when path is %s', (path) => {
        it('is season-or-all', () => {
            expect(seasonScope(path)).toBe('season-or-all');
        });
    });

    describe.each(['/sales/new', '/sales/abc', '/matches/abc', '/admin/matches', '/'])(
        'when path is %s',
        (path) => {
            it('is none', () => {
                expect(seasonScope(path)).toBe('none');
            });
        },
    );
});

describe('carrySeason', () => {
    describe('when the current url has year 2025', () => {
        const from = new URL('https://x/sales?year=2025');

        it('appends year to a season route', () => {
            expect(carrySeason('/matches', from)).toBe('/matches?year=2025');
        });

        it('leaves a none route unchanged', () => {
            expect(carrySeason('/admin/matches', from)).toBe('/admin/matches');
        });

        it('appends year after existing params', () => {
            expect(carrySeason('/sales?status=SOLD', from)).toBe(
                '/sales?status=SOLD&year=2025',
            );
        });
    });

    describe('when the href already has a year', () => {
        it('replaces it without duplicating', () => {
            expect(
                carrySeason(
                    '/sales?year=2024&status=SOLD',
                    new URL('https://x/matches?year=2025'),
                ),
            ).toBe('/sales?year=2025&status=SOLD');
        });
    });

    describe('when the href has a hash', () => {
        it('keeps the hash after the query', () => {
            expect(
                carrySeason('/sales#top', new URL('https://x/matches?year=2025')),
            ).toBe('/sales?year=2025#top');
            expect(
                carrySeason(
                    '/sales?status=SOLD#top',
                    new URL('https://x/matches?year=2025'),
                ),
            ).toBe('/sales?status=SOLD&year=2025#top');
        });
    });

    describe('when the current url has year all', () => {
        const from = new URL('https://x/sales?year=all');

        it('carries all to a season-or-all route', () => {
            expect(carrySeason('/accounting', from)).toBe('/accounting?year=all');
        });

        it('drops all for a season-only route', () => {
            expect(carrySeason('/dashboard', from)).toBe('/dashboard');
        });
    });

    describe('when the current url has no year', () => {
        it('leaves the href unchanged', () => {
            expect(carrySeason('/matches', new URL('https://x/sales'))).toBe('/matches');
        });
    });
});

describe('retainedParams', () => {
    describe('when the url mixes retained and transient params', () => {
        it('returns only whitelisted pairs in whitelist order', () => {
            const url = new URL(
                'https://x/matches?year=2025&venue=home&edit=abc&status=SOLD&competition=Ligue%201',
            );

            expect(retainedParams(url)).toEqual([
                ['venue', 'home'],
                ['competition', 'Ligue 1'],
                ['status', 'SOLD'],
            ]);
        });
    });
});

describe('seasonChoices', () => {
    const now = new Date('2026-11-20T12:00:00Z');

    describe('when selected is inside the list', () => {
        it('returns three choices', () => {
            expect(seasonChoices(now, 3, 2025 as SeasonYear)).toHaveLength(3);
        });
    });

    describe('when selected is 2018', () => {
        it('appends 2018 last', () => {
            const choices = seasonChoices(now, 3, 2018 as SeasonYear);

            expect(choices).toHaveLength(4);
            expect(choices[3]).toEqual({ year: 2018, label: '2018/2019' });
        });
    });

    describe('when selected is null', () => {
        it('returns three choices', () => {
            expect(seasonChoices(now, 3, null)).toHaveLength(3);
        });
    });
});

describe('resolveSeasonYear', () => {
    const now = new Date('2026-11-20T12:00:00Z');

    describe('when year is 2024', () => {
        it('returns 2024', () => {
            expect(resolveSeasonYear(urlWithYear('2024'), now)).toBe(2024);
        });
    });

    describe('when year is all', () => {
        it('returns the current season', () => {
            expect(resolveSeasonYear(urlWithYear('all'), now)).toBe(2026);
        });
    });

    describe('when year is absent', () => {
        it('returns the current season', () => {
            expect(resolveSeasonYear(urlWithYear(null), now)).toBe(2026);
        });
    });
});
