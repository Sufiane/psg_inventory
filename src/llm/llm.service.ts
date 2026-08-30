import { FinishReason, GoogleGenAI } from '@google/genai';
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

// This tier shares MAX_OUTPUT_TOKENS with Gemini's default-on "thinking"
// budget: a long thinking chain can exhaust the cap before any candidate
// text is produced. The answers this feature needs are short, grounded
// lookups over a JSON payload, not multi-step reasoning, so thinking is
// disabled outright rather than budgeted, removing the failure mode.
const THINKING_BUDGET_DISABLED = 0;

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
    // Undefined when GEMINI_API_KEY is unset, so the app can still boot for
    // every other route. Only a call to complete() fails, and it fails
    // clearly, at request time.
    private readonly client: GoogleGenAI | undefined;

    constructor(configService: ConfigService<{ GEMINI_API_KEY?: string }, true>) {
        super();

        const apiKey = configService.get('GEMINI_API_KEY', { infer: true });

        // Key passed explicitly rather than relying on SDK env auto-discovery,
        // so GEMINI_API_KEY is our own convention.
        this.client = apiKey == null ? undefined : new GoogleGenAI({ apiKey });
    }

    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
        if (this.client == null) {
            this.logger.error('GEMINI_API_KEY is not configured; /ask cannot run');

            throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
        }

        const startedAt = Date.now();

        try {
            const response = await this.client.models.generateContent({
                model: MODEL,
                contents: request.userMessage,
                config: {
                    systemInstruction: request.systemPrompt,
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    thinkingConfig: { thinkingBudget: THINKING_BUDGET_DISABLED },
                },
            });

            const text = response.text?.trim() ?? '';

            if (text.length === 0) {
                throw this.buildEmptyResponseException(
                    response.candidates?.[0]?.finishReason,
                );
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

    // Empty candidate text is ambiguous on its own: a genuine safety/content
    // block should read to the user as "bad question" (422), but a length
    // cutoff (the thinking-budget-exhaustion failure mode this tier is prone
    // to) is a provider problem that should read as "try again" (502), not
    // as an accusation about the question. finishReason disambiguates them.
    private buildEmptyResponseException(
        finishReason: FinishReason | undefined,
    ): DomainException {
        if (finishReason === FinishReason.MAX_TOKENS) {
            this.logger.warn('Model output was truncated by the token cap');

            return new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
        }

        this.logger.warn(
            `Model returned no text; finishReason=${finishReason ?? 'none'}; treating as unanswerable`,
        );

        return new DomainException(ErrorCode.ASK_UNANSWERABLE);
    }
}
