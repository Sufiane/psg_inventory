import { Users } from '@prisma/client';
import type { UserId } from '@psg/shared/ids';
import type { Email, HashedPassword } from '@psg/shared/strings';

export abstract class IUsersDbService {
    abstract create(payload: {
        email: Email;
        firstName: string;
        lastName: string;
        password: HashedPassword;
    }): Promise<void>;
    abstract findOneByEmail(email: Email): Promise<Users | null>;
    abstract findById(id: UserId): Promise<Users | null>;
}
