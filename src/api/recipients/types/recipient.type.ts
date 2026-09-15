import type { RecipientId } from '@psg/shared/ids';

export type RecipientListItem = {
    id: RecipientId;
    name: string;
    giftCount: number;
};
