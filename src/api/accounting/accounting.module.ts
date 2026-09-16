import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccountingDbModule } from '../../db/accounting/accounting.db.module';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { IAccountingService } from './interfaces/accounting.service.interface';

@Module({
    imports: [AccountingDbModule, SalesDbModule, SeasonPassesDbModule],
    controllers: [AccountingController],
    providers: [{ provide: IAccountingService, useClass: AccountingService }],
    exports: [IAccountingService],
})
export class AccountingModule {}
