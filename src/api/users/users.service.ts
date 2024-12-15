import { Injectable } from '@nestjs/common';
import { UsersService as UserDbService } from '../../db/users.service';
import { omit } from 'radash';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class UsersService {
    constructor(
        private readonly userDbService: UserDbService,
        private readonly authService: AuthService,
    ) {}

    async create(payload: CreateUserDto): Promise<void> {
        const createPayload = omit(payload, ['password']);
        const hashedPassword = await this.authService.hashPassword(payload.password);

        await this.userDbService.create({ ...createPayload, password: hashedPassword });
    }
}
