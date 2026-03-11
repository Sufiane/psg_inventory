import { Users } from '@prisma/client';

export abstract class IUsersDbService {
    abstract create(payload: {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
    }): Promise<void>;
    abstract findOneByEmail(email: string): Promise<Users | null>;
}
