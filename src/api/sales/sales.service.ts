import { Injectable } from '@nestjs/common';
import { omit } from 'radash';

import type { MatchId, SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice, Profit } from '@psg/shared/money';
import type { SeasonYear } from '@psg/shared/time';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { ISalesDbService } from '../../db/sales/sales.db.interface';
import { Sale } from '../../db/sales/type/sale.type';
import { computeProfit } from './shared/profit.util';
import { SaleAllocationsValidator } from './shared/sale-allocations.validator';
import {
    getSeasonWindow,
    seasonStartYearFromDate,
} from '../../shared/utils/season.utils';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import {
    FormattedSale,
    FormattedSalesGroup,
    ISalesService,
} from './interfaces/sales.service.interface';
import { IUngiftSaleUsecase } from './usecases/ungift-sale/ungift-sale.usecase';
import { IDeleteSaleUsecase } from './usecases/delete-sale/delete-sale.usecase';
import { IUpdateSaleUsecase } from './usecases/update-sale/update-sale.usecase';

@Injectable()
export class SalesService implements ISalesService {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly saleAllocationsValidator: SaleAllocationsValidator,
        private readonly ungiftSaleUsecase: IUngiftSaleUsecase,
        private readonly deleteSaleUsecase: IDeleteSaleUsecase,
        private readonly updateSaleUsecase: IUpdateSaleUsecase,
    ) {}

    async getSale(userId: UserId, saleId: SaleId): Promise<Sale> {
        const sale = await this.salesDbService.getOneSale(userId, saleId);

        if (!sale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return sale;
    }

    async getSales(userId: UserId): Promise<FormattedSale[]> {
        const sales = await this.salesDbService.getSales(userId);

        return sales.map((sale) => this.formatSale(sale));
    }

    async getCurrentSeasonSales(userId: UserId): Promise<FormattedSale[]> {
        const { start: from, end: to } = getSeasonWindow(
            seasonStartYearFromDate(new Date()),
            'exclusive',
        );
        const sales = await this.salesDbService.getSalesByRange(userId, { from, to });

        return sales.map((sale) => this.formatSale(sale));
    }

    async getSalesGrouped(userId: UserId): Promise<FormattedSalesGroup> {
        const { start: from, end: to } = getSeasonWindow(
            seasonStartYearFromDate(new Date()),
            'exclusive',
        );
        const group = await this.salesDbService.getSalesGrouped(userId, { from, to });

        return {
            pending: group.pending.map((sale) => this.formatSale(sale)),
            terminal: group.terminal.map((sale) => this.formatSale(sale)),
        };
    }

    async getSeasonSales(
        userId: UserId,
        seasonStartYear: SeasonYear,
    ): Promise<FormattedSale[]> {
        const { start: from, end: to } = getSeasonWindow(seasonStartYear, 'exclusive');
        const sales = await this.salesDbService.getSalesByRange(userId, { from, to });

        return sales.map((sale) => this.formatSale(sale));
    }

    async getMatchSales(userId: UserId, matchId: MatchId): Promise<FormattedSale[]> {
        const sales = await this.salesDbService.getSalesByMatch(userId, matchId);

        return sales.map((sale) => this.formatSale(sale));
    }

    private formatSale(sale: Sale): FormattedSale {
        return {
            ...omit(sale, ['Match', 'userId', 'matchId']),
            opponent: {
                id: sale.Match.Opponent.id,
                name: sale.Match.Opponent.name,
            },
            matchDate: sale.Match.date,
        };
    }

    async addSale(userId: UserId, payload: AddSaleDto): Promise<{ id: SaleId }> {
        await this.saleAllocationsValidator.validate(
            userId,
            payload.matchId,
            payload.allocations,
        );

        const sale = await this.salesDbService.addSale({
            userId,
            matchId: payload.matchId,
            listedPrice: payload.listedPrice,
            invest: payload.invest,
            profit: this.getProfit(payload.listedPrice),
            allocations: payload.allocations,
        });

        return { id: sale.id };
    }

    async updateSale(userId: UserId, payload: UpdateSaleDto): Promise<void> {
        return this.updateSaleUsecase.execute(userId, payload);
    }

    getProfit(price: ListedPrice): Profit {
        return computeProfit(price);
    }

    async ungiftSale(userId: UserId, saleId: SaleId): Promise<void> {
        return this.ungiftSaleUsecase.execute(userId, saleId);
    }

    async deleteSale(userId: UserId, saleId: SaleId): Promise<void> {
        return this.deleteSaleUsecase.execute(userId, saleId);
    }
}
