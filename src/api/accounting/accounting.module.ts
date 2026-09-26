import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { SalesDbModule } from '../../db/sales/sales.db.module';
import { IAccountingService } from './interfaces/accounting.service.interface';
import { GetSeasonAccountingUsecaseModule } from './usecases/get-season-accounting/get-season-accounting.usecase.module';
import { GetAmortizationUsecaseModule } from './usecases/get-amortization/get-amortization.usecase.module';

@Module({
    imports: [
        SalesDbModule,
        GetSeasonAccountingUsecaseModule,
        GetAmortizationUsecaseModule,
    ],
    controllers: [AccountingController],
    providers: [{ provide: IAccountingService, useClass: AccountingService }],
    exports: [IAccountingService],
})
export class AccountingModule {}
