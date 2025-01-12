import { MatchesService } from './matches.service';
import { Test } from '@nestjs/testing';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
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
                    provide: MatchsDbService,
                    useValue: mockDeep<MatchsDbService>(),
                },
            ],
        }).compile();

        service = module.get(MatchesService);
        matchsDbService = module.get(MatchsDbService);
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
});
