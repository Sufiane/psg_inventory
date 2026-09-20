import { AdminService } from './admin.service';
import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { FootballDataService } from '../../football-data/football-data.service';
import { MatchesDb } from '../../db/matches/matches.db';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { UsersDb } from '../../db/users/users.db';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { RedisService } from '../../redis/redis.service';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { CreateMatchDto } from './dto/create-match.dto';
import { PSG_ID } from '../../shared/constants';
import type { Email } from '@psg/shared/strings';
import type { Users } from '@prisma/client';

describe('AdminService', () => {
    let service: AdminService;
    let footballDataService: DeepMockProxy<FootballDataService>;
    let matchsDbService: DeepMockProxy<MatchesDb>;
    let usersDbService: DeepMockProxy<UsersDb>;
    let redisService: DeepMockProxy<RedisService>;

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
                    useValue: mockDeep<MatchesDb>(),
                },
                {
                    provide: IUsersDbService,
                    useValue: mockDeep<UsersDb>(),
                },
                {
                    provide: RedisService,
                    useValue: mockDeep<RedisService>(),
                },
            ],
        }).compile();

        service = module.get(AdminService);
        footballDataService = module.get(FootballDataService);
        matchsDbService = module.get(IMatchesDbService);
        usersDbService = module.get(IUsersDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('loadMatches', () => {
        it('should call load matches', async () => {
            const matches = [] as FormattedMatch[];
            footballDataService.getTeamMatches.mockResolvedValue(matches);

            matchsDbService.loadMatches.mockResolvedValueOnce({
                unknownCompetitions: [],
            });

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

        describe('when a match has an unknown competition', () => {
            it('should throw a domain exception', async () => {
                const matches = [] as FormattedMatch[];
                footballDataService.getTeamMatches.mockResolvedValue(matches);
                matchsDbService.loadMatches.mockResolvedValueOnce({
                    unknownCompetitions: ['Trophée des Champions'],
                });

                const seasonStartYear = 2022;

                await expect(service.loadMatches(seasonStartYear)).rejects.toMatchObject({
                    code: ErrorCode.UNKNOWN_COMPETITION,
                });
            });
        });

        describe('when every competition is known', () => {
            it('should not throw', async () => {
                const matches = [] as FormattedMatch[];
                footballDataService.getTeamMatches.mockResolvedValue(matches);
                matchsDbService.loadMatches.mockResolvedValueOnce({
                    unknownCompetitions: [],
                });

                const seasonStartYear = 2022;

                await expect(
                    service.loadMatches(seasonStartYear),
                ).resolves.toBeUndefined();
            });
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

    describe('flushUserCache', () => {
        const email = 'user@example.com' as Email;
        const user = { id: 'user-1', email } as unknown as Users;

        describe('when the user does not exist', () => {
            it('should throw a domain exception', async () => {
                usersDbService.findOneByEmail.mockResolvedValueOnce(null);

                await expect(service.flushUserCache(email)).rejects.toThrow(
                    DomainException,
                );
            });
        });

        describe('when every cache entry clears successfully', () => {
            it('should report ok for every key', async () => {
                usersDbService.findOneByEmail.mockResolvedValueOnce(user);
                redisService.invalidatePattern.mockResolvedValue(undefined);
                redisService.invalidate.mockResolvedValue(undefined);

                const results = await service.flushUserCache(email);

                expect(results).toEqual([
                    { key: 'accounting', status: 'ok' },
                    { key: 'sales', status: 'ok' },
                    { key: 'season-passes', status: 'ok' },
                    { key: 'user-by-email', status: 'ok' },
                ]);
                expect(redisService.invalidatePattern).toHaveBeenCalledTimes(3);
                expect(redisService.invalidate).toHaveBeenCalledTimes(1);
            });
        });

        describe('when one cache entry fails to clear', () => {
            it('should report failed for that key only, without throwing', async () => {
                usersDbService.findOneByEmail.mockResolvedValueOnce(user);
                redisService.invalidatePattern
                    .mockResolvedValueOnce(undefined)
                    .mockRejectedValueOnce(new Error('redis down'))
                    .mockResolvedValueOnce(undefined);
                redisService.invalidate.mockResolvedValueOnce(undefined);

                const results = await service.flushUserCache(email);

                expect(results).toEqual([
                    { key: 'accounting', status: 'ok' },
                    { key: 'sales', status: 'failed', error: 'Error: redis down' },
                    { key: 'season-passes', status: 'ok' },
                    { key: 'user-by-email', status: 'ok' },
                ]);
            });
        });
    });
});
