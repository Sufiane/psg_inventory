import { Injectable } from '@nestjs/common';
import { IUsersDbService } from '../db/users/users.db.interface';
import { omit } from 'radash';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { UserId } from '@psg/shared/ids';
import type { Email, HashedPassword, JwtToken } from '@psg/shared/strings';
import { AuthenticatedUser } from '../shared/types/authenticated-user.type';
import { BCRYPT_SALT_ROUNDS } from '../shared/constants';
import { IAuthService } from './interfaces/auth.service.interface';

@Injectable()
export class AuthService implements IAuthService {
    constructor(
        private readonly usersDbService: IUsersDbService,
        private readonly jwtService: JwtService,
    ) {}

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

    async login(
        user: AuthenticatedUser & { role?: string },
    ): Promise<{ token: JwtToken }> {
        const payload = { email: user.email, sub: user.id, role: user.role };

        return {
            token: this.jwtService.sign(payload) as JwtToken,
        };
    }
}
