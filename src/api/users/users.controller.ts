import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { Public } from '../../shared/decorators/public.decorator';
import { UsersService } from './users.service';
import { LocalAuthGuard } from '../../shared/guards/local.guard';
import { AuthService } from '../../auth/auth.service';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
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
