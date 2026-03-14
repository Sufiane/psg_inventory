import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { Public } from '../../shared/decorators/public.decorator';
import { IUsersService } from './interfaces/users.service.interface';
import { LocalAuthGuard } from '../../shared/guards/local.guard';
import { IAuthService } from '../../auth/interfaces/auth.service.interface';
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
        await this.usersService.create(payload);
    }

    @Public()
    @UseGuards(LocalAuthGuard)
    @Post('login')
    login(
        @Req() { user }: Request & { user: AuthenticatedUser },
    ): Promise<{ token: string }> {
        return this.authService.login(user);
    }
}
