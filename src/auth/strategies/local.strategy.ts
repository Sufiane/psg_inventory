import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Email } from '@psg/shared/strings';
import type { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { IAuthService } from '../interfaces/auth.service.interface';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly authService: IAuthService) {
        super({ usernameField: 'email' });
    }

    async validate(email: Email, password: string): Promise<AuthenticatedUser> {
        const user = await this.authService.validateUser(email, password);

        if (!user) {
            throw new UnauthorizedException();
        }

        return user;
    }
}
