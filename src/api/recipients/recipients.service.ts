import { Injectable } from '@nestjs/common';

import type { UserId } from '@psg/shared/ids';
import { IRecipientsDbService } from '../../db/recipients/recipients.db.interface';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientListItem } from './types/recipient.type';

@Injectable()
export class RecipientsService implements IRecipientsService {
    constructor(private readonly recipientsDbService: IRecipientsDbService) {}

    async list(userId: UserId): Promise<RecipientListItem[]> {
        const recipients = await this.recipientsDbService.listForUser(userId);

        // Most-gifted first: the combobox should offer the people this user
        // actually gives tickets to before the one-off from two seasons ago.
        return recipients
            .map((recipient) => ({
                id: recipient.id,
                name: recipient.name,
                giftCount: recipient.giftCount,
            }))
            .sort((first, second) => {
                if (first.giftCount !== second.giftCount) {
                    return second.giftCount - first.giftCount;
                }

                return first.name.localeCompare(second.name);
            });
    }
}
