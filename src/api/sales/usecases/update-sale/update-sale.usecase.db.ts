import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { shake } from 'radash';

import type { TicketCount } from '@psg/shared/counts';
import type { RecipientId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
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

export type SaleRowSnapshot = {
    id: string;
    status: SaleStatus;
    listedPrice: number;
    profit: number;
};

// The db reports what physically happened — plain data, no domain
// imports (spec D1 Part B; keeps the D4 dependency-cruiser rule valid).
export type SaleWriteOutcome = 'written' | 'not_found';

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
        currentSale: SaleRowSnapshot;
    }): Promise<SaleWriteOutcome>;

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
        currentSale: SaleRowSnapshot;
    }): Promise<{ recipientId: RecipientId } | null>;

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
        currentSale: SaleRowSnapshot;
    }): Promise<{ recipientId: RecipientId } | null>;
}

@Injectable()
export class UpdateSaleUsecaseDb implements IUpdateSaleUsecaseDb {
    private readonly logger = new Logger(UpdateSaleUsecaseDb.name);

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
        currentSale: SaleRowSnapshot,
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

    private async invalidateSaleCaches(userId: UserId, saleId: SaleId): Promise<void> {
        await this.redisService.invalidatePattern(CACHE_KEYS.invalidateSales(userId));
        await this.redisService.invalidate(CACHE_KEYS.sale(saleId));
    }

    // A caught P2025 is returned as the not-found outcome, which a caller
    // cannot tell apart from a real miss — so log the original error's
    // code/message/meta to keep an unexpected P2025 source (e.g. the
    // gift-row lookups) observable server-side instead of silently
    // becoming a 404 (spec behaviour item 3).
    private logP2025(
        operation: string,
        error: Prisma.PrismaClientKnownRequestError,
    ): void {
        this.logger.warn(`${operation}: P2025 mapped to the not-found outcome`, {
            code: error.code,
            message: error.message,
            meta: error.meta,
        });
    }

    async updateSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        status?: 'PENDING' | 'SOLD';
        allocations?: SaleAllocationInput[];
        currentSale: SaleRowSnapshot;
    }): Promise<SaleWriteOutcome> {
        try {
            await this.prisma.$transaction(async (tx) => {
                await this.applySaleWrite(tx, payload.currentSale, payload);
            });

            await this.invalidateSaleCaches(payload.userId, payload.saleId);

            return 'written';
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025'
            ) {
                // The row the usecase loaded was deleted before this write;
                // Prisma rolled the transaction back. The only write that can
                // raise P2025 here is tx.sales.update (allocations/history are
                // creates, so they never do). The db reports what happened as
                // data — the usecase decides what it means.
                this.logP2025('updateSale', error);

                return 'not_found';
            }

            throw error;
        }
    }

    async giftSale(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
        currentSale: SaleRowSnapshot;
    }): Promise<{ recipientId: RecipientId } | null> {
        try {
            // Prisma's interactive transaction hands back whatever the callback
            // returns, which keeps the resolved id out of a mutable outer binding.
            const recipientId = await this.prisma.$transaction(async (tx) => {
                // Status first: the (sale_id, sale_status) foreign key means a gift
                // row can only be inserted against a sale that is *already* GIFTED.
                // The order is the database's rule, not a convention (spec D15).
                await this.applySaleWrite(tx, payload.currentSale, {
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
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025'
            ) {
                // tx.sales.update ran first inside applySaleWrite, so a vanished
                // sale reports here before any gift/recipient work. Same signal →
                // data pipeline as UsersDb.create's P2002 → null (spec D1/D3).
                this.logP2025('giftSale', error);

                return null;
            }

            throw error;
        }
    }

    async updateGift(payload: {
        saleId: SaleId;
        userId: UserId;
        profit: Profit | undefined;
        invest?: Invest;
        listedPrice?: ListedPrice;
        recipient?: GiftRecipientInput;
        allocations?: SaleAllocationInput[];
        currentSale: SaleRowSnapshot;
    }): Promise<{ recipientId: RecipientId } | null> {
        try {
            const recipientId = await this.prisma.$transaction(async (tx) => {
                // No status write at all: the sale is already GIFTED and stays
                // GIFTED, so there is no transition to make (spec D5's exemption).
                await this.applySaleWrite(tx, payload.currentSale, payload);

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
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025'
            ) {
                // tx.sales.update ran first inside applySaleWrite; a vanished sale
                // reports as null here. (A P2025 from the gift-row lookups — a
                // GIFTED sale without a gift row — reports the same way; that
                // state is unreachable through the API, spec behaviour item 3.)
                this.logP2025('updateGift', error);

                return null;
            }

            throw error;
        }
    }
}
