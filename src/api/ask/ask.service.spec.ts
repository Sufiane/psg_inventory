import { Test } from '@nestjs/testing';
import { mock, MockProxy } from 'vitest-mock-extended';
import type { UserId } from '@psg/shared/ids';

import { AskService } from './ask.service';
import { IAskService } from './interfaces/ask.service.interface';
import { IAskQuestionUsecase } from './usecases/ask-question/ask-question.usecase';
import type { AskAnswer } from './types/ask-answer.type';

const USER_ID = 'user-1' as UserId;

describe('AskService', () => {
    let usecase: MockProxy<IAskQuestionUsecase>;
    let service: IAskService;

    beforeEach(async () => {
        usecase = mock<IAskQuestionUsecase>();
        usecase.execute.mockResolvedValue({
            question: 'How is the season going?',
            answer: 'The season is going.',
            figures: {} as AskAnswer['figures'],
            generatedAt: new Date().toISOString(),
        });

        const module = await Test.createTestingModule({
            providers: [
                { provide: IAskService, useClass: AskService },
                { provide: IAskQuestionUsecase, useValue: usecase },
            ],
        }).compile();

        service = module.get(IAskService);

        module.useLogger(false);
    });

    describe('ask', () => {
        it('delegates to the ask-question usecase with the same arguments', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            expect(usecase.execute).toHaveBeenCalledTimes(1);
            expect(usecase.execute).toHaveBeenCalledWith(
                USER_ID,
                'How is the season going?',
            );
        });
    });
});
