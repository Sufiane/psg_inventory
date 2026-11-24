import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { SaleStatus } from '@prisma/client';

import { SalesService } from './sales.service';
import { SalesDb } from '../../db/sales/sales.db';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { MatchesDb } from '../../db/matches/matches.db';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { SeasonPassesDb } from '../../db/season-passes/season-passes.db';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { PSG_COMMISSION } from '../../shared/constants';
import { SaleAllocationsValidator } from './shared/sale-allocations.validator';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { IUngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IDeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';
import { IUpdateSaleUsecase } from './usecases/update-sale/update-sale.usecase';
import { ICreateSaleUsecase } from './usecases/create-sale/create-sale.usecase';
import {
    giftFixture,
    matchId,
    passId,
    saleFixture,
    saleId,
    userId,
} from './test-support/sales.fixtures';
import type { TicketCount } from '@psg/shared/counts';
import type { RecipientId, SaleId } from '@psg/shared/ids';
import type { Invest, ListedPrice } from '@psg/shared/money';

describe('SalesService', () => {
    let service: SalesService;
    let salesDbService: DeepMockProxy<SalesDb>;
    let ungiftSaleUsecase: DeepMockProxy<IUngiftSaleUsecase>;
    let deleteSaleUsecase: DeepMockProxy<IDeleteSaleUsecase>;
    let updateSaleUsecase: DeepMockProxy<IUpdateSaleUsecase>;
    let createSaleUsecase: DeepMockProxy<ICreateSaleUsecase>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                SalesService,
                { provide: ISalesDbService, useValue: mockDeep<SalesDb>() },
                { provide: IMatchesDbService, useValue: mockDeep<MatchesDb>() },
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<SeasonPassesDb>(),
                },
                SaleAllocationsValidator,
                { provide: IUngiftSaleUsecase, useValue: mockDeep<IUngiftSaleUsecase>() },
                { provide: IDeleteSaleUsecase, useValue: mockDeep<IDeleteSaleUsecase>() },
                { provide: IUpdateSaleUsecase, useValue: mockDeep<IUpdateSaleUsecase>() },
                { provide: ICreateSaleUsecase, useValue: mockDeep<ICreateSaleUsecase>() },
            ],
        }).compile();

        service = module.get(SalesService);
        salesDbService = module.get(ISalesDbService);
        ungiftSaleUsecase = module.get(IUngiftSaleUsecase);
        deleteSaleUsecase = module.get(IDeleteSaleUsecase);
        updateSaleUsecase = module.get(IUpdateSaleUsecase);
        createSaleUsecase = module.get(ICreateSaleUsecase);

        module.useLogger(false);
    });

    describe('getCurrentSeasonSales', () => {
        it('queries with the same exclusive-upper season bounds getSalesByRange expects', async () => {
            vi.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));

            salesDbService.getSalesByRange.mockResolvedValueOnce([]);

            await service.getCurrentSeasonSales(userId);

            expect(salesDbService.getSalesByRange).toHaveBeenCalledWith(userId, {
                from: new Date('2025-08-01T00:00:00.000Z'),
                to: new Date('2026-08-01T00:00:00.000Z'),
            });

            vi.useRealTimers();
        });
    });

    describe('getSalesGrouped', () => {
        it('returns formatted pending and terminal groups', async () => {
            const pendingSale = saleFixture(new Date('2026-09-01'), SaleStatus.PENDING);
            const soldSale = saleFixture(new Date('2026-07-01'), SaleStatus.SOLD);

            salesDbService.getSalesGrouped.mockResolvedValue({
                pending: [pendingSale],
                terminal: [soldSale],
            });

            const result = await service.getSalesGrouped(userId);

            expect(result.pending).toHaveLength(1);
            expect(result.pending[0]).toMatchObject({
                opponent: { id: 'opp', name: 'Marseille' },
                matchDate: new Date('2026-09-01'),
                status: 'PENDING',
            });
            expect(result.pending[0]).not.toHaveProperty('Match');

            expect(result.terminal).toHaveLength(1);
            expect(result.terminal[0]).toMatchObject({
                status: 'SOLD',
            });
        });
    });

    describe('reading a sale', () => {
        describe('when the sale has a gift', () => {
            it('serves the gift nested on the sale', async () => {
                const giftedAt = new Date('2026-03-01T12:00:00.000Z');

                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(
                        new Date('2026-03-02T20:00:00.000Z'),
                        SaleStatus.GIFTED,
                        giftFixture({
                            giftedAt,
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                );

                const result = await service.getSale(userId, saleId);

                expect(result.Gift).toEqual({
                    giftedAt,
                    recipientId: 'r1',
                    Recipient: { id: 'r1', name: 'Marc' },
                });
            });
        });

        describe('when the sale has no gift', () => {
            it('serves a null gift', async () => {
                salesDbService.getOneSale.mockResolvedValueOnce(
                    saleFixture(new Date('2026-03-02T20:00:00.000Z')),
                );

                const result = await service.getSale(userId, saleId);

                expect(result.Gift).toBeNull();
            });
        });

        describe('when listing sales', () => {
            it('keeps the gift nested on every row', async () => {
                salesDbService.getSales.mockResolvedValueOnce([
                    saleFixture(
                        new Date('2026-03-02T20:00:00.000Z'),
                        SaleStatus.GIFTED,
                        giftFixture({
                            giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                            recipientId: 'r1' as RecipientId,
                            Recipient: { id: 'r1' as RecipientId, name: 'Marc' },
                        }),
                    ),
                ]);

                const [sale] = await service.getSales(userId);

                expect(sale?.Gift).toEqual({
                    giftedAt: new Date('2026-03-01T12:00:00.000Z'),
                    recipientId: 'r1',
                    Recipient: { id: 'r1', name: 'Marc' },
                });
            });
        });
    });

    describe('formatting a sale', () => {
        describe('when a sale is formatted', () => {
            it('keeps the matchId', async () => {
                salesDbService.getSalesGrouped.mockResolvedValue({
                    pending: [saleFixture(new Date('2026-09-01'), SaleStatus.PENDING)],
                    terminal: [],
                });

                const result = await service.getSalesGrouped(userId);

                expect(result.pending[0]?.matchId).toBe(matchId);
            });
        });
    });

    describe('getCommission', () => {
        describe('when called', () => {
            it('returns the PSG commission percent', () => {
                expect(service.getCommission()).toEqual({
                    commissionPercent: PSG_COMMISSION,
                });
            });
        });
    });

    describe('updateSale', () => {
        it('delegates to UpdateSaleUsecase.execute', async () => {
            const payload: UpdateSaleDto = {
                saleId,
                status: 'SOLD',
            } as UpdateSaleDto;

            await service.updateSale(userId, payload);

            expect(updateSaleUsecase.execute).toHaveBeenCalledWith(userId, payload);
        });
    });

    describe('ungiftSale', () => {
        it('delegates to UngiftSaleUsecase.execute', async () => {
            await service.ungiftSale(userId, saleId);

            expect(ungiftSaleUsecase.execute).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('deleteSale', () => {
        it('delegates to DeleteSaleUsecase.execute', async () => {
            await service.deleteSale(userId, saleId);

            expect(deleteSaleUsecase.execute).toHaveBeenCalledWith(userId, saleId);
        });
    });

    describe('addSale', () => {
        it('delegates to CreateSaleUsecase.execute and returns its result', async () => {
            const payload: CreateSaleDto = {
                matchId,
                allocations: [{ seasonPassId: passId, nbTickets: 2 as TicketCount }],
                listedPrice: 100 as ListedPrice,
                invest: 0 as Invest,
            };
            createSaleUsecase.execute.mockResolvedValueOnce({ id: 'new-sale' as SaleId });

            const result = await service.addSale(userId, payload);

            expect(result).toEqual({ id: 'new-sale' });
            expect(createSaleUsecase.execute).toHaveBeenCalledWith(userId, payload);
        });
    });
});
