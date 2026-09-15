import type { Match } from '../../db/matches/types/match.type';
import type { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import type { MatchId, OpponentId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';
import type { TicketCount } from '@psg/shared/counts';
import type { IsoDateString } from '@psg/shared/time';
import type { RawImportRow } from './sales-import.csv';
import type { DraftRowDto } from './dto/draft-row.dto';
import { resolveDraftRows, validateCommitRows } from './sales-import.resolver';

function makeMatch(overrides: { id: string; date: string; opponentName: string }): Match {
    return {
        id: overrides.id as MatchId,
        opponentId: 'op-1' as OpponentId,
        atHome: true,
        date: new Date(overrides.date),
        competition: 'CHAMPIONSHIP',
        Opponent: {
            id: 'op-1' as OpponentId,
            name: overrides.opponentName as Match['Opponent']['name'],
        },
        MatchResults: null,
    } as unknown as Match;
}

function makePass(id: string): SeasonPass {
    return {
        id: id as SeasonPassId,
        userId: 'user-1' as UserId,
        seasonStartYear: 2025,
        price: 800,
        label: 'Section A',
        category: 'A',
        row: '1',
        seat: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
    } as SeasonPass;
}

function makeRow(overrides: Partial<RawImportRow>): RawImportRow {
    return {
        rowIndex: 0,
        date: '2025-09-14',
        opponent: 'Marseille',
        listedPrice: 120 as ListedPrice,
        nbTickets: 1 as TicketCount,
        status: 'SOLD',
        invest: 0 as Invest,
        soldAt: null,
        recipient: null,
        ...overrides,
    };
}

function makeDraftRow(overrides: Partial<DraftRowDto>): DraftRowDto {
    return {
        rowIndex: 0,
        date: '2025-09-14',
        opponent: 'Marseille',
        listedPrice: 120,
        nbTickets: 1,
        invest: 0,
        status: 'SOLD',
        allocations: [{ seasonPassId: 'pass-a', nbTickets: 1 }],
        rowStatus: 'ok',
        ...overrides,
    } as DraftRowDto;
}

const marseille = makeMatch({
    id: 'm1',
    date: '2025-09-14',
    opponentName: 'Marseille',
});
const lyon = makeMatch({ id: 'm2', date: '2025-09-21', opponentName: 'Lyon' });
const passA = makePass('pass-a');
const passB = makePass('pass-b');

describe('resolveDraftRows', () => {
    it('resolves a single match on a unique date', () => {
        const rows = [makeRow({})];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille, lyon],
            selectedPassIds: [passA.id],
        });

        expect(result.rows[0]!.matchId).toBe('m1');
        expect(result.rows[0]!.rowStatus).toBe('ok');
        expect(result.rows[0]!.allocations).toEqual([
            { seasonPassId: 'pass-a', nbTickets: 1 },
        ]);
    });

    it('flags a mismatched opponent as warn', () => {
        const rows = [makeRow({ opponent: 'Marsailles' })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id],
        });

        expect(result.rows[0]!.matchId).toBe('m1');
        expect(result.rows[0]!.rowStatus).toBe('warn:opponent-mismatch');
    });

    it('flags an unknown date as error:match-missing', () => {
        const rows = [makeRow({ date: '2025-12-25' })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id],
        });

        expect(result.rows[0]!.matchId).toBeUndefined();
        expect(result.rows[0]!.rowStatus).toBe('error:match-missing');
    });

    it('defaults nb=1 to first pass and marks ok', () => {
        const rows = [makeRow({ nbTickets: 1 as TicketCount })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id, passB.id],
        });

        expect(result.rows[0]!.allocations).toEqual([
            { seasonPassId: 'pass-a', nbTickets: 1 },
        ]);
        expect(result.rows[0]!.rowStatus).toBe('ok');
    });

    it('warns on nb>1 with single pass and assigns everything to it', () => {
        const rows = [makeRow({ nbTickets: 2 as TicketCount })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id],
        });

        expect(result.rows[0]!.allocations).toEqual([
            { seasonPassId: 'pass-a', nbTickets: 2 },
        ]);
        expect(result.rows[0]!.rowStatus).toBe('warn:multi-ticket-single-pass');
    });

    it('errors on nb>1 with multi-pass and leaves allocations empty', () => {
        const rows = [makeRow({ nbTickets: 3 as TicketCount })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id, passB.id],
        });

        expect(result.rows[0]!.allocations).toEqual([]);
        expect(result.rows[0]!.rowStatus).toBe('error:unallocated');
    });

    it('flags invalid cells (nb=0, negative price)', () => {
        const rows = [makeRow({ nbTickets: 0 as TicketCount })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id],
        });

        expect(result.rows[0]!.rowStatus).toBe('error:invalid-cell');
    });

    it('accepts an optional soldAt on or before the match date', () => {
        const rows = [makeRow({ soldAt: '2025-09-10' as IsoDateString })];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id],
        });

        expect(result.rows[0]!.rowStatus).toBe('ok');
        expect(result.rows[0]!.soldAt).toBe('2025-09-10');
    });

    describe('kickoff guard on soldAt', () => {
        describe('when the row status is SOLD', () => {
            it('flags a soldAt after the match date as error:sold-after-kickoff', () => {
                const rows = [
                    makeRow({ status: 'SOLD', soldAt: '2025-09-15' as IsoDateString }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:sold-after-kickoff');
            });
        });

        describe('when the row status is GIFTED', () => {
            it('flags a soldAt after the match date as error:sold-after-kickoff', () => {
                const rows = [
                    makeRow({
                        status: 'GIFTED',
                        soldAt: '2025-09-15' as IsoDateString,
                        recipient: 'Marc',
                    }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:sold-after-kickoff');
            });

            it('imports cleanly with a soldAt on the match date', () => {
                const rows = [
                    makeRow({
                        status: 'GIFTED',
                        soldAt: '2025-09-14' as IsoDateString,
                        recipient: 'Marc',
                    }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('ok');
            });
        });

        // Regression coverage: no status is exempt from this guard (design doc
        // D5, revised 2026-09-12 — GIFTED used to be exempt and no longer is).
        // An earlier version of resolveSoldAtStatus exempted any status that
        // wasn't SOLD, which silently let a PENDING/CANCELLED row with a
        // post-kickoff soldAt import clean, discarding the date at commit
        // instead of flagging it as it did before this feature.
        describe('when the row status is PENDING', () => {
            it('flags a soldAt after the match date as error:sold-after-kickoff', () => {
                const rows = [
                    makeRow({ status: 'PENDING', soldAt: '2025-09-15' as IsoDateString }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:sold-after-kickoff');
            });
        });

        describe('when the row status is CANCELLED', () => {
            it('flags a soldAt after the match date as error:sold-after-kickoff', () => {
                const rows = [
                    makeRow({
                        status: 'CANCELLED',
                        soldAt: '2025-09-15' as IsoDateString,
                    }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:sold-after-kickoff');
            });
        });
    });

    it('lists missing matches in coverage', () => {
        const rows = [makeRow({})];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille, lyon],
            selectedPassIds: [passA.id],
        });

        expect(result.missingMatches.map((match) => match.matchId)).toEqual(['m2']);
    });

    it('counts summary correctly', () => {
        const rows = [
            makeRow({ rowIndex: 0 }),
            makeRow({ rowIndex: 1, date: '2025-12-25' }),
            makeRow({ rowIndex: 2, nbTickets: 2 as TicketCount }),
        ];
        const result = resolveDraftRows({
            rawRows: rows,
            homeMatches: [marseille],
            selectedPassIds: [passA.id],
        });

        expect(result.summary).toEqual({ total: 3, errors: 1, warnings: 1 });
    });

    describe('gift recipient requirement', () => {
        describe('when the row is GIFTED with no recipient', () => {
            it('reports error:gift-recipient-missing', () => {
                const rows = [makeRow({ status: 'GIFTED', recipient: null })];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:gift-recipient-missing');
            });
        });

        describe('when the row is GIFTED with a whitespace-only recipient', () => {
            it('reports error:gift-recipient-missing', () => {
                const rows = [makeRow({ status: 'GIFTED', recipient: '   ' })];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:gift-recipient-missing');
            });
        });

        describe('when the row is GIFTED with a recipient', () => {
            it('reports ok', () => {
                const rows = [makeRow({ status: 'GIFTED', recipient: 'Marc' })];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('ok');
            });
        });

        describe('when the row is SOLD with a recipient', () => {
            it('reports ok, ignoring the value', () => {
                const rows = [makeRow({ status: 'SOLD', recipient: 'Marc' })];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('ok');
            });
        });

        // Pins the precedence itself, not just each branch: a row tripping
        // both checks must report the recipient, and must do so identically
        // here and in validateCommitRows, or the preview and the commit
        // disagree about the same row.
        describe('when the row is GIFTED with no recipient and a post-kickoff soldAt', () => {
            it('reports error:gift-recipient-missing, not error:sold-after-kickoff', () => {
                const rows = [
                    makeRow({
                        status: 'GIFTED',
                        recipient: null,
                        soldAt: '2025-09-15' as IsoDateString,
                    }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:gift-recipient-missing');
            });
        });
    });
});

describe('validateCommitRows', () => {
    describe('gift recipient requirement', () => {
        describe('when the row is GIFTED with no recipient', () => {
            it('reports error:gift-recipient-missing', () => {
                const rows = [makeDraftRow({ status: 'GIFTED' })];
                const result = validateCommitRows({
                    rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:gift-recipient-missing');
            });
        });

        describe('when the row is GIFTED with a whitespace-only recipient', () => {
            it('reports error:gift-recipient-missing', () => {
                const rows = [makeDraftRow({ status: 'GIFTED', recipient: '   ' })];
                const result = validateCommitRows({
                    rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:gift-recipient-missing');
            });
        });

        describe('when the row is GIFTED with a recipient', () => {
            it('reports ok', () => {
                const rows = [makeDraftRow({ status: 'GIFTED', recipient: 'Marc' })];
                const result = validateCommitRows({
                    rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('ok');
            });
        });

        describe('when the row is SOLD with a recipient', () => {
            it('reports ok, ignoring the value', () => {
                const rows = [makeDraftRow({ status: 'SOLD', recipient: 'Marc' })];
                const result = validateCommitRows({
                    rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('ok');
            });
        });

        // The commit-side half of the precedence pin — same row shape and same
        // expectation as the resolveDraftRows case above. If the two checks are
        // ever reordered in only one of the two functions, one of these fails.
        describe('when the row is GIFTED with no recipient and a post-kickoff soldAt', () => {
            it('reports error:gift-recipient-missing, not error:sold-after-kickoff', () => {
                const rows = [makeDraftRow({ status: 'GIFTED', soldAt: '2025-09-15' })];
                const result = validateCommitRows({
                    rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:gift-recipient-missing');
            });
        });
    });
});
