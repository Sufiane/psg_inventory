import { Injectable, Logger } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import type { ListedPrice } from '@psg/shared/money';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { computeProfit } from '../../shared/profit.util';
import { IUngiftSaleUsecaseDb } from './ungift-sale.usecase.db';

export abstract class IUngiftSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId, price?: ListedPrice): Promise<void>;
}

// The sanctioned manual repair for a sale gifted by mistake (spec D16).
// Deliberately NOT exposed by SalesController: GIFTED is terminal in the
// app (spec D5). Its caller is scripts/ungift-sale.ts.
@Injectable()
export class UngiftSaleUsecase implements IUngiftSaleUsecase {
    private readonly logger = new Logger(UngiftSaleUsecase.name);

    constructor(private readonly usecaseDb: IUngiftSaleUsecaseDb) {}

    async execute(userId: UserId, saleId: SaleId, price?: ListedPrice): Promise<void> {
        const existing = await this.usecaseDb.loadSale(userId, saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        if (existing.status !== 'GIFTED') {
            throw new DomainException(ErrorCode.SALE_INVALID_STATUS_TRANSITION);
        }

        this.assertPriceRule(saleId, existing.listedPrice, price);

        const pricing =
            price == null
                ? undefined
                : { listedPrice: price, profit: computeProfit(price) };

        const outcome = await this.usecaseDb.ungiftSale(
            userId,
            saleId,
            existing,
            pricing,
        );

        if (outcome === 'not_found') {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }
    }

    private assertPriceRule(
        saleId: SaleId,
        storedPrice: number,
        price: ListedPrice | undefined,
    ): void {
        if (storedPrice === 0 && price == null) {
            this.logger.warn(`Sale ${saleId} has no price; un-gift needs one`);

            throw new DomainException(ErrorCode.SALE_LISTED_PRICE_REQUIRED);
        }

        if (storedPrice > 0 && price != null) {
            this.logger.warn(
                `Sale ${saleId} already has price ${storedPrice}; not overwriting`,
            );

            throw new DomainException(ErrorCode.SALE_LISTED_PRICE_NOT_APPLICABLE);
        }
    }
}
