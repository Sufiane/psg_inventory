import { Users } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import type { Email, HashedPassword } from '@psg/shared/strings';

export type UserRecord = Users & { id: UserId; email: Email };

export abstract class IUsersDbService {
    abstract create(payload: {
        email: Email;
        firstName: string;
        lastName: string;
        password: HashedPassword;
    }): Promise<void>;
    abstract findOneByEmail(email: Email): Promise<UserRecord | null>;
    abstract findById(id: UserId): Promise<UserRecord | null>;
}
