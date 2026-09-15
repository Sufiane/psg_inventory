import { Module } from '@nestjs/common';

import { DbModule } from '../../db/db.module';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientsController } from './recipients.controller';
import { RecipientsService } from './recipients.service';

@Module({
    imports: [DbModule],
    controllers: [RecipientsController],
    providers: [{ provide: IRecipientsService, useClass: RecipientsService }],
})
export class RecipientsModule {}
