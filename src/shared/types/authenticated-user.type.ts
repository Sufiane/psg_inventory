import type { UserId } from '@psg/shared';

export type AuthenticatedUser = {
    id: UserId;
    email: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
};
