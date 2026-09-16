import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersDbModule } from '../../db/users/users.db.module';
import { AuthModule } from '../../auth/auth.module';
import { IUsersService } from './interfaces/users.service.interface';

@Module({
    imports: [UsersDbModule, AuthModule],
    controllers: [UsersController],
    providers: [{ provide: IUsersService, useClass: UsersService }],
})
export class UsersModule {}
