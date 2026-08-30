import { Module } from '@nestjs/common';

import { ILlmService } from './llm.service.interface';
import { LlmService } from './llm.service';

@Module({
    providers: [{ provide: ILlmService, useClass: LlmService }],
    exports: [ILlmService],
})
export class LlmModule {}
