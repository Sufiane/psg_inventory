import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RecipientsDbModule } from '../recipients/recipients.db.module';
import { SalesDb } from './sales.db';
import { ISalesDbService } from './sales.db.interface';

@Module({
    imports: [PrismaModule, RecipientsDbModule],
    providers: [{ provide: ISalesDbService, useClass: SalesDb }],
    exports: [ISalesDbService],
})
export class SalesDbModule {}
