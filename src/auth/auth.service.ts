import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';

import type { UserId } from '@psg/shared/ids';
import type { Email, HashedPassword, JwtToken, RefreshToken } from '@psg/shared/strings';
import { omit } from 'radash';

import { IUsersDbService } from '../db/users/users.db.interface';
import CACHE_KEYS from '../redis/CACHE_KEYS';
import { RedisService } from '../redis/redis.service';
import { BCRYPT_SALT_ROUNDS } from '../shared/constants';
import { AuthenticatedUser } from '../shared/types/authenticated-user.type';
import { IAuthService, TokenPair } from './interfaces/auth.service.interface';

const DEFAULT_REFRESH_TTL_SEC = 60 * 60 * 24 * 7;
const REFRESH_SECRET_BYTES = 32;

@Injectable()
export class AuthService implements IAuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly refreshTtlSec: number;

    constructor(
        private readonly usersDbService: IUsersDbService,
        private readonly jwtService: JwtService,
        private readonly redisService: RedisService,
        configService: ConfigService<{ REFRESH_TOKEN_EXPIRES_SEC?: string }, true>,
    ) {
        const configured = configService.get('REFRESH_TOKEN_EXPIRES_SEC', {
            infer: true,
        });

        this.refreshTtlSec = configured ? Number(configured) : DEFAULT_REFRESH_TTL_SEC;
    }

    async hashPassword(passwordToHash: string): Promise<HashedPassword> {
        const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);

        return (await bcrypt.hash(passwordToHash, salt)) as HashedPassword;
    }

    async validateUser(
        email: Email,
        password: string,
    ): Promise<AuthenticatedUser | null> {
        const user = await this.usersDbService.findOneByEmail(email);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return null;
        }

        const safe = omit(user, ['password', 'updatedAt']);

        return { ...safe, id: safe.id as UserId, email: safe.email as Email };
    }

    async login(user: AuthenticatedUser & { role?: string }): Promise<TokenPair> {
        return this.issueTokenPair(user.id, user.email, user.role, randomUUID());
    }

    // Single-use refresh: looks up the presented token in Redis, deletes it,
    // and issues a new pair under the same family. If the token is absent
    // but well-formed, treat as theft/reuse and revoke the whole family so
    // the legitimate user is forced to re-authenticate.
    async refreshTokens(refreshToken: RefreshToken): Promise<TokenPair> {
        const parsed = parseRefreshToken(refreshToken);

        if (!parsed) {
            throw new UnauthorizedException('invalid refresh token');
        }

        const { familyId, secret } = parsed;
        const key = CACHE_KEYS.refreshToken(familyId, secret);
        const stored = await this.redisService.peek<string>(key);

        if (stored === null || stored.value === null) {
            this.logger.warn(
                `refresh token reuse detected for family=${familyId}; revoking family`,
            );
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRefreshFamily(familyId),
            );

            throw new UnauthorizedException('refresh token reused');
        }

        await this.redisService.invalidate(key);

        const userId = stored.value as UserId;
        const user = await this.usersDbService.findById(userId);

        if (!user) {
            await this.redisService.invalidatePattern(
                CACHE_KEYS.invalidateRefreshFamily(familyId),
            );

            throw new UnauthorizedException('user no longer exists');
        }

        return this.issueTokenPair(
            user.id as UserId,
            user.email as Email,
            undefined,
            familyId,
        );
    }

    async logout(refreshToken: RefreshToken): Promise<void> {
        const parsed = parseRefreshToken(refreshToken);

        if (!parsed) {
            return;
        }

        await this.redisService.invalidatePattern(
            CACHE_KEYS.invalidateRefreshFamily(parsed.familyId),
        );
    }

    private async issueTokenPair(
        userId: UserId,
        email: Email,
        role: string | undefined,
        familyId: string,
    ): Promise<TokenPair> {
        const accessToken = this.jwtService.sign({
            email,
            sub: userId,
            role,
        }) as JwtToken;

        const secret = randomBytes(REFRESH_SECRET_BYTES).toString('hex');
        const refreshToken = `${familyId}.${secret}` as RefreshToken;

        await this.redisService.set(
            CACHE_KEYS.refreshToken(familyId, secret),
            userId,
            this.refreshTtlSec,
        );

        return { accessToken, refreshToken };
    }
}

function parseRefreshToken(token: string): { familyId: string; secret: string } | null {
    const parts = token.split('.');

    if (parts.length !== 2) {
        return null;
    }

    const [familyId, secret] = parts;

    if (!familyId || !secret) {
        return null;
    }

    return { familyId, secret };
}
