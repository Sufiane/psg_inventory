import type { UserId } from '@psg/shared/ids';
import { RecipientListItem } from '../types/recipient.type';

export abstract class IRecipientsService {
    abstract list(userId: UserId): Promise<RecipientListItem[]>;
}
