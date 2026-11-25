import { Injectable, Logger } from '@nestjs/common';

import type { SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { GiftRecipientInput } from '../../../../db/sales/sales.db.interface';
import { CreateSaleDto } from '../../dto/create-sale.dto';
import { SaleStatusTarget } from '../../dto/update-sale.dto';
import { GiftRecipientResolver } from '../../shared/gift-recipient.resolver';
import { computeProfit } from '../../shared/profit.util';
import { SaleAllocationsValidator } from '../../shared/sale-allocations.validator';
import { assertNotAfterKickoff } from '../../shared/sale-kickoff.guard';
import { SalesCacheInvalidator } from '../../shared/sales-cache.invalidator';
import { ICreateSaleUsecaseDb } from './create-sale.usecase.db';

const NO_PRICE = 0 as ListedPrice;
const NO_PROFIT = 0 as Profit;

export abstract class ICreateSaleUsecase {
    abstract execute(userId: UserId, payload: CreateSaleDto): Promise<{ id: SaleId }>;
}

@Injectable()
export class CreateSaleUsecase implements ICreateSaleUsecase {
    private readonly logger = new Logger(CreateSaleUsecase.name);

    constructor(
        private readonly db: ICreateSaleUsecaseDb,
        private readonly saleAllocationsValidator: SaleAllocationsValidator,
        private readonly giftRecipientResolver: GiftRecipientResolver,
        private readonly salesCacheInvalidator: SalesCacheInvalidator,
    ) {}

    async execute(userId: UserId, payload: CreateSaleDto): Promise<{ id: SaleId }> {
        const status: SaleStatusTarget = payload.status ?? 'PENDING';

        this.assertFieldRules(status, payload);

        const recipient = await this.resolveRecipient(userId, status, payload);

        await this.saleAllocationsValidator.validate(
            userId,
            payload.matchId,
            payload.allocations,
        );
        await this.assertBeforeKickoff(payload, status);

        const created = await this.db.createSale({
            userId,
            matchId: payload.matchId,
            status,
            ...this.resolveAmounts(payload),
            allocations: payload.allocations,
            recipient,
        });

        await this.salesCacheInvalidator.afterCreate(userId, {
            recipientChanged: status === 'GIFTED',
        });

        return { id: created.id };
    }

    private resolveAmounts(payload: CreateSaleDto): {
        listedPrice: ListedPrice;
        profit: Profit;
        invest: Invest;
    } {
        return {
            listedPrice: payload.listedPrice ?? NO_PRICE,
            profit:
                payload.listedPrice != null
                    ? computeProfit(payload.listedPrice)
                    : NO_PROFIT,
            invest: payload.invest,
        };
    }

    private assertFieldRules(status: SaleStatusTarget, payload: CreateSaleDto): void {
        if (status !== 'GIFTED' && payload.listedPrice == null) {
            this.logger.warn(`Create sale for match ${payload.matchId} without a price`);

            throw new DomainException(ErrorCode.SALE_LISTED_PRICE_REQUIRED);
        }

        if (status !== 'GIFTED' && payload.recipientName != null) {
            this.logger.warn(`Recipient name sent for a ${status} sale`);

            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_NOT_APPLICABLE);
        }
    }

    private async resolveRecipient(
        userId: UserId,
        status: SaleStatusTarget,
        payload: CreateSaleDto,
    ): Promise<GiftRecipientInput | undefined> {
        if (status !== 'GIFTED') {
            return undefined;
        }

        return this.giftRecipientResolver.resolveNew(
            userId,
            payload.recipientName != null ? { recipientName: payload.recipientName } : {},
        );
    }

    private async assertBeforeKickoff(
        payload: CreateSaleDto,
        status: SaleStatusTarget,
    ): Promise<void> {
        if (status === 'PENDING') {
            return;
        }

        const matchDate = await this.db.getMatchDate(payload.matchId);

        if (matchDate == null) {
            this.logger.warn(`Match ${payload.matchId} not found on create sale`);

            throw new DomainException(ErrorCode.MATCH_NOT_FOUND);
        }

        assertNotAfterKickoff(matchDate, null, status);
    }
}
