import { Competition } from '@prisma/client';
import { MatchesService } from './matches.service';
import { Test } from '@nestjs/testing';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Match } from '../../db/matches/types/match.type';
import { getSeasonWindow } from '../../shared/utils/season.utils';
import { formatMatch } from './formatters/format-match.formatter';
import type { SeasonYear } from '@psg/shared/time';

describe('MatchesService', () => {
    let service: MatchesService;
    let matchsDbService: DeepMockProxy<MatchsDbService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                MatchesService,
                {
                    provide: IMatchesDbService,
                    useValue: mockDeep<MatchsDbService>(),
                },
            ],
        }).compile();

        service = module.get(MatchesService);
        matchsDbService = module.get(IMatchesDbService);
    });

    describe('getSeasonMatches', () => {
        describe('when called with a season start year', () => {
            it('queries the exclusive Aug-to-Aug window for that season', async () => {
                const dbResult = [] as Match[];
                matchsDbService.getMatches.mockResolvedValue(dbResult);

                await expect(
                    service.getSeasonMatches(2022 as SeasonYear),
                ).resolves.toEqual(dbResult);

                const window = getSeasonWindow(2022 as SeasonYear, 'exclusive');

                expect(matchsDbService.getMatches).toHaveBeenCalledTimes(1);
                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    { from: window.start, to: window.end },
                    false,
                );
            });

            it('shares the exact Aug 1 UTC boundary with the next season, so the two cannot overlap', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getSeasonMatches(2022 as SeasonYear);

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    expect.objectContaining({
                        to: getSeasonWindow(2023 as SeasonYear, 'exclusive').start,
                    }),
                    false,
                );
            });
        });

        describe('when withResult is true', () => {
            it('forwards the flag to the db layer', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getSeasonMatches(2022 as SeasonYear, true);

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    expect.anything(),
                    true,
                );
            });
        });
    });

    describe('getCurrentSeason', () => {
        const playedMatch = {
            id: 'match-id',
            date: new Date('2025-09-13T19:00:00.000Z'),
            atHome: true,
            competition: Competition.CHAMPIONSHIP,
            Opponent: { name: 'Marseille' },
        } as Match;

        afterEach(() => {
            jest.useRealTimers();
        });

        describe('when the calendar date is before August', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
            });

            it('requests the season that started the previous August', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date('2025-08-01T00:00:00.000Z'),
                        to: new Date('2026-08-01T00:00:00.000Z'),
                    },
                    false,
                );
            });

            it('starts the window at the season start, never at the current instant', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();

                const [dates] = matchsDbService.getMatches.mock.calls[0]!;

                expect(dates.from).toEqual(
                    getSeasonWindow(2025 as SeasonYear, 'exclusive').start,
                );
                expect(dates.from).not.toEqual(new Date('2026-07-29T00:00:00.000Z'));
            });
        });

        describe('when the calendar date is exactly the August 1 boundary', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
            });

            it('requests the season that starts that August', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date('2026-08-01T00:00:00.000Z'),
                        to: new Date('2027-08-01T00:00:00.000Z'),
                    },
                    false,
                );
            });
        });

        describe('when withResult is true', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2025-09-20T00:00:00.000Z'));
            });

            it('returns formatted matches and forwards the flag', async () => {
                matchsDbService.getMatches.mockResolvedValue([playedMatch]);

                await expect(service.getCurrentSeason(true)).resolves.toEqual([
                    formatMatch(playedMatch, true),
                ]);
                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    expect.anything(),
                    true,
                );
            });
        });

        describe('when the season includes matches that have already kicked off', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2025-09-20T00:00:00.000Z'));
            });

            it('includes those matches in the result', async () => {
                matchsDbService.getMatches.mockResolvedValue([playedMatch]);

                const result = await service.getCurrentSeason(true);

                expect(result).toHaveLength(1);
                expect(result[0]!.date).toBe('2025-09-13T19:00:00.000Z');
            });
        });

        describe('compared with getSeasonMatches for the same calendar season', () => {
            beforeEach(() => {
                jest.useFakeTimers().setSystemTime(new Date('2025-09-20T00:00:00.000Z'));
            });

            it('requests an identical window, so both share one cache key', async () => {
                matchsDbService.getMatches.mockResolvedValue([] as Match[]);

                await service.getCurrentSeason();
                await service.getSeasonMatches(2025 as SeasonYear);

                const [currentArgs, seasonArgs] = matchsDbService.getMatches.mock.calls;

                expect(currentArgs).toEqual(seasonArgs);
            });
        });
    });
});
