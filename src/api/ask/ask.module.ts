import { Module } from '@nestjs/common';

import { LlmModule } from '../../llm/llm.module';
import { AccountingModule } from '../accounting/accounting.module';
import { MatchesModule } from '../matches/matches.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { IAskService } from './interfaces/ask.service.interface';

@Module({
    imports: [AccountingModule, MatchesModule, LlmModule],
    controllers: [AskController],
    providers: [{ provide: IAskService, useClass: AskService }],
})
export class AskModule {}
