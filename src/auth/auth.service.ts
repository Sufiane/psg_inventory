import { Injectable } from '@nestjs/common';
import { IUsersDbService } from '../db/users/users.db.interface';
import { omit } from 'radash';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { AuthenticatedUser } from '../shared/types/authenticated-user.type';
import { BCRYPT_SALT_ROUNDS } from '../shared/constants';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersDbService: IUsersDbService,
        private readonly jwtService: JwtService,
    ) {}

    async hashPassword(passwordToHash: string): Promise<string> {
        const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);

        return bcrypt.hash(passwordToHash, salt);
    }

    async validateUser(
        email: string,
        password: string,
    ): Promise<AuthenticatedUser | null> {
        const user = await this.usersDbService.findOneByEmail(email);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return null;
        }

        return omit(user, ['password', 'updatedAt']);
    }

    async login(user: AuthenticatedUser) {
        const payload = { email: user.email, sub: user.id };

        return {
            token: this.jwtService.sign(payload),
        };
    }
}
