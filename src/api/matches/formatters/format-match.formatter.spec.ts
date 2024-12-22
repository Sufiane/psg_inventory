import { formatMatch } from './format-match.formatter';
import { Competition } from '@prisma/client';
import { Match } from '../../../db/matches/types/match.type';

describe('formatMatch', () => {
    describe('withResult is false', () => {
        it('should return a formatted match', () => {
            const payload = {
                id: 'id',
                date: new Date('2022-02-02'),
                atHome: true,
                competition: Competition.CHAMPIONSHIP,
                Opponent: {
                    name: 'opName',
                },
            } as Match;
            const expectedResult = {
                id: payload.id,
                date: payload.date.toISOString(),
                atHome: payload.atHome,
                competition: payload.competition,
                opponent: payload.Opponent.name,
                result: undefined,
            };

            expect(formatMatch(payload, false)).toEqual(expectedResult);
        });
    });

    describe('withResult is true', () => {
        it('should return a formatted match', () => {
            const payload = {
                id: 'id',
                date: new Date('2022-02-02'),
                atHome: true,
                competition: Competition.CHAMPIONSHIP,
                Opponent: {
                    name: 'opName',
                },
                MatchResults: {
                    isWin: true,
                    score: '1 - 2',
                },
            };
            const expectedResult = {
                id: payload.id,
                date: payload.date.toISOString(),
                atHome: payload.atHome,
                competition: payload.competition,
                opponent: payload.Opponent.name,
                result: {
                    isWin: payload.MatchResults.isWin,
                    score: payload.MatchResults.score,
                },
            };

            expect(formatMatch(payload as Match, true)).toEqual(expectedResult);
        });
    });
});
