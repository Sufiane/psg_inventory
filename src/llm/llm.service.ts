import { FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';

import { DomainException } from '../common/exceptions/domain.exception';
import { ErrorCode } from '../common/exceptions/error-codes.enum';
import {
    ILlmService,
    LlmCompletionRequest,
    LlmCompletionResult,
} from './llm.service.interface';

const MODEL = 'gemini-3.7-flash';

// The system prompt caps answers at a few sentences, so this bounds a
// runaway generation. Raised from 2000 to leave headroom for THINKING_LEVEL
// below: "low" thinking still consumes some of this budget before candidate
// text is produced (unlike a hard-disabled thinkingBudget: 0), so the cap
// needs slack beyond what the answer text alone would need.
const MAX_OUTPUT_TOKENS = 4000;

// Gemini 3-series models (this app uses gemini-3.7-flash) control thinking
// via thinkingConfig.thinkingLevel ("low"/"medium"/"high", default
// "medium"), not the older thinkingBudget field — thinkingBudget isn't part
// of the documented 3-series config surface. The answers this feature needs
// are short, grounded lookups over a JSON payload, not multi-step
// reasoning, so thinking is set to the lowest level rather than left at the
// default, minimizing (though not eliminating, see MAX_OUTPUT_TOKENS above)
// the risk of thinking exhausting the output cap before any answer text is
// produced.
const THINKING_LEVEL_LOW = ThinkingLevel.LOW;

const TOO_MANY_REQUESTS = 429;

// Google's "model overloaded" status. Transient — worth a couple of quick
// retries before failing the whole /ask.
const SERVICE_UNAVAILABLE = 503;

const MAX_RETRY_ATTEMPTS = 2;
const RETRY_BACKOFF_BASE_MS = 300;

// Bounds a stalled call so it fails fast instead of riding out to
// Cloudflare's edge timeout as an opaque 524.
const GEMINI_TIMEOUT_MS = 30_000;

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
export class LlmService implements ILlmService {
    private readonly logger = new Logger(LlmService.name);
    // Undefined when GEMINI_API_KEY is unset, so the app can still boot for
    // every other route. Only a call to complete() fails, and it fails
    // clearly, at request time.
    private readonly client: GoogleGenAI | undefined;

    constructor(configService: ConfigService<{ GEMINI_API_KEY?: string }, true>) {
        const apiKey = configService.get('GEMINI_API_KEY', { infer: true });

        // Key passed explicitly rather than relying on SDK env auto-discovery,
        // so GEMINI_API_KEY is our own convention. GEMINI_API_KEY is
        // @IsOptional() @IsString() in env.schema.ts, so GEMINI_API_KEY= (set
        // but empty — e.g. an unresolved secret-manager reference) validates
        // fine as '', which is not null. Guard on length too, or a real
        // client gets constructed with an empty key and the failure surfaces
        // later as an opaque upstream 401/403 instead of this clear log line.
        this.client =
            apiKey == null || apiKey.length === 0
                ? undefined
                : new GoogleGenAI({ apiKey });
    }

    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
        if (this.client == null) {
            this.logger.error('GEMINI_API_KEY is not configured; /ask cannot run');

            throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
        }

        const startedAt = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        try {
            const response = await this.callGemini(
                this.client,
                {
                    model: MODEL,
                    contents: request.userMessage,
                    config: {
                        systemInstruction: request.systemPrompt,
                        maxOutputTokens: MAX_OUTPUT_TOKENS,
                        thinkingConfig: { thinkingLevel: THINKING_LEVEL_LOW },
                        abortSignal: controller.signal,
                    },
                },
                controller.signal,
            );

            const text = response.text?.trim() ?? '';
            const finishReason = response.candidates?.[0]?.finishReason;

            // Checked unconditionally, before the empty-text branch below,
            // not only when text is empty: under ThinkingLevel.LOW, thinking
            // can consume most of MAX_OUTPUT_TOKENS before candidate text
            // generation starts, so the cap can cut generation off
            // mid-sentence and still leave a non-empty fragment. That
            // fragment must not reach the caller as a complete, trustworthy
            // answer next to the authoritative figures panel.
            if (finishReason === FinishReason.MAX_TOKENS) {
                this.logger.warn('Model output was truncated by the token cap');

                throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
            }

            if (text.length === 0) {
                throw this.buildUnansweredException(finishReason);
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

            if (controller.signal.aborted) {
                this.logger.error(`Gemini call timed out after ${GEMINI_TIMEOUT_MS}ms`);

                throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
            }

            const status = extractStatus(error);

            if (status === TOO_MANY_REQUESTS) {
                this.logger.warn('Provider rate limit hit');

                throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
            }

            this.logger.error(`Gemini call failed status=${status ?? 'unknown'}`, error);

            throw new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE);
        } finally {
            clearTimeout(timer);
        }
    }

    // Retries only a 503 (SERVICE_UNAVAILABLE) — every other failure
    // (network error, 429, 4xx, an aborted signal) is left to the caller's
    // catch block untouched, since those aren't the transient-overload
    // pattern this exists for.
    private async callGemini(
        client: GoogleGenAI,
        payload: Parameters<GoogleGenAI['models']['generateContent']>[0],
        signal: AbortSignal,
        attempt = 0,
    ): Promise<Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>> {
        try {
            return await client.models.generateContent(payload);
        } catch (error) {
            if (
                extractStatus(error) !== SERVICE_UNAVAILABLE ||
                attempt >= MAX_RETRY_ATTEMPTS
            ) {
                throw error;
            }

            const nextAttempt = attempt + 1;
            const backoffMs = RETRY_BACKOFF_BASE_MS * nextAttempt;

            this.logger.warn(
                `Gemini overloaded (503); retrying attempt=${nextAttempt}/${MAX_RETRY_ATTEMPTS} in ${backoffMs}ms`,
            );

            // node:timers/promises rejects immediately with an AbortError if
            // `signal` is already aborted or fires while waiting, so a
            // backoff wait can never outlive GEMINI_TIMEOUT_MS.
            await sleep(backoffMs, undefined, { signal });

            return this.callGemini(client, payload, signal, nextAttempt);
        }
    }

    // Reached only once the MAX_TOKENS case above has already been ruled
    // out, so empty text here always means a genuine safety/content block or
    // a prompt-level block — it should read to the user as "bad question"
    // (422), never as a provider problem.
    private buildUnansweredException(
        finishReason: FinishReason | undefined,
    ): DomainException {
        this.logger.warn(
            `Model returned no text; finishReason=${finishReason ?? 'none'}; treating as unanswerable`,
        );

        return new DomainException(ErrorCode.ASK_UNANSWERABLE);
    }
}
