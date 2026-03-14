import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { DbModule } from '../../db/db.module';
import { ISalesService } from './interfaces/sales.service.interface';

@Module({
    imports: [DbModule],
    controllers: [SalesController],
    providers: [{ provide: ISalesService, useClass: SalesService }],
})
export class SalesModule {}
