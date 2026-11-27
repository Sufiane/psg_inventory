import { Injectable, Logger } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import { IDeleteSaleUsecaseDb } from './delete-sale.usecase.db';

export abstract class IDeleteSaleUsecase {
    abstract execute(userId: UserId, saleId: SaleId): Promise<void>;
}

@Injectable()
export class DeleteSaleUsecase implements IDeleteSaleUsecase {
    private readonly logger = new Logger(DeleteSaleUsecase.name);

    constructor(
        private readonly usecaseDb: IDeleteSaleUsecaseDb,
        private readonly salesCacheInvalidator: SalesCacheInvalidator,
    ) {}

    async execute(userId: UserId, saleId: SaleId): Promise<void> {
        const existing = await this.usecaseDb.loadSale(userId, saleId);

        if (!existing) {
            this.throwNotFound(userId, saleId);
        }

        const deleted = await this.usecaseDb.deleteSale(userId, saleId);

        if (!deleted) {
            this.throwNotFound(userId, saleId);
        }

        await this.salesCacheInvalidator.afterWrite(userId, saleId, {
            recipientChanged: true,
        });
    }

    private throwNotFound(userId: UserId, saleId: SaleId): never {
        this.logger.warn(`Sale ${saleId} not found for user ${userId}`);

        throw new DomainException(ErrorCode.SALE_NOT_FOUND);
    }
}
