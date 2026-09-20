import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { MatchesDb } from '../../db/matches/matches.db';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { SalesImportDb } from '../../db/sales-import/sales-import.db';
import { ISalesImportDbService } from '../../db/sales-import/sales-import.db.interface';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import type { MatchId, OpponentId, SeasonPassId, UserId } from '@psg/shared/ids';
import type { Match } from '../../db/matches/types/match.type';
import type { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { SalesImportService } from './sales-import.service';
import { CommitRequestDto } from './dto/commit-request.dto';

describe('SalesImportService', () => {
    let service: SalesImportService;
    let matchesDb: DeepMockProxy<MatchesDb>;
    let passesDb: DeepMockProxy<SeasonPassesDb>;
    let importDb: DeepMockProxy<SalesImportDb>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-1' as UserId;
    const passAId = '11111111-1111-1111-1111-111111111111';
    const passBId = '22222222-2222-2222-2222-222222222222';
    const matchId = '33333333-3333-3333-3333-333333333333';

    function passFixture(overrides: Partial<SeasonPass>): SeasonPass {
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

    beforeEach(async () => {
        matchesDb = mockDeep<MatchesDb>();
        passesDb = mockDeep<SeasonPassesDb>();
        importDb = mockDeep<SalesImportDb>();
        redisService = mockDeep<RedisService>();

        const moduleRef = await Test.createTestingModule({
            providers: [
                SalesImportService,
                { provide: IMatchesDbService, useValue: matchesDb },
                { provide: ISeasonPassesDbService, useValue: passesDb },
                { provide: ISalesImportDbService, useValue: importDb },
                { provide: RedisService, useValue: redisService },
            ],
        }).compile();

        service = moduleRef.get(SalesImportService);
    });

    describe('preview', () => {
        it('returns annotated rows from CSV', async () => {
            passesDb.findById.mockResolvedValue(passFixture({}));
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);

            const csv = Buffer.from(
                'date,opponent,listedPrice,nbTickets,status,invest\n2025-09-14,Marseille,120,1,SOLD,80\n',
            );
            const result = await service.preview(userId, csv, [passAId]);

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]!.rowStatus).toBe('ok');
            expect(result.seasonStartYear).toBe(2025);
        });

        it('throws IMPORT_CSV_INVALID on parse error', async () => {
            await expect(
                service.preview(userId, Buffer.from(''), [passAId]),
            ).rejects.toBeInstanceOf(DomainException);
        });

        it('throws SEASON_PASS_FORBIDDEN when pass belongs to other user', async () => {
            passesDb.findById.mockResolvedValue(
                passFixture({ userId: 'other-user' as UserId }),
            );
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([]);

            const csv = Buffer.from(
                'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n',
            );
            await expect(service.preview(userId, csv, [passAId])).rejects.toMatchObject({
                code: ErrorCode.SEASON_PASS_FORBIDDEN,
            });
        });

        it('throws IMPORT_PASSES_MIXED_SEASONS when passes differ in year', async () => {
            passesDb.findById.mockImplementation(async (id) => {
                if (id === passBId) {
                    return passFixture({
                        id: passBId as SeasonPassId,
                        seasonStartYear: 2024,
                    });
                }

                return passFixture({});
            });
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([]);

            const csv = Buffer.from(
                'date,opponent,listedPrice,nbTickets,status\n2025-09-14,Marseille,120,1,SOLD\n',
            );
            await expect(
                service.preview(userId, csv, [passAId, passBId]),
            ).rejects.toMatchObject({ code: ErrorCode.IMPORT_PASSES_MIXED_SEASONS });
        });
    });

    describe('commit', () => {
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

        it('creates sales with a fresh batchId', async () => {
            passesDb.findById.mockResolvedValue(passFixture({}));
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
            importDb.bulkCreate.mockResolvedValue(1);

            const result = await service.commit(userId, validDto);

            expect(result.salesCreated).toBe(1);
            expect(result.batchId).toEqual(expect.any(String));
            expect(importDb.bulkCreate).toHaveBeenCalledTimes(1);
        });

        describe('when sales are created', () => {
            it('invalidates the accounting and recipients caches', async () => {
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);

                await service.commit(userId, validDto);

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
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(0);

                await service.commit(userId, validDto);

                expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            });
        });

        it('passes a provided soldAt through to bulkCreate for SOLD rows', async () => {
            passesDb.findById.mockResolvedValue(passFixture({}));
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
            importDb.bulkCreate.mockResolvedValue(1);

            const withSoldAt: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, soldAt: '2025-09-10' }],
            };

            await service.commit(userId, withSoldAt);

            expect(importDb.bulkCreate).toHaveBeenCalledWith(
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
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);

                const pending: CommitRequestDto = {
                    ...validDto,
                    rows: [
                        { ...validDto.rows[0]!, status: 'PENDING', soldAt: '2025-09-10' },
                    ],
                };

                await service.commit(userId, pending);

                expect(importDb.bulkCreate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        sales: [expect.objectContaining({ soldAt: null })],
                    }),
                );
            });

            it('sends no gift payload', async () => {
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);

                const pending: CommitRequestDto = {
                    ...validDto,
                    rows: [
                        { ...validDto.rows[0]!, status: 'PENDING', soldAt: '2025-09-10' },
                    ],
                };

                await service.commit(userId, pending);

                expect(importDb.bulkCreate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        sales: [expect.objectContaining({ gift: null })],
                    }),
                );
            });
        });

        describe('when the row is GIFTED', () => {
            it('sets gift.giftedAt to the provided date at noon UTC and gift.recipientName to the row recipient', async () => {
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);

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

                await service.commit(userId, gifted);

                expect(importDb.bulkCreate).toHaveBeenCalledWith(
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
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);

                const gifted: CommitRequestDto = {
                    ...validDto,
                    rows: [{ ...validDto.rows[0]!, status: 'GIFTED', recipient: 'Marc' }],
                };

                await service.commit(userId, gifted);

                expect(importDb.bulkCreate).toHaveBeenCalledWith(
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
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);

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

                await service.commit(userId, gifted);

                expect(importDb.bulkCreate).toHaveBeenCalledWith(
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
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);

                const bad: CommitRequestDto = {
                    ...validDto,
                    rows: [{ ...validDto.rows[0]!, allocations: [] }],
                };

                await expect(service.commit(userId, bad)).rejects.toMatchObject({
                    code: ErrorCode.IMPORT_ROWS_INVALID,
                });
            });
        });

        it('re-resolves matchId server-side and rejects a tampered row', async () => {
            passesDb.findById.mockResolvedValue(passFixture({}));
            matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);

            const tampered: CommitRequestDto = {
                ...validDto,
                rows: [{ ...validDto.rows[0]!, date: '2025-12-25' }],
            };

            await expect(service.commit(userId, tampered)).rejects.toMatchObject({
                code: ErrorCode.IMPORT_ROWS_INVALID,
            });
        });

        describe('when a row resolves by date but carries a foreign client-supplied matchId', () => {
            const foreignMatchId = '44444444-4444-4444-4444-444444444444';

            beforeEach(() => {
                passesDb.findById.mockResolvedValue(passFixture({}));
                matchesDb.getHomeMatchesForSeason.mockResolvedValue([matchFixture()]);
                importDb.bulkCreate.mockResolvedValue(1);
            });

            it('commits using the server-resolved matchId, not the client-supplied one', async () => {
                const tampered: CommitRequestDto = {
                    ...validDto,
                    rows: [
                        {
                            ...validDto.rows[0]!,
                            matchId: foreignMatchId,
                        },
                    ],
                };

                await service.commit(userId, tampered);

                expect(importDb.bulkCreate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        sales: [expect.objectContaining({ matchId })],
                    }),
                );
                expect(importDb.bulkCreate).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        sales: [expect.objectContaining({ matchId: foreignMatchId })],
                    }),
                );
            });
        });
    });

    describe('revert', () => {
        it('returns count of deleted sales', async () => {
            importDb.deleteBatch.mockResolvedValue(3);

            const result = await service.revert(userId, 'batch-1');

            expect(result).toEqual({ deleted: 3 });
        });

        it('is idempotent when nothing matches', async () => {
            importDb.deleteBatch.mockResolvedValue(0);

            const result = await service.revert(userId, 'unknown');

            expect(result).toEqual({ deleted: 0 });
        });

        describe('when sales are deleted', () => {
            it('invalidates the accounting and recipients caches', async () => {
                importDb.deleteBatch.mockResolvedValue(3);

                await service.revert(userId, 'batch-1');

                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateAccounting(userId),
                );
                expect(redisService.invalidatePattern).toHaveBeenCalledWith(
                    CACHE_KEYS.invalidateRecipients(userId),
                );
            });
        });

        describe('when nothing matches', () => {
            it('does not invalidate any cache', async () => {
                importDb.deleteBatch.mockResolvedValue(0);

                await service.revert(userId, 'unknown');

                expect(redisService.invalidatePattern).not.toHaveBeenCalled();
            });
        });
    });
});
