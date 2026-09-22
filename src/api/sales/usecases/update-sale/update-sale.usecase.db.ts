import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { shake } from 'radash';

import type { TicketCount } from '@psg/shared/counts';
import type { RecipientId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import { DomainException } from '../../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../../common/exceptions/error-codes.enum';
import { IRecipientsDbService } from '../../../../db/recipients/recipients.db.interface';
import {
    GiftRecipientInput,
    ISalesDbService,
    SaleAllocationInput,
} from '../../../../db/sales/sales.db.interface';
import { Sale } from '../../../../db/sales/type/sale.type';
import { PrismaService } from '../../../../db/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';

function sumTickets(allocations: SaleAllocationInput[]): TicketCount {
    return allocations.reduce(
        (total, allocation) => total + allocation.nbTickets,
        0,
    ) as TicketCount;
}

export abstract class IUpdateSaleUsecaseDb {
    abstract getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null>;

    // `status` deliberately cannot express GIFTED: entering, changing and
    // leaving that state is the exclusive business of giftSale / updateGift,
    // each of which writes the status and the gift row in one transaction
    // (spec D15, layer 2). Widening this back to `SaleStatus` reopens the
    // exact hole this redesign closed.
    abstract updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
    }): Promise<void>;

    // PENDING -> GIFTED. Sets the status and inserts the gift row in one
    // transaction, in that order — the composite foreign key rejects the
    // reverse order outright.
    abstract giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }>;

    // GIFTED -> GIFTED. Attaches, corrects or reuses the recipient on an
    // existing gift row. Writes no status at all. `recipient` omitted is the
    // deliberate no-op of spec D9.
    abstract updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }>;
}

