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
import { ICommitSalesImportUsecase } from './usecases/commit-sales-import/commit-sales-import.usecase';
import { ImportCacheInvalidator } from './shared/import-cache.invalidator';
import { ImportPassesValidator } from './shared/import-passes.validator';
import { CommitRequestDto } from './dto/commit-request.dto';

describe('SalesImportService', () => {
    let service: SalesImportService;
    let matchesDb: DeepMockProxy<MatchesDb>;
    let passesDb: DeepMockProxy<SeasonPassesDb>;
    let importDb: DeepMockProxy<SalesImportDb>;
    let redisService: DeepMockProxy<RedisService>;
    let commitUsecase: DeepMockProxy<ICommitSalesImportUsecase>;

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
        commitUsecase = mockDeep<ICommitSalesImportUsecase>();

        const moduleRef = await Test.createTestingModule({
            providers: [
                SalesImportService,
                ImportPassesValidator,
                ImportCacheInvalidator,
                { provide: ICommitSalesImportUsecase, useValue: commitUsecase },
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
        it('delegates to the commit usecase', async () => {
            const dto: CommitRequestDto = {
                selectedPassIds: [passAId],
                rows: [],
            };
            commitUsecase.execute.mockResolvedValue({
                batchId: 'batch-1',
                salesCreated: 2,
            });

            const result = await service.commit(userId, dto);

            expect(commitUsecase.execute).toHaveBeenCalledWith(userId, dto);
            expect(result).toEqual({ batchId: 'batch-1', salesCreated: 2 });
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
