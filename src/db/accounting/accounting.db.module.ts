import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { AccountingDb } from './accounting.db';
import { IAccountingDbService } from './accounting.db.interface';

@Module({
    imports: [PrismaModule],
    providers: [{ provide: IAccountingDbService, useClass: AccountingDb }],
    exports: [IAccountingDbService],
})
export class AccountingDbModule {}
