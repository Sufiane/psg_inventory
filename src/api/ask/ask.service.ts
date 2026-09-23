import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';

import { IAskService } from './interfaces/ask.service.interface';
import { AskAnswer } from './types/ask-answer.type';
import { IAskQuestionUsecase } from './usecases/ask-question/ask-question.usecase';

@Injectable()
export class AskService implements IAskService {
    constructor(private readonly askQuestionUsecase: IAskQuestionUsecase) {}

    async ask(userId: UserId, question: string): Promise<AskAnswer> {
        return this.askQuestionUsecase.execute(userId, question);
    }
}
