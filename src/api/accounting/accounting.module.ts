import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { DbModule } from '../../db/db.module';
import { IAccountingService } from './interfaces/accounting.service.interface';

@Module({
    imports: [DbModule],
    controllers: [AccountingController],
    providers: [{ provide: IAccountingService, useClass: AccountingService }],
})
export class AccountingModule {}
