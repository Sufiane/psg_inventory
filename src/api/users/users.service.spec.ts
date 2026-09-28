import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { Users } from '@prisma/client';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { IAuthService } from '../../auth/interfaces/auth.service.interface';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import type { HashedPassword } from '@psg/shared/strings';

describe('UsersService', () => {
    let service: UsersService;
    let usersDb: DeepMockProxy<IUsersDbService>;
    let authService: DeepMockProxy<IAuthService>;

    const dto = {
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse',
    } as CreateUserDto;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: IUsersDbService, useValue: mockDeep<IUsersDbService>() },
                { provide: IAuthService, useValue: mockDeep<IAuthService>() },
            ],
        }).compile();

        service = module.get(UsersService);
        usersDb = module.get(IUsersDbService);
        authService = module.get(IAuthService);

        module.useLogger(false);
    });

    describe('when the email is still free', () => {
        it('hashes the password and creates the user', async () => {
            authService.hashPassword.mockResolvedValueOnce('hashed' as HashedPassword);
            usersDb.create.mockResolvedValueOnce({ id: 'user-1' } as Users);

            await service.create(dto);

            expect(usersDb.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: dto.email,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    password: 'hashed',
                }),
            );
        });

        it('resolves without a result', async () => {
            authService.hashPassword.mockResolvedValueOnce('hashed' as HashedPassword);
            usersDb.create.mockResolvedValueOnce({ id: 'user-1' } as Users);

            await expect(service.create(dto)).resolves.toBeUndefined();
        });
    });

    describe('when the email is already taken', () => {
        it('rejects with EMAIL_ALREADY_EXISTS', async () => {
            authService.hashPassword.mockResolvedValueOnce('hashed' as HashedPassword);
            usersDb.create.mockResolvedValueOnce(null);

            await expect(service.create(dto)).rejects.toMatchObject({
                code: ErrorCode.EMAIL_ALREADY_EXISTS,
            });
        });
    });
});
