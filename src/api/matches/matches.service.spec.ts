import { MatchesService } from './matches.service';
import { Test } from '@nestjs/testing';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Match } from '../../db/matches/types/match.type';
import { getSeasonWindow } from '../../shared/utils/season.utils';
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
        describe('withResult = true', () => {
            it('should return matches', async () => {
                const startSeasonYear = '2022';

                const dbResult = [] as Match[];
                matchsDbService.getMatches.mockResolvedValue(dbResult);

                await expect(service.getSeasonMatches(startSeasonYear)).resolves.toEqual(
                    dbResult,
                );
                expect(matchsDbService.getMatches).toHaveBeenCalledTimes(1);
                const window = getSeasonWindow(2022 as SeasonYear, 'exclusive');

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    { from: window.start, to: window.end },
                    false,
                );
            });
        });

        it('shares the exact Aug 1 UTC boundary with the next season, so the two cannot overlap', async () => {
            const startSeasonYear = '2022';

            matchsDbService.getMatches.mockResolvedValue([] as Match[]);

            await service.getSeasonMatches(startSeasonYear);

            expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: getSeasonWindow(2023 as SeasonYear, 'exclusive').start,
                }),
                false,
            );
        });
    });

    describe('getCurrentSeason', () => {
        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        describe('when there are upcoming matches', () => {
            it('derives the season bucket from the earliest upcoming match instead of today', async () => {
                const dbResult = [] as Match[];

                matchsDbService.getEarliestUpcomingMatchDate.mockResolvedValue(
                    new Date('2026-08-15T00:00:00.000Z'),
                );
                matchsDbService.getMatches.mockResolvedValue(dbResult);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date('2026-07-29T00:00:00.000Z'),
                        to: new Date('2027-07-31T00:00:00.000Z'),
                    },
                    false,
                );
            });
        });

        describe('when there are no upcoming matches', () => {
            it('falls back to today for bucketing', async () => {
                const dbResult = [] as Match[];

                matchsDbService.getEarliestUpcomingMatchDate.mockResolvedValue(null);
                matchsDbService.getMatches.mockResolvedValue(dbResult);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date('2026-07-29T00:00:00.000Z'),
                        to: new Date('2026-07-31T00:00:00.000Z'),
                    },
                    false,
                );
            });
        });
    });
});
