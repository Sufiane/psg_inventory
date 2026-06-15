import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '../shared/decorators/public.decorator';
import { User } from '../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../shared/types/authenticated-user.type';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { IAuthService, TokenPair } from './interfaces/auth.service.interface';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: IAuthService) {}

    @Public()
    @Post('refresh')
    refresh(@Body() payload: RefreshTokenDto): Promise<TokenPair> {
        return this.authService.refreshTokens(payload.refreshToken);
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    logout(
        @User() user: AuthenticatedUser,
        @Body() payload: RefreshTokenDto,
    ): Promise<void> {
        return this.authService.logout(user.id, payload.refreshToken);
    }
}
