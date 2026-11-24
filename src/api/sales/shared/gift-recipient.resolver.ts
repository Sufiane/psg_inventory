import { Injectable } from '@nestjs/common';

import type { RecipientId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { IRecipientsDbService } from '../../../db/recipients/recipients.db.interface';
import { GiftRecipientInput } from '../../../db/sales/sales.db.interface';
import { normalizeRecipientName } from '../../../shared/utils/recipient-name.util';

type RecipientPayload = {
    recipientId?: RecipientId;
    recipientName?: string;
};

@Injectable()
export class GiftRecipientResolver {
    constructor(private readonly recipientsDbService: IRecipientsDbService) {}

    // Entry into GIFTED: a recipient is mandatory (spec D9), an empty submit is a user error.
    async resolveNew(
        userId: UserId,
        payload: RecipientPayload,
    ): Promise<GiftRecipientInput> {
        if (payload.recipientId != null) {
            return {
                recipientId: await this.assertOwnedRecipient(userId, payload.recipientId),
            };
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_REQUIRED);
        }

        return { recipientName: name };
    }

    // Already-GIFTED sale: `undefined` means keep the current recipient, since a
    // blank name is the no-op of an unrelated-field edit (spec D9).
    async resolveExisting(
        userId: UserId,
        payload: RecipientPayload,
    ): Promise<GiftRecipientInput | undefined> {
        if (payload.recipientId != null) {
            return {
                recipientId: await this.assertOwnedRecipient(userId, payload.recipientId),
            };
        }

        const name = normalizeRecipientName(payload.recipientName ?? '');

        if (name.length === 0) {
            return undefined;
        }

        return { recipientName: name };
    }

    private async assertOwnedRecipient(
        userId: UserId,
        recipientId: RecipientId,
    ): Promise<RecipientId> {
        const owned = await this.recipientsDbService.findByIdForUser(recipientId, userId);

        if (owned == null) {
            throw new DomainException(ErrorCode.SALE_GIFT_RECIPIENT_NOT_FOUND);
        }

        return owned.id;
    }
}
