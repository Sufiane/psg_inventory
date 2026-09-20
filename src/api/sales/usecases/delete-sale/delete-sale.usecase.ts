import { Injectable } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';

export abstract class IDeleteSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecase implements IDeleteSaleUsecase {
    constructor(private readonly usecaseDb: IDeleteSaleUsecaseDb) {}

    async execute(userId: UserId, saleId: SaleId): Promise<void> {
        const existing = await this.usecaseDb.loadSale(userId, saleId);

        if (!existing) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        await this.usecaseDb.deleteSale(userId, saleId, existing.status);
    }
}
