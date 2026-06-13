import { Users } from '@prisma/client';
import type { Email, HashedPassword } from '@psg/shared';

export abstract class IUsersDbService {
    abstract create(payload: {
        email: Email;
        firstName: string;
        lastName: string;
        password: HashedPassword;
    }): Promise<void>;
    abstract findOneByEmail(email: Email): Promise<Users | null>;
}
