import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DomainException } from '../common/exceptions/domain.exception';
import { ErrorCode } from '../common/exceptions/error-codes.enum';
import {
    ILlmService,
    LlmCompletionRequest,
    LlmCompletionResult,
} from './llm.service.interface';

const MODEL = 'gemini-3.7-flash';

// The system prompt caps answers at a few sentences, so this bounds a runaway
// generation without any risk of truncating a legitimate answer.
const MAX_OUTPUT_TOKENS = 2000;

const TOO_MANY_REQUESTS = 429;

// Provider failures are classified by HTTP status, not by SDK exception class
// name, so this stays correct regardless of how @google/genai names its error
// types across versions.
function extractStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const candidate = error as { status?: unknown; code?: unknown };

    if (typeof candidate.status === 'number') {
        return candidate.status;
    }

    if (typeof candidate.code === 'number') {
        return candidate.code;
    }

    return null;
}

@Injectable()
export class LlmService extends ILlmService {
    private readonly logger = new Logger(LlmService.name);
    private readonly client: GoogleGenAI;

    constructor(configService: ConfigService<{ GEMINI_API_KEY: string }, true>) {
        super();

        // Key passed explicitly rather than relying on SDK env auto-discovery,
        // so GEMINI_API_KEY is our own convention and validated at boot.
        this.client = new GoogleGenAI({
            apiKey: configService.get('GEMINI_API_KEY'),
        });
    }

    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
        const startedAt = Date.now();

        try {
            const response = await this.client.models.generateContent({
                model: MODEL,
                contents: request.userMessage,
                config: {
                    systemInstruction: request.systemPrompt,
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                },
            });

            const text = response.text?.trim() ?? '';

            if (text.length === 0) {
                this.logger.warn('Model returned no text; treating as unanswerable');

                throw new DomainException(ErrorCode.ASK_UNANSWERABLE);
            }

            const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
            const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

            this.logger.log(
                `ask completion ok model=${MODEL} in=${inputTokens} out=${outputTokens} ms=${Date.now() - startedAt}`,
            );

            return { text, inputTokens, outputTokens };
        } catch (error) {
            if (error instanceof DomainException) {
                throw error;
            }

            const status = extractStatus(error);

            if (status === TOO_MANY_REQUESTS) {
                this.logger.warn('Provider rate limit hit');

                throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
            }

            this.logger.error(`Gemini call failed status=${status ?? 'unknown'}`, error);

            throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
        }
    }
}
