import { Injectable } from '@nestjs/common';
import { omit } from 'radash';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { ISalesDbService, SaleAllocationInput } from '../../db/sales/sales.db.interface';
import { Sale } from '../../db/sales/type/sale.type';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { PSG_COMMISSION } from '../../shared/constants';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { AddSaleDto } from './dto/add-sale.dto';
import { SaleAllocationDto } from './dto/sale-allocation.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { FormattedSale, ISalesService } from './interfaces/sales.service.interface';

function seasonStartYearFromDate(date: Date): number {
    return date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
}

@Injectable()
export class SalesService implements ISalesService {
    constructor(
        private readonly salesDbService: ISalesDbService,
        private readonly matchesDbService: IMatchesDbService,
        private readonly seasonPassesDbService: ISeasonPassesDbService,
        private readonly redisService: RedisService,
    ) {}

    async getSale(userId: string, saleId: string): Promise<Sale> {
        const sale = await this.salesDbService.getOneSale(userId, saleId);

        if (!sale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return sale;
    }

    async getSales(userId: string): Promise<FormattedSale[]> {
        const sales = await this.salesDbService.getSales(userId);

        return sales.map((sale) => this.formatSale(sale));
    }

    async getCurrentSeasonSales(userId: string): Promise<FormattedSale[]> {
        const { start, end } = getCurrentSeasonDate();
        const sales = await this.salesDbService.getSalesByRange(userId, {
            from: start,
            to: end,
        });

        return sales.map((sale) => this.formatSale(sale));
    }

    async getSeasonSales(
        userId: string,
        seasonStartYear: number,
    ): Promise<FormattedSale[]> {
        const from = new Date(seasonStartYear, 7, 1);
        const to = new Date(seasonStartYear + 1, 7, 1);
        const sales = await this.salesDbService.getSalesByRange(userId, { from, to });

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

    async addSale(userId: string, payload: AddSaleDto): Promise<{ id: string }> {
        await this.validateAllocations(userId, payload.matchId, payload.allocations);

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

    async updateSale(userId: string, payload: UpdateSaleDto): Promise<void> {
        const existing = await this.salesDbService.getOneSale(userId, payload.saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        // A sale can't be marked SOLD after the match has kicked off. We check
        // here (api layer) so the domain rule has a single source of truth.
        if (payload.sold && existing.Match.date.getTime() <= Date.now()) {
            throw new DomainException(ErrorCode.SALE_AFTER_KICKOFF);
        }

        if (payload.allocations != null) {
            await this.validateAllocations(userId, existing.matchId, payload.allocations);
        }

        await this.salesDbService.updateSale({
            saleId: payload.saleId,
            userId,
            invest: payload.invest,
            listedPrice: payload.listedPrice,
            sold: payload.sold,
            profit: payload.listedPrice ? this.getProfit(payload.listedPrice) : undefined,
            allocations: payload.allocations,
        });

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }

    getProfit(price: number): number {
        return (price * (100 - PSG_COMMISSION)) / 100;
    }

    async deleteSale(userId: string, saleId: string): Promise<void> {
        await this.salesDbService.deleteSale(userId, saleId);

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateAccounting(userId),
        );
    }

    private async validateAllocations(
        userId: string,
        matchId: string,
        allocations: SaleAllocationDto[] | SaleAllocationInput[],
    ): Promise<void> {
        if (allocations.length === 0) {
            throw new DomainException(ErrorCode.SALE_INVALID_ALLOCATIONS);
        }

        const seen = new Set<string>();

        for (const allocation of allocations) {
            if (seen.has(allocation.seasonPassId)) {
                throw new DomainException(ErrorCode.SALE_INVALID_ALLOCATIONS);
            }

            seen.add(allocation.seasonPassId);
        }

        const match = await this.matchesDbService.getOneMatch(matchId);

        if (match == null) {
            throw new DomainException(ErrorCode.MATCH_NOT_FOUND);
        }

        const matchSeason = seasonStartYearFromDate(match.date);

        for (const allocation of allocations) {
            const pass = await this.seasonPassesDbService.findById(
                allocation.seasonPassId,
            );

            if (pass == null || pass.userId !== userId) {
                throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            }

            if (pass.seasonStartYear !== matchSeason) {
                throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            }
        }
    }
}
