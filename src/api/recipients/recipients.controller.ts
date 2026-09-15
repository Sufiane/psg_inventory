import { Controller, Get } from '@nestjs/common';

import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { IRecipientsService } from './interfaces/recipients.service.interface';
import { RecipientListItem } from './types/recipient.type';

@Controller('recipients')
export class RecipientsController {
    constructor(private readonly service: IRecipientsService) {}

    @Get('/')
    async list(@User() user: AuthenticatedUser): Promise<RecipientListItem[]> {
        return await this.service.list(user.id);
    }
}
