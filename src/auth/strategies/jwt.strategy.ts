import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserId } from '@psg/shared/ids';
import type { Email } from '@psg/shared/strings';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { omit } from 'radash';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        private readonly usersDbService: IUsersDbService,
        configService: ConfigService<{ JWT_SECRET: string }, true>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET'),
        });
    }

    // REMARKS: we could add a cache store, to store db responses to avoid
    // multiple db calls for the same user in a short period of time
    async validate(payload: {
        sub: UserId;
        email: Email;
    }): Promise<AuthenticatedUser | undefined> {
        const user = await this.usersDbService.findOneByEmail(payload.email);

        if (!user) {
            return undefined;
        }

        const safe = omit(user, ['password', 'updatedAt']);

        return { ...safe, id: safe.id as UserId, email: safe.email as Email };
    }
}
