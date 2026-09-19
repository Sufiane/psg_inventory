import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RecipientsDbModule } from '../recipients/recipients.db.module';
import { RedisModule } from '../../redis/redis.module';
import { SalesImportDb } from './sales-import.db';
import { ISalesImportDbService } from './sales-import.db.interface';

@Module({
    imports: [PrismaModule, RecipientsDbModule, RedisModule],
    providers: [{ provide: ISalesImportDbService, useClass: SalesImportDb }],
    exports: [ISalesImportDbService],
})
export class SalesImportDbModule {}
