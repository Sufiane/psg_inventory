import type { UserId } from '@psg/shared/ids';
import type { Email } from '@psg/shared/strings';

export type AuthenticatedUser = {
    id: UserId;
    email: Email;
    firstName: string;
    lastName: string;
    createdAt: Date;
};
