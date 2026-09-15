import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/client';

import type { RecipientId, UserId } from '@psg/shared/ids';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { ONE_HOUR_TTL } from '../../shared/constants';
import { PrismaService } from '../prisma.service';
import { IRecipientsDbService } from './recipients.db.interface';
import { Recipient, RecipientWithGiftCount } from './type/recipient.type';

@Injectable()
export class RecipientsService implements IRecipientsDbService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
    ) {}

    async listForUser(userId: UserId): Promise<RecipientWithGiftCount[]> {
        const result = await this.redisService.get(
            CACHE_KEYS.recipients(userId),
            ONE_HOUR_TTL,
            async () => {
                const rows = await this.prisma.recipients.findMany({
                    where: { userId },
                    select: {
                        id: true,
                        userId: true,
                        name: true,
                        // No status filter: a gift row cannot exist against a
                        // non-GIFTED sale (spec D15), so counting rows is
                        // correct by construction rather than by remembering
                        // to filter.
                        _count: { select: { Gifts: true } },
                    },
                    orderBy: { name: 'asc' },
                });

                return rows.map((row) => ({
                    id: row.id,
                    userId: row.userId,
                    name: row.name,
                    giftCount: row._count.Gifts,
                })) as RecipientWithGiftCount[];
            },
        );

        return result ?? [];
    }

    findByNameForUser(
        userId: UserId,
        name: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Recipient | null> {
        const client = tx ?? this.prisma;

        return client.recipients.findFirst({
            where: { userId, name: { equals: name, mode: 'insensitive' } },
            select: { id: true, userId: true, name: true },
        }) as Promise<Recipient | null>;
    }

    findByIdForUser(recipientId: RecipientId, userId: UserId): Promise<Recipient | null> {
        return this.prisma.recipients.findFirst({
            where: { id: recipientId, userId },
            select: { id: true, userId: true, name: true },
        }) as Promise<Recipient | null>;
    }

    async create(
        userId: UserId,
        name: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Recipient> {
        const client = tx ?? this.prisma;

        // The case-insensitive find-then-create in findOrCreateForUser isn't
        // atomic, and the `@@unique([userId, name])` index is case-sensitive,
        // so two near-simultaneous submits for the exact same, same-case name
        // (double-click, client retry) can both pass the find and race here.
        // A plain `create` would let the loser hit P2002 — and when `tx` is
        // the sale's own $transaction (the only real caller path, via
        // findOrCreateForUser), Prisma does not savepoint individual
        // statements inside an interactive transaction: catching that error
        // and re-querying on the same `tx` would itself fail with `25P02
        // current transaction is aborted`, surfacing as an unhandled 500 —
        // the exact failure a try/catch-and-refind here was meant to avoid.
        // `upsert` compiles to one atomic `INSERT ... ON CONFLICT DO UPDATE`
        // statement, so Postgres resolves that identical-name race itself and
        // no error is ever raised: there is nothing to catch and nothing to
        // retry. This only closes the race for identical (same-case) names —
        // the unique index it upserts against is case-sensitive, so two
        // concurrent submits that differ only in case (e.g. "Marc" and "marc")
        // both miss the case-insensitive find above, conflict on different
        // keys, and still produce two rows. That narrower race is accepted
        // (sequential submits of differing case are caught by the find, and a
        // single-user ledger has no concurrent writer to make it likely) —
        // documented here so it isn't mistaken for something this upsert
        // closes too.
        const created = (await client.recipients.upsert({
            where: { userId_name: { userId, name } },
            create: { userId, name },
            update: { name },
            select: { id: true, userId: true, name: true },
        })) as Recipient;

        // When `tx` is given, this write is part of a larger caller-owned
        // transaction (see findOrCreateForUser) that hasn't committed yet —
        // invalidating now would advertise a recipient that a later rollback
        // could still undo. The caller invalidates after its transaction
        // commits instead.
        if (tx == null) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRecipients(userId),
            );
        }

        return created;
    }

    async findOrCreateForUser(
        userId: UserId,
        name: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Recipient> {
        const existing = await this.findByNameForUser(userId, name, tx);

        if (existing != null) {
            return existing;
        }

        return this.create(userId, name, tx);
    }
}
