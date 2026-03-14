import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

export abstract class IAuthService {
    abstract hashPassword(passwordToHash: string): Promise<string>;
    abstract validateUser(
        email: string,
        password: string,
    ): Promise<AuthenticatedUser | null>;
    abstract login(user: AuthenticatedUser): Promise<{ token: string }>;
}
