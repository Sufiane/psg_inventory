import type { Prisma } from '.prisma/client';
import type { RecipientId, UserId } from '@psg/shared/ids';
import { Recipient, RecipientWithGiftCount } from './type/recipient.type';

export abstract class IRecipientsDbService {
    abstract listForUser(userId: UserId): Promise<RecipientWithGiftCount[]>;
    abstract findByNameForUser(
        userId: UserId,
        name: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Recipient | null>;
    abstract findByIdForUser(
        recipientId: RecipientId,
        userId: UserId,
    ): Promise<Recipient | null>;
    abstract create(
        userId: UserId,
        name: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Recipient>;
    // Resolve-or-create, all on `tx` when one is passed, so callers that are
    // themselves inside a transaction (e.g. sales.service.ts updateSale) get
    // an atomic write: a rollback of the outer transaction rolls this back
    // too, instead of leaving an orphaned recipient behind.
    abstract findOrCreateForUser(
        userId: UserId,
        name: string,
        tx?: Prisma.TransactionClient,
    ): Promise<Recipient>;
}
