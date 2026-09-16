import { Module } from '@nestjs/common';

import { RecipientsDbModule } from '../../db/recipients/recipients.db.module';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientsController } from './recipients.controller';
import { RecipientsService } from './recipients.service';

@Module({
    imports: [RecipientsDbModule],
    controllers: [RecipientsController],
    providers: [{ provide: IRecipientsService, useClass: RecipientsService }],
})
export class RecipientsModule {}
