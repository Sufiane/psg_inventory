import { MatchesService } from './matches.service';
import { Test } from '@nestjs/testing';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Match } from '../../db/matches/types/match.type';

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
                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date(`${startSeasonYear}-08-01`),
                        to: new Date(`${parseInt(startSeasonYear) + 1}-08-01`),
                    },
                    false,
                );
            });
        });
    });

    describe('getCurrentSeason', () => {
        beforeEach(() => {
            jest.useFakeTimers().setSystemTime(new Date(2026, 6, 29));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        describe('when there are upcoming matches', () => {
            it('derives the season bucket from the earliest upcoming match instead of today', async () => {
                const dbResult = [] as Match[];

                matchsDbService.getEarliestUpcomingMatchDate.mockResolvedValue(
                    new Date(2026, 7, 15),
                );
                matchsDbService.getMatches.mockResolvedValue(dbResult);

                await service.getCurrentSeason();

                expect(matchsDbService.getMatches).toHaveBeenCalledWith(
                    {
                        from: new Date(2026, 6, 29),
                        to: new Date(2027, 6, 31),
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
                        from: new Date(2026, 6, 29),
                        to: new Date(2026, 6, 31),
                    },
                    false,
                );
            });
        });
    });
});
