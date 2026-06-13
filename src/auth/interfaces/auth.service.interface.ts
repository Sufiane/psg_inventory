import type { Email, HashedPassword, JwtToken } from '@psg/shared';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

export abstract class IAuthService {
    abstract hashPassword(passwordToHash: string): Promise<HashedPassword>;
    abstract validateUser(
        email: Email,
        password: string,
    ): Promise<AuthenticatedUser | null>;
    abstract login(user: AuthenticatedUser): Promise<{ token: JwtToken }>;
}
