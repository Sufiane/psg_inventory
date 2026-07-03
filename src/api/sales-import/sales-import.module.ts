import { Module } from '@nestjs/common';

import { DbModule } from '../../db/db.module';
import { SalesImportController } from './sales-import.controller';
import { SalesImportService } from './sales-import.service';

@Module({
    imports: [DbModule],
    controllers: [SalesImportController],
    providers: [SalesImportService],
})
export class SalesImportModule {}
