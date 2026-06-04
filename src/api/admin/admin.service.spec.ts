import { AdminService } from './admin.service';
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { FootballDataService } from '../../football-data/football-data.service';
import { MatchesService as MatchsDbService } from '../../db/matches/matches.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { DomainException } from '../../common/exceptions/domain.exception';
import { CreateMatchDto } from './dto/create-match.dto';
import { PSG_ID } from '../../shared/constants';

describe('AdminService', () => {
    let service: AdminService;
    let footballDataService: DeepMockProxy<FootballDataService>;
    let matchsDbService: DeepMockProxy<MatchsDbService>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                AdminService,
                {
                    provide: FootballDataService,
                    useValue: mockDeep<FootballDataService>(),
                },
                {
                    provide: IMatchesDbService,
                    useValue: mockDeep<MatchsDbService>(),
                },
            ],
        }).compile();

        service = module.get(AdminService);
        footballDataService = module.get(FootballDataService);
        matchsDbService = module.get(IMatchesDbService);

        module.useLogger(false);
    });

    describe('loadMatches', () => {
        it('should call load matches', async () => {
            const matches = [] as FormattedMatch[];
            footballDataService.getTeamMatches.mockResolvedValue(matches);

            matchsDbService.loadMatches.mockResolvedValueOnce(undefined);

            const seasonStartYear = 2022;

            await expect(service.loadMatches(seasonStartYear)).resolves.toBeUndefined();
            expect(footballDataService.getTeamMatches).toHaveBeenCalledTimes(1);
            expect(footballDataService.getTeamMatches).toHaveBeenCalledWith(
                PSG_ID,
                seasonStartYear,
            );
            expect(matchsDbService.loadMatches).toHaveBeenCalledTimes(1);
            expect(matchsDbService.loadMatches).toHaveBeenCalledWith(matches);
        });
    });

    describe('createMatch', () => {
        describe('when an error occurs', () => {
            it('should throw an internal server error', async () => {
                matchsDbService.createMatch.mockRejectedValueOnce(new Error());

                const payload = {} as CreateMatchDto;
                await expect(service.createMatch(payload)).rejects.toThrow(
                    DomainException,
                );
                expect(matchsDbService.createMatch).toHaveBeenCalledTimes(1);
                expect(matchsDbService.createMatch).toHaveBeenCalledWith(payload);
            });
        });

        describe('when no error occurs', () => {
            it('should not throw', async () => {
                matchsDbService.createMatch.mockResolvedValueOnce(undefined);

                const payload = {} as CreateMatchDto;

                await expect(service.createMatch(payload)).resolves.toBeUndefined();
                expect(matchsDbService.createMatch).toHaveBeenCalledTimes(1);
                expect(matchsDbService.createMatch).toHaveBeenCalledWith(payload);
            });
        });
    });
});
