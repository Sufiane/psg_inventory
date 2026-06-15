import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { toHttpException } from '../../common/exceptions/http-exception.mapper';
import { CreateUserDto } from './dto/create-user.dto';
import { Public } from '../../shared/decorators/public.decorator';
import { IUsersService } from './interfaces/users.service.interface';
import { LocalAuthGuard } from '../../shared/guards/local.guard';
import { IAuthService, TokenPair } from '../../auth/interfaces/auth.service.interface';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: IUsersService,
        private readonly authService: IAuthService,
    ) {}

    @Public()
    @Post('/')
    // todo should return a jwt
    async createUser(@Body() payload: CreateUserDto) {
        try {
            await this.usersService.create(payload);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Public()
    @UseGuards(LocalAuthGuard)
    @Post('login')
    login(@Req() { user }: Request & { user: AuthenticatedUser }): Promise<TokenPair> {
        return this.authService.login(user);
    }
}
