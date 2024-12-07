import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { DbModule } from '../../db/db.module';

@Module({
    imports: [DbModule],
    controllers: [SalesController],
    providers: [SalesService],
})
export class SalesModule {
}
