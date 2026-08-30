import { buildAskContext } from './build-context';
import type { BuildAskContextInput } from './build-context';
import type { TimePeriodAccounting } from '../../accounting/types/time-period-accounting.type';
import type { Amortization } from '../../accounting/types/amortization.type';
import type { FormattedMatch } from '../../matches/types/formatted-match.type';

const emptyPeriod = {
    realized: null,
    unrealized: null,
    pending: null,
    seasonInvestments: [],
    totalSeasonInvestment: 0,
    leadTime: null,
} as unknown as TimePeriodAccounting;

const populatedPeriod = {
    realized: {
        totalSales: 12,
        totalProfit: 840,
        totalInvest: 300,
        totalNbTickets: 24,
        averageTicketPrice: 95,
        averageProfit: 70,
        highest: {
            price: 260,
            profit: 180,
            match: {
                opponent: 'Marseille',
                date: new Date('2026-03-15T20:00:00.000Z'),
                atHome: true,
                competition: 'CHAMPIONSHIP',
            },
        },
        lowest: {
            price: 60,
            profit: 5,
            match: {
                opponent: 'Lorient',
                date: new Date('2026-01-10T18:00:00.000Z'),
                atHome: true,
                competition: 'CHAMPIONSHIP',
            },
        },
    },
    unrealized: null,
    pending: null,
    seasonInvestments: [
        {
            id: 'pass-1',
            price: 900,
            seasonStartYear: 2025,
            label: 'Auteuil',
            category: 'CAT1',
            row: 'D',
            seat: '12',
        },
    ],
    totalSeasonInvestment: 900,
    leadTime: {
        soldCount: 12,
        avgLeadDays: 6.5,
        medianLeadDays: 5,
        minLeadDays: 1,
        maxLeadDays: 21,
    },
} as unknown as TimePeriodAccounting;

const amortization = {
    seasonStartYear: 2025,
    passPrice: 900,
    hasPass: true,
    totalRealized: 840,
    progress: 0.93,
    remaining: 60,
    surplus: 0,
    breakEven: null,
    perMatch: [],
    passes: [{ id: 'pass-1', label: 'Auteuil', price: 900 }],
} as unknown as Amortization;

const matches: FormattedMatch[] = [
    {
        id: 'match-1',
        date: '2026-03-15T20:00:00.000Z',
        atHome: true,
        competition: 'CHAMPIONSHIP',
        opponent: 'Marseille',
        result: { isWin: true, score: '2-0' },
    },
    {
        id: 'match-2',
        date: '2026-09-01T20:00:00.000Z',
        atHome: false,
        competition: 'CHAMPIONS_LEAGUE',
        opponent: 'Arsenal',
        result: undefined,
    },
];

function makeInput(overrides: Partial<BuildAskContextInput> = {}): BuildAskContextInput {
    return {
        currentSeason: populatedPeriod,
        allTime: populatedPeriod,
        amortization,
        matches,
        seasonWindow: {
            start: new Date('2025-08-01T00:00:00.000Z'),
            end: new Date('2026-07-31T00:00:00.000Z'),
        },
        generatedAt: new Date('2026-03-20T12:00:00.000Z'),
        ...overrides,
    };
}

describe('buildAskContext', () => {
    describe('when the user has sales, a pass and fixtures', () => {
        it('reports the resolved season window as ISO strings', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.season.startDate).toBe('2025-08-01T00:00:00.000Z');
            expect(askContext.season.endDate).toBe('2026-07-31T00:00:00.000Z');
            expect(askContext.season.startYear).toBe(2025);
        });

        it('marks the currency and generation time', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.currency).toBe('EUR');
            expect(askContext.generatedAt).toBe('2026-03-20T12:00:00.000Z');
        });

        it('carries the realized totals for the current season', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.currentSeason.realized).toEqual({
                totalSales: 12,
                totalProfit: 840,
                totalInvest: 300,
                totalNbTickets: 24,
                averageTicketPrice: 95,
                averageProfit: 70,
                highest: {
                    price: 260,
                    profit: 180,
                    opponent: 'Marseille',
                    date: '2026-03-15T20:00:00.000Z',
                    atHome: true,
                    competition: 'CHAMPIONSHIP',
                },
                lowest: {
                    price: 60,
                    profit: 5,
                    opponent: 'Lorient',
                    date: '2026-01-10T18:00:00.000Z',
                    atHome: true,
                    competition: 'CHAMPIONSHIP',
                },
            });
        });

        it('carries the amortization progress', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.amortization).toEqual({
                passPrice: 900,
                hasPass: true,
                totalRealized: 840,
                progress: 0.93,
                remaining: 60,
                surplus: 0,
                brokeEven: false,
            });
        });

        it('splits fixtures into played and upcoming relative to generatedAt', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.matches.played).toEqual([
                {
                    date: '2026-03-15T20:00:00.000Z',
                    opponent: 'Marseille',
                    atHome: true,
                    competition: 'CHAMPIONSHIP',
                    score: '2-0',
                    isWin: true,
                },
            ]);
            expect(askContext.matches.upcoming).toEqual([
                {
                    date: '2026-09-01T20:00:00.000Z',
                    opponent: 'Arsenal',
                    atHome: false,
                    competition: 'CHAMPIONS_LEAGUE',
                },
            ]);
        });

        it('carries the lead time', () => {
            const askContext = buildAskContext(makeInput());

            expect(askContext.currentSeason.leadTime).toEqual({
                soldCount: 12,
                avgLeadDays: 6.5,
                medianLeadDays: 5,
                minLeadDays: 1,
                maxLeadDays: 21,
            });
        });

        it('never leaks identity fields into the payload', () => {
            const serialized = JSON.stringify(buildAskContext(makeInput()));

            expect(serialized).not.toContain('userId');
            expect(serialized).not.toContain('user_id');
            expect(serialized).not.toContain('email');
            expect(serialized).not.toContain('password');
        });
    });

    describe('when the user has no sales and no pass', () => {
        const input = makeInput({
            currentSeason: emptyPeriod,
            allTime: emptyPeriod,
            amortization: { ...amortization, hasPass: false, passPrice: 0 },
        });

        it('reports null accounting blocks rather than zeroed ones', () => {
            const askContext = buildAskContext(input);

            expect(askContext.currentSeason.realized).toBeNull();
            expect(askContext.currentSeason.unrealized).toBeNull();
            expect(askContext.currentSeason.pending).toBeNull();
        });

        it('reports no season investment', () => {
            const askContext = buildAskContext(input);

            expect(askContext.currentSeason.totalSeasonInvestment).toBe(0);
            expect(askContext.currentSeason.seasonPasses).toEqual([]);
        });

        it('reports the pass as absent', () => {
            const askContext = buildAskContext(input);

            expect(askContext.amortization.hasPass).toBe(false);
        });
    });

    describe('when the season pass has been paid off', () => {
        it('marks brokeEven true', () => {
            const askContext = buildAskContext(
                makeInput({
                    amortization: {
                        ...amortization,
                        breakEven: {
                            matchId: 'match-1',
                            date: new Date('2026-03-15T20:00:00.000Z'),
                            opponent: 'Marseille',
                            cumulative: 910,
                        },
                    } as unknown as Amortization,
                }),
            );

            expect(askContext.amortization.brokeEven).toBe(true);
        });
    });
});
