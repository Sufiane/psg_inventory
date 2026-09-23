import { Module } from '@nestjs/common';

import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { IAskService } from './interfaces/ask.service.interface';
import { AskQuestionUsecaseModule } from './usecases/ask-question/ask-question.usecase.module';

@Module({
    imports: [AskQuestionUsecaseModule],
    controllers: [AskController],
    providers: [{ provide: IAskService, useClass: AskService }],
})
export class AskModule {}
