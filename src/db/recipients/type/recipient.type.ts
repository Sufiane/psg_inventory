import type { RecipientId, UserId } from '@psg/shared/ids';

export type Recipient = {
    id: RecipientId;
    userId: UserId;
    name: string;
};

export type RecipientWithGiftCount = Recipient & {
    giftCount: number;
};
