import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { RecipientsDb } from './recipients.db';
import { IRecipientsDbService } from './recipients.db.interface';

@Module({
    imports: [PrismaModule],
    providers: [{ provide: IRecipientsDbService, useClass: RecipientsDb }],
    exports: [IRecipientsDbService],
})
export class RecipientsDbModule {}
