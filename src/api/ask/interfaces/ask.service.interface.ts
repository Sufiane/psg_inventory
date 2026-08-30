import type { UserId } from '@psg/shared/ids';
import { AskAnswer } from '../types/ask-answer.type';

export abstract class IAskService {
    abstract ask(userId: UserId, question: string): Promise<AskAnswer>;
}
