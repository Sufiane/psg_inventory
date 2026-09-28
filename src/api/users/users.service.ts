import { Injectable } from '@nestjs/common';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { IAuthService } from '../../auth/interfaces/auth.service.interface';
import { IUsersService } from './interfaces/users.service.interface';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';

@Injectable()
export class UsersService implements IUsersService {
    constructor(
        private readonly userDbService: IUsersDbService,
        private readonly authService: IAuthService,
    ) {}

    async create(payload: CreateUserDto): Promise<void> {
        const hashedPassword = await this.authService.hashPassword(payload.password);

        const created = await this.userDbService.create({
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            password: hashedPassword,
        });

        if (created == null) {
            throw new DomainException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
    }
}
