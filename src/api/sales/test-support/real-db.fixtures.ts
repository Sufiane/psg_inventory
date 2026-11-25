import { randomUUID } from 'node:crypto';
import { Competition, SaleStatus } from '@prisma/client';

import type { SaleId, UserId } from '@psg/shared/ids';
import { PrismaService } from '../../../db/prisma.service';

export type RealDbSale = {
    userId: UserId;
    saleId: SaleId;
    matchId: string;
    opponentId: string;
    recipientId: string | null;
};

export async function createRealDbSale(
    prisma: PrismaService,
    options: { status: SaleStatus; listedPrice: number; profit: number },
): Promise<RealDbSale> {
    const suffix = randomUUID();

    const user = await prisma.users.create({
        data: {
            firstName: 'Int',
            lastName: 'Spec',
            email: `int-spec-${suffix}@example.com`,
            password: 'unused',
        },
    });
    const opponent = await prisma.opponents.create({
        data: { name: `int-spec-${suffix}` },
    });
    const match = await prisma.matches.create({
        data: {
            opponentId: opponent.id,
            atHome: true,
            date: new Date('2030-01-01T20:00:00Z'),
            competition: Competition.CHAMPIONSHIP,
        },
    });
    const sale = await prisma.sales.create({
        data: {
            userId: user.id,
            matchId: match.id,
            listedPrice: options.listedPrice,
            profit: options.profit,
            nbTickets: 1,
            status: options.status,
        },
    });

    let recipientId: string | null = null;

    if (options.status === SaleStatus.GIFTED) {
        const recipient = await prisma.recipients.create({
            data: { userId: user.id, name: `int-spec-${suffix}` },
        });

        await prisma.gifts.create({
            data: {
                saleId: sale.id,
                saleStatus: SaleStatus.GIFTED,
                recipientId: recipient.id,
                giftedAt: new Date(),
            },
        });
        recipientId = recipient.id;
    }

    return {
        userId: user.id as UserId,
        saleId: sale.id as SaleId,
        matchId: match.id,
        opponentId: opponent.id,
        recipientId,
    };
}

export async function deleteRealDbSale(
    prisma: PrismaService,
    fixture: RealDbSale,
): Promise<void> {
    await prisma.saleHistories.deleteMany({ where: { saleId: fixture.saleId } });
    await prisma.gifts.deleteMany({ where: { saleId: fixture.saleId } });
    await prisma.sales.deleteMany({ where: { id: fixture.saleId } });
    await prisma.recipients.deleteMany({ where: { userId: fixture.userId } });
    await prisma.matches.deleteMany({ where: { id: fixture.matchId } });
    await prisma.opponents.deleteMany({ where: { id: fixture.opponentId } });
    await prisma.users.deleteMany({ where: { id: fixture.userId } });
}
