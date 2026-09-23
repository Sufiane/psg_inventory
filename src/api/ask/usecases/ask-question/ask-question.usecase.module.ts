import { Module } from '@nestjs/common';

import { LlmModule } from '../../../../llm/llm.module';
import { RedisModule } from '../../../../redis/redis.module';
import { AccountingModule } from '../../../accounting/accounting.module';
import { MatchesModule } from '../../../matches/matches.module';
import { AskQuestionUsecase, IAskQuestionUsecase } from './ask-question.usecase';

@Module({
    imports: [AccountingModule, MatchesModule, LlmModule, RedisModule],
    providers: [{ provide: IAskQuestionUsecase, useClass: AskQuestionUsecase }],
    exports: [IAskQuestionUsecase],
})
export class AskQuestionUsecaseModule {}
