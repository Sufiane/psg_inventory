import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { UsersDb } from './users.db';
import { IUsersDbService } from './users.db.interface';

@Module({
    imports: [PrismaModule],
    providers: [{ provide: IUsersDbService, useClass: UsersDb }],
    exports: [IUsersDbService],
})
export class UsersDbModule {}
