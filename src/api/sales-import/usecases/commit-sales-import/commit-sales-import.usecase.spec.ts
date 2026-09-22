import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { CommitSalesImportUsecase } from './commit-sales-import.usecase';
import { ICommitSalesImportUsecaseDb } from './commit-sales-import.usecase.db';
import { ImportPassesValidator } from '../../shared/import-passes.validator';
import { ImportCacheInvalidator } from '../../shared/import-cache.invalidator';
import { ISeasonPassesDbService } from '../../../../db/season-passes/season-passes.db.interface';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { CommitRequestDto } from '../../dto/commit-request.dto';
import type { MatchId, OpponentId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Match } from '../../../../db/matches/types/match.type';
import type { SeasonPass } from '../../../../db/season-passes/type/season-pass.type';

describe('CommitSalesImportUsecase', () => {
    let usecase: CommitSalesImportUsecase;
    let usecaseDb: DeepMockProxy<ICommitSalesImportUsecaseDb>;
    let passesDb: DeepMockProxy<ISeasonPassesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-1' as UserId;
    const passAId = '11111111-1111-1111-1111-111111111111';
    const matchId = '33333333-3333-3333-3333-333333333333';

    function passFixture(overrides: Partial<SeasonPass> = {}): SeasonPass {
        return {
            id: passAId as SeasonPassId,
            userId,
            seasonStartYear: 2025,
            price: 800,
            label: 'A',
            category: 'A',
            row: '1',
            seat: '1',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        } as SeasonPass;
    }

    function matchFixture(): Match {
        return {
            id: matchId as MatchId,
            opponentId: 'op-1' as OpponentId,
            atHome: true,
            date: new Date('2025-09-14'),
            competition: 'CHAMPIONSHIP',
            Opponent: { id: 'op-1' as OpponentId, name: 'Marseille' },
            MatchResults: null,
        } as unknown as Match;
    }

    const validDto: CommitRequestDto = {
        selectedPassIds: [passAId],
        rows: [
            {
                rowIndex: 0,
                date: '2025-09-14',
                opponent: 'Marseille',
                listedPrice: 120,
                nbTickets: 1,
                invest: 80,
                status: 'SOLD',
                matchId,
                allocations: [{ seasonPassId: passAId, nbTickets: 1 }],
                rowStatus: 'ok',
            },
        ],
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                CommitSalesImportUsecase,
                ImportPassesValidator,
                ImportCacheInvalidator,
                {
                    provide: ICommitSalesImportUsecaseDb,
                    useValue: mockDeep<ICommitSalesImportUsecaseDb>(),
                },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        usecase = module.get(CommitSalesImportUsecase);
        usecaseDb = module.get(ICommitSalesImportUsecaseDb);
        passesDb = module.get(ISeasonPassesDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);

        passesDb.findById.mockResolvedValue(passFixture());
        usecaseDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
        usecaseDb.bulkCreate.mockResolvedValue(1);
    });

    it('creates sales with a fresh batchId', async () => {
        const result = await usecase.execute(userId, validDto);

        expect(result.salesCreated).toBe(1);
        expect(result.batchId).toEqual(expect.any(String));
        expect(usecaseDb.bulkCreate).toHaveBeenCalledTimes(1);
    });

    describe('when sales are created', () => {
        it('invalidates the accounting and recipients caches', async () => {
            await usecase.execute(userId, validDto);

            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateAccounting(userId),
            );
            expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        });
    });

    describe('when no sales are created', () => {
        it('does not invalidate any cache', async () => {
            usecaseDb.bulkCreate.mockResolvedValue(0);

            await usecase.execute(userId, validDto);

            expect(redisService.invalidatePattern).not.toHaveBeenCalled();
        });
    });

    it('passes a provided soldAt through to bulkCreate for SOLD rows', async () => {
        const withSoldAt: CommitRequestDto = {
            ...validDto,
            rows: [{ ...validDto.rows[0]!, soldAt: '2025-09-10' }],
        };

        await usecase.execute(userId, withSoldAt);

        expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                sales: [
                    expect.objectContaining({
                        soldAt: new Date('2025-09-10T12:00:00.000Z'),
                    }),
                ],
            }),
        );
    });

    describe('when the row is not SOLD', () => {
        it('nulls soldAt, even if provided', async () => {
            const pending: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, status: 'PENDING', soldAt: '2025-09-10' }],
            };

            await usecase.execute(userId, pending);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ soldAt: null })],
                }),
            );
        });

        it('sends no gift payload', async () => {
            const pending: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, status: 'PENDING', soldAt: '2025-09-10' }],
            };

            await usecase.execute(userId, pending);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ gift: null })],
                }),
            );
        });
    });

    describe('when the row is GIFTED', () => {
        it('sets gift.giftedAt to the provided date at noon UTC and gift.recipientName to the row recipient', async () => {
            const gifted: CommitRequestDto = {
                ...validDto,
                rows: [
                    {
                        ...validDto.rows[0]!,
                        status: 'GIFTED',
                        soldAt: '2025-09-10',
                        recipient: 'Marc',
                    },
                ],
            };

            await usecase.execute(userId, gifted);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [
                        expect.objectContaining({
                            gift: {
                                recipientName: 'Marc',
                                giftedAt: new Date('2025-09-10T12:00:00.000Z'),
                            },
                            soldAt: null,
                        }),
                    ],
                }),
            );
        });

        it('falls back to the match date when no date was provided', async () => {
            const gifted: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, status: 'GIFTED', recipient: 'Marc' }],
            };

            await usecase.execute(userId, gifted);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [
                        expect.objectContaining({
                            gift: expect.objectContaining({
                                giftedAt: matchFixture().date,
                            }),
                        }),
                    ],
                }),
            );
        });

        it('normalizes ragged whitespace in the recipient name', async () => {
            const gifted: CommitRequestDto = {
                ...validDto,
                rows: [
                    {
                        ...validDto.rows[0]!,
                        status: 'GIFTED',
                        recipient: '  Marc   Dupont ',
                    },
                ],
            };

            await usecase.execute(userId, gifted);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [
                        expect.objectContaining({
                            gift: expect.objectContaining({
                                recipientName: 'Marc Dupont',
                            }),
                        }),
                    ],
                }),
            );
        });
    });

    describe('when a row has an error', () => {
        it('throws IMPORT_ROWS_INVALID', async () => {
            const bad: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, allocations: [] }],
            };

            await expect(usecase.execute(userId, bad)).rejects.toMatchObject({
                code: ErrorCode.IMPORT_ROWS_INVALID,
            });
        });
    });

    it('re-resolves matchId server-side and rejects a tampered row', async () => {
        const tampered: CommitRequestDto = {
            ...validDto,
            rows: [{ ...validDto.rows[0]!, date: '2025-12-25' }],
        };

        await expect(usecase.execute(userId, tampered)).rejects.toMatchObject({
            code: ErrorCode.IMPORT_ROWS_INVALID,
        });
    });

    describe('when a row resolves by date but carries a foreign client-supplied matchId', () => {
        const foreignMatchId = '44444444-4444-4444-4444-444444444444';

        it('commits using the server-resolved matchId, not the client-supplied one', async () => {
            const tampered: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, matchId: foreignMatchId }],
            };

            await usecase.execute(userId, tampered);

            expect(usecaseDb.bulkCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ matchId })],
                }),
            );
            expect(usecaseDb.bulkCreate).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    sales: [expect.objectContaining({ matchId: foreignMatchId })],
                }),
            );
        });
    });

    describe('when pass validation fails', () => {
        it('propagates SEASON_PASS_FORBIDDEN from the shared validator', async () => {
            passesDb.findById.mockResolvedValue(
                passFixture({ userId: 'other-user' as UserId }),
            );

            await expect(usecase.execute(userId, validDto)).rejects.toMatchObject({
                code: ErrorCode.SEASON_PASS_FORBIDDEN,
            });
            expect(usecaseDb.bulkCreate).not.toHaveBeenCalled();
        });
    });
});
