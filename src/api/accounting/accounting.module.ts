import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { DbModule } from '../../db/db.module';

@Module({
    imports: [DbModule],
    controllers: [AccountingController],
    providers: [AccountingService],
})
export class AccountingModule {}
