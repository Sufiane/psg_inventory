import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { SalesService } from './sales.service';
import { SalesService as SalesDbService } from '../../db/sales/sales.service';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { RedisService } from '../../redis/redis.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { Sale } from '../../db/sales/type/sale.type';
import { UpdateSaleDto } from './dto/update-sale.dto';

describe('SalesService', () => {
    let service: SalesService;
    let salesDbService: DeepMockProxy<SalesDbService>;
    let redisService: DeepMockProxy<RedisService>;

    const userId = 'user-uuid';
    const saleId = 'sale-uuid';

    function saleFixture(matchDate: Date, status: SaleStatus = SaleStatus.PENDING): Sale {
        return {
            id: saleId,
            userId,
            matchId: 'match-uuid',
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
        } as unknown as Sale;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesService,
                {
                    provide: ISalesDbService,
                    useValue: mockDeep<SalesDbService>(),
                },
                {
                    provide: RedisService,
                    useValue: mockDeep<RedisService>(),
                },
            ],
        }).compile();

        service = module.get(SalesService);
        salesDbService = module.get(ISalesDbService);
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

        it('does not load the sale when reverting to PENDING (sold=false)', async () => {
            const payload: UpdateSaleDto = { saleId, sold: false } as UpdateSaleDto;

            await expect(service.updateSale(userId, payload)).resolves.toBeUndefined();
            expect(salesDbService.getOneSale).not.toHaveBeenCalled();
            expect(salesDbService.updateSale).toHaveBeenCalledTimes(1);
        });

        it('throws SALE_NOT_FOUND when the sold target does not exist', async () => {
            salesDbService.getOneSale.mockResolvedValueOnce(null);

            const payload: UpdateSaleDto = { saleId, sold: true } as UpdateSaleDto;

            await expect(service.updateSale(userId, payload)).rejects.toMatchObject({
                code: ErrorCode.SALE_NOT_FOUND,
            });
        });
    });
});
