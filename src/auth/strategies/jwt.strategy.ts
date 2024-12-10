import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../db/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        private readonly usersDbService: UsersService,
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
        sub: string,
        email: string;
    }): Promise<{ id: string; userEmail: string } | undefined> {
        const user = await this.usersDbService.findOneByEmail(payload.email);

        if (!user) {
            return undefined;
        }

        return { id: payload.sub, userEmail: payload.email };
    }
}
