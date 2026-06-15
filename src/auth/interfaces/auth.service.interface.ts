import type { UserId } from '@psg/shared/ids';
import type { Email, HashedPassword, JwtToken, RefreshToken } from '@psg/shared/strings';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

export type TokenPair = {
    accessToken: JwtToken;
    refreshToken: RefreshToken;
};

export abstract class IAuthService {
    abstract hashPassword(passwordToHash: string): Promise<HashedPassword>;
    abstract validateUser(
        email: Email,
        password: string,
    ): Promise<AuthenticatedUser | null>;
    abstract login(user: AuthenticatedUser): Promise<TokenPair>;
    abstract refreshTokens(refreshToken: RefreshToken): Promise<TokenPair>;
    abstract logout(userId: UserId, refreshToken: RefreshToken): Promise<void>;
}
