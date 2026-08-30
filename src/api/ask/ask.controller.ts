import { Body, Controller, Post } from '@nestjs/common';

import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { AskQuestionDto } from './dto/ask-question.dto';
import { IAskService } from './interfaces/ask.service.interface';
import { AskAnswer } from './types/ask-answer.type';

@Controller('ask')
export class AskController {
    constructor(private readonly askService: IAskService) {}

    @Post('/')
    async ask(
        @User() user: AuthenticatedUser,
        @Body() { question }: AskQuestionDto,
    ): Promise<AskAnswer> {
        return await this.askService.ask(user.id, question);
    }
}
