import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { SalesService } from './sales.service';
import { SalesService as SalesDbService } from '../../db/sales/sales.service';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { MatchesService } from '../../db/matches/matches.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { SeasonPassesService as SeasonPassesDbService } from '../../db/season-passes/season-passes.service';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { RedisService } from '../../redis/redis.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { Sale } from '../../db/sales/type/sale.type';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { Match } from '../../db/matches/types/match.type';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import type { MatchId, SaleId, SeasonPassId, UserId } from '@psg/shared';

describe('SalesService', () => {
    let service: SalesService;
    let salesDbService: DeepMockProxy<SalesDbService>;
    let matchesDbService: DeepMockProxy<MatchesService>;
    let seasonPassesDbService: DeepMockProxy<SeasonPassesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-uuid' as UserId;
    const saleId = 'sale-uuid' as SaleId;
    const matchId = 'match-uuid' as MatchId;
    const passId = 'pass-uuid' as SeasonPassId;

    function saleFixture(matchDate: Date, status: SaleStatus = SaleStatus.PENDING): Sale {
        return {
            id: saleId,
            userId,
            matchId,
            listedPrice: 100,
            profit: 90,
            invest: 50,
            nbTickets: 1,
            status,
            createdAt: new Date(),
            updatedAt: new Date(),
            soldAt: null,
            cancelledAt: null,
            Match: {
                date: matchDate,
                Opponent: { id: 'opp', name: 'Marseille' },
            },
            Allocations: [],
        } as unknown as Sale;
    }

    function matchFixture(date: Date): Match {
        return {
            id: matchId,
            date,
            atHome: true,
            competition: 'CHAMPIONSHIP',
        } as unknown as Match;
    }

    function passFixture(overrides: Partial<SeasonPass> = {}): SeasonPass {
        return {
            id: passId,
            userId,
            seasonStartYear: 2024,
            price: 1000,
            label: 'Pass',
            category: 'cat',
            row: 'row',
            seat: 'seat',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        };
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesService,
                { provide: ISalesDbService, useValue: mockDeep<SalesDbService>() },
                { provide: IMatchesDbService, useValue: mockDeep<MatchesService>() },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<SeasonPassesDbService>(),
                },
                { provide: RedisService, useValue: mockDeep<RedisService>() },
            ],
        }).compile();

        service = module.get(SalesService);
        salesDbService = module.get(ISalesDbService);
        matchesDbService = module.get(IMatchesDbService);
        seasonPassesDbService = module.get(ISeasonPassesDbService);
        redisService = module.get(RedisService);

        module.useLogger(false);
    });

    describe('updateSale kickoff guard', () => {
        it('rejects marking a sale SOLD after the match kickoff', async () => {
            salesDbService.getOneSale.mockResolvedValue(
                saleFixture(new Date(Date.now() - 60_000)),
            );

            const payload: UpdateSaleDto = { saleId, sold: true } as UpdateSaleDto;

            await expect(service.updateSale(userId, payload)).rejects.toThrow(
                DomainException,
            );
            await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                code: ErrorCode.SALE_AFTER_KICKOFF,
            });

            expect(salesDbService.updateSale).not.toHaveBeenCalled();
        });

        it('allows marking a sale SOLD when match is in the future', async () => {
            salesDbService.getOneSale.mockResolvedValue(
                saleFixture(new Date(Date.now() + 60 * 60_000)),
            );

            const payload: UpdateSaleDto = {
                saleId,
                sold: true,
                listedPrice: 120,
            } as UpdateSaleDto;

            await expect(service.updateSale(userId, payload)).resolves.toBeUndefined();
            expect(salesDbService.updateSale).toHaveBeenCalledTimes(1);
            expect(redisService.invalidatePattern).toHaveBeenCalled();
        });

        it('throws SALE_NOT_FOUND when the target does not exist', async () => {
            salesDbService.getOneSale.mockResolvedValueOnce(null);

            const payload: UpdateSaleDto = { saleId, sold: true } as UpdateSaleDto;

            await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
        });
    });

    describe('addSale allocations', () => {
        const validPayload: AddSaleDto = {
            matchId,
            allocations: [{ seasonPassId: passId, nbTickets: 2 }],
            listedPrice: 100,
            invest: 0,
        };

        it('creates the sale when allocations match the user and season', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );
            seasonPassesDbService.findById.mockResolvedValueOnce(passFixture());
            salesDbService.addSale.mockResolvedValueOnce({ id: 'new-sale' as SaleId });

            const result = await service.addSale(userId, validPayload);

            expect(result).toEqual({ id: 'new-sale' });
            expect(salesDbService.addSale).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId,
                    matchId,
                    allocations: validPayload.allocations,
                }),
            );
        });

        it('rejects when an allocation references a pass owned by another user', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );
            seasonPassesDbService.findById.mockResolvedValueOnce(
                passFixture({ userId: 'someone-else' as UserId }),
            );

            await expect(service.addSale(userId, validPayload)).rejects.toMatchObject({
                code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
            });
        });

        it('rejects when the pass belongs to a different season than the match', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );
            seasonPassesDbService.findById.mockResolvedValueOnce(
                passFixture({ seasonStartYear: 2023 }),
            );

            await expect(service.addSale(userId, validPayload)).rejects.toMatchObject({
                code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH,
            });
        });

        it('rejects duplicate allocations to the same pass', async () => {
            matchesDbService.getOneMatch.mockResolvedValueOnce(
                matchFixture(new Date('2024-09-15')),
            );

            await expect(
                service.addSale(userId, {
                    ...validPayload,
                    allocations: [
                        { seasonPassId: passId, nbTickets: 1 },
                        { seasonPassId: passId, nbTickets: 1 },
                    ],
                }),
            ).rejects.toMatchObject({
                code: ErrorCode.SALE_INVALID_ALLOCATIONS,
            });
        });
    });
});