@Injectable()
export class UpdateSaleUsecaseDb implements IUpdateSaleUsecaseDb {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
        private readonly salesDbService: ISalesDbService,
        private readonly recipientsDbService: IRecipientsDbService,
    ) {}

    getOneSale(userId: UserId, saleId: SaleId): Promise<Sale | null> {
        return this.salesDbService.getOneSale(userId, saleId);
    }

    // Everything every write path does to the sale row itself: the timestamp
    // mirror, the row update, the allocation replacement and the history entry.
    // Extracted so giftSale / updateGift / updateSale differ only in the gift
    // write they wrap it with.
    private async applySaleWrite(
        tx: Prisma.TransactionClient,
        currentSale: {
            id: string;
            status: SaleStatus;
            listedPrice: number;
            profit: number;
        },
        payload: {
            saleId: SaleId;
            userId: UserId;
            profit: Profit | undefined;
            invest?: Invest;
            listedPrice?: ListedPrice;
            status?: SaleStatus;
            allocations?: SaleAllocationInput[];
        },
    ): Promise<void> {
        const nextStatus: SaleStatus = payload.status ?? currentSale.status;

        const wasSold = currentSale.status === SaleStatus.SOLD;
        const willBeSold = nextStatus === SaleStatus.SOLD;
        const wasCancelled = currentSale.status === SaleStatus.CANCELLED;
        const willBeCancelled = nextStatus === SaleStatus.CANCELLED;

        // soldAt / cancelledAt mirror the current status: set on entry into the
        // state, null on exit. There is no giftedAt branch — a gift's timestamp
        // lives on the gift row and is created and destroyed with it (spec D14,
        // superseding D6).
        const timestampPatch: { soldAt?: Date | null; cancelledAt?: Date | null } = {};

        if (willBeSold && !wasSold) {
            timestampPatch.soldAt = new Date();
        } else if (!willBeSold && wasSold) {
            timestampPatch.soldAt = null;
        }

        if (willBeCancelled && !wasCancelled) {
            timestampPatch.cancelledAt = new Date();
        } else if (!willBeCancelled && wasCancelled) {
            timestampPatch.cancelledAt = null;
        }

        const nbTicketsPatch =
            payload.allocations != null
                ? { nbTickets: sumTickets(payload.allocations) }
                : {};

        // `shake` strips `undefined` (fields not being touched) but would also
        // strip a deliberate `null` (a timestamp nulled on exit), so the
        // timestamp patch is spread back in after. `status` is included only
        // when the caller actually supplies one: updateGift never does, since
        // it writes no status at all (spec D15, layer 2) — resubmitting the
        // unchanged value would still be harmless at the database level (D15
        // notes ON UPDATE RESTRICT only fires on a real value change), but
        // omitting it keeps the write itself honest about what it touches.
        await tx.sales.update({
            data: {
                ...shake({
                    profit: payload.profit,
                    invest: payload.invest,
                    listedPrice: payload.listedPrice,
                    status: payload.status !== undefined ? nextStatus : undefined,
                    ...nbTicketsPatch,
                }),
                ...timestampPatch,
            },
            where: {
                id: payload.saleId,
                userId: payload.userId,
            },
        });

        if (payload.allocations != null) {
            await tx.salePassAllocations.deleteMany({
                where: { saleId: payload.saleId },
            });
            await tx.salePassAllocations.createMany({
                data: payload.allocations.map((allocation) => ({
                    saleId: payload.saleId,
                    seasonPassId: allocation.seasonPassId,
                    nbTickets: allocation.nbTickets,
                })),
            });
        }

        await tx.saleHistories.create({
            data: {
                saleId: currentSale.id,
                listedPrice: currentSale.listedPrice,
                profit: currentSale.profit,
                status: currentSale.status,
            },
        });
    }

    private async resolveRecipientId(
        tx: Prisma.TransactionClient,
        userId: UserId,
        recipient: GiftRecipientInput,
    ): Promise<RecipientId> {
        if ('recipientId' in recipient) {
            return recipient.recipientId;
        }

        // Resolved (or created) on this same `tx`, so a rollback of the sale
        // write rolls a newly created recipient back too (spec D8).
        const resolved = await this.recipientsDbService.findOrCreateForUser(
            userId,
            recipient.recipientName,
            tx,
        );

        return resolved.id;
    }

    private async loadSaleRowOrThrow(
        userId: UserId,
        saleId: SaleId,
    ): Promise<{ id: string; status: SaleStatus; listedPrice: number; profit: number }> {
        const currentSale = await this.prisma.sales.findUnique({
            where: { userId, id: saleId },
        });

        if (!currentSale) {
            throw new DomainException(ErrorCode.SALE_NOT_FOUND);
        }

        return currentSale;
    }

    private async invalidateSaleCaches(userId: UserId, saleId: SaleId): Promise<void> {
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
    }

    async updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
    }): Promise<void> {
        const currentSale = await this.loadSaleRowOrThrow(payload.userId, payload.saleId);

        await this.prisma.$transaction(async (tx) => {
            await this.applySaleWrite(tx, currentSale, payload);
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);
    }

    async giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }> {
        const currentSale = await this.loadSaleRowOrThrow(payload.userId, payload.saleId);

        // Prisma's interactive transaction hands back whatever the callback
        // returns, which keeps the resolved id out of a mutable outer binding.
        const recipientId = await this.prisma.$transaction(async (tx) => {
            // Status first: the (sale_id, sale_status) foreign key means a gift
            // row can only be inserted against a sale that is *already* GIFTED.
            // The order is the database's rule, not a convention (spec D15).
            await this.applySaleWrite(tx, currentSale, {
                ...payload,
                status: SaleStatus.GIFTED,
            });

            const resolvedRecipientId = await this.resolveRecipientId(
                tx,
                payload.userId,
                payload.recipient,
            );

            await tx.gifts.create({
                data: {
                    saleId: payload.saleId,
                    saleStatus: SaleStatus.GIFTED,
                    recipientId: resolvedRecipientId,
                    giftedAt: new Date(),
                },
            });

            return resolvedRecipientId;
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);

        return { recipientId };
    }

    async updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
    }): Promise<{ recipientId: RecipientId }> {
        const currentSale = await this.loadSaleRowOrThrow(payload.userId, payload.saleId);

        const recipientId = await this.prisma.$transaction(async (tx) => {
            // No status write at all: the sale is already GIFTED and stays
            // GIFTED, so there is no transition to make (spec D5's exemption).
            await this.applySaleWrite(tx, currentSale, payload);

            if (payload.recipient == null) {
                const existingGift = await tx.gifts.findUniqueOrThrow({
                    where: { saleId: payload.saleId },
                    select: { recipientId: true },
                });

                return existingGift.recipientId as RecipientId;
            }

            const resolvedRecipientId = await this.resolveRecipientId(
                tx,
                payload.userId,
                payload.recipient,
            );

            await tx.gifts.update({
                where: { saleId: payload.saleId },
                data: { recipientId: resolvedRecipientId },
            });

            return resolvedRecipientId;
        });

        await this.invalidateSaleCaches(payload.userId, payload.saleId);

        return { recipientId };
    }
}
