import { Injectable } from '@nestjs/common';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { omit } from 'radash';
import { CreateUserDto } from './dto/create-user.dto';
import { IAuthService } from '../../auth/interfaces/auth.service.interface';
import { IUsersService } from './interfaces/users.service.interface';

@Injectable()
export class UsersService implements IUsersService {
    constructor(
        private readonly userDbService: IUsersDbService,
        private readonly authService: IAuthService,
    ) {}

    async create(payload: CreateUserDto): Promise<void> {
        const createPayload = omit(payload, ['password']);
        const hashedPassword = await this.authService.hashPassword(payload.password);

        await this.userDbService.create({ ...createPayload, password: hashedPassword });
    }
}
