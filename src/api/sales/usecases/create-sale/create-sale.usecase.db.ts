import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';

import type { MatchId, RecipientId, SaleId, UserId } from '@psg/shared/ids';
import type { Invest, ListedPrice, Profit } from '@psg/shared/money';
import { IMatchesDbService } from '../../../../db/matches/matches.db.interface';
import { IRecipientsDbService } from '../../../../db/recipients/recipients.db.interface';
import {
    GiftRecipientInput,
    SaleAllocationInput,
} from '../../../../db/sales/sales.db.interface';
import { PrismaService } from '../../../../db/prisma.service';
import { SaleStatusTarget } from '../../dto/update-sale.dto';
import { sumTickets } from '../../shared/sum-tickets.util';

export type CreateSaleWrite = {
    userId: UserId;
    matchId: MatchId;
    status: SaleStatusTarget;
    listedPrice: ListedPrice;
    profit: Profit;
    invest: Invest;
    allocations: SaleAllocationInput[];
    recipient?: GiftRecipientInput | undefined;
};

export type CreatedSale = { id: SaleId; recipientId: RecipientId | null };

export abstract class ICreateSaleUsecaseDb {
    abstract getMatchDate(matchId: MatchId): Promise<Date | null>;
    abstract createSale(payload: CreateSaleWrite): Promise<CreatedSale>;
}

@Injectable()
export class CreateSaleUsecaseDb implements ICreateSaleUsecaseDb {
    constructor(
        private readonly prisma: PrismaService,
        private readonly matchesDbService: IMatchesDbService,
        private readonly recipientsDbService: IRecipientsDbService,
    ) {}

    async getMatchDate(matchId: MatchId): Promise<Date | null> {
        const match = await this.matchesDbService.getOneMatch(matchId);

        return match?.date ?? null;
    }

    async createSale(payload: CreateSaleWrite): Promise<CreatedSale> {
        return this.prisma.$transaction(async (tx) => {
            const sale = await tx.sales.create({
                data: {
                    userId: payload.userId,
                    matchId: payload.matchId,
                    listedPrice: payload.listedPrice,
                    profit: payload.profit,
                    invest: payload.invest,
                    nbTickets: sumTickets(payload.allocations),
                    status: SaleStatus[payload.status],
                    ...(payload.status === 'SOLD' ? { soldAt: new Date() } : {}),
                    Allocations: {
                        create: payload.allocations.map((allocation) => ({
                            seasonPassId: allocation.seasonPassId,
                            nbTickets: allocation.nbTickets,
                        })),
                    },
                },
                select: { id: true },
            });
            const saleId = sale.id as SaleId;

            if (payload.recipient == null) {
                return { id: saleId, recipientId: null };
            }

            const recipientId = await this.resolveRecipientId(
                tx,
                payload.userId,
                payload.recipient,
            );

            // Sale row is already GIFTED: the (sale_id, sale_status) FK needs it first.
            await tx.gifts.create({
                data: {
                    saleId,
                    saleStatus: SaleStatus.GIFTED,
                    recipientId,
                    giftedAt: new Date(),
                },
            });

            return { id: saleId, recipientId };
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

        const resolved = await this.recipientsDbService.findOrCreateForUser(
            userId,
            recipient.recipientName,
            tx,
        );

        return resolved.id;
    }
}
