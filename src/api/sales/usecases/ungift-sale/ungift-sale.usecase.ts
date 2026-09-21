import { Injectable } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { IUngiftSaleUsecaseDb } from './ungift-sale.usecase.db';

export abstract class IUngiftSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}

// The sanctioned manual repair for a sale gifted by mistake (spec D16).
// Deliberately NOT exposed by SalesController: GIFTED is terminal in the
// app (spec D5). Its caller is scripts/ungift-sale.ts.
@Injectable()
export class UngiftSaleUsecase implements IUngiftSaleUsecase {
    constructor(private readonly usecaseDb: IUngiftSaleUsecaseDb) {}

    async execute(userId: UserId, saleId: SaleId): Promise<void> {
        const existing = await this.usecaseDb.loadSale(userId, saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        if (existing.status !== 'GIFTED') {
            throw new DomainException(ErrorCode.SALE_INVALID_STATUS_TRANSITION);
        }

        await this.usecaseDb.ungiftSale(userId, saleId);
    }
}
