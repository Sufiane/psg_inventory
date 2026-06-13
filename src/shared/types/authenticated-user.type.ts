import type { Email, UserId } from '@psg/shared';

export type AuthenticatedUser = {
    id: UserId;
    email: Email;
    firstName: string;
    lastName: string;
    createdAt: Date;
};
