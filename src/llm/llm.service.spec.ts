import { ConfigService } from '@nestjs/config';
import { FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';

import { DomainException } from '../common/exceptions/domain.exception';
import { ErrorCode } from '../common/exceptions/error-codes.enum';
import { LlmService } from './llm.service';

const generateContentMock = jest.fn();

jest.mock('@google/genai', () => {
    return {
        GoogleGenAI: jest.fn().mockImplementation(() => ({
            models: { generateContent: generateContentMock },
        })),
        FinishReason: {
            STOP: 'STOP',
            MAX_TOKENS: 'MAX_TOKENS',
            SAFETY: 'SAFETY',
            RECITATION: 'RECITATION',
        },
        ThinkingLevel: {
            LOW: 'LOW',
            MEDIUM: 'MEDIUM',
            HIGH: 'HIGH',
        },
    };
});

function configWithKey(
    apiKey?: string,
): ConfigService<{ GEMINI_API_KEY?: string }, true> {
    return new ConfigService(apiKey == null ? {} : { GEMINI_API_KEY: apiKey });
}

describe('LlmService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('when GEMINI_API_KEY is not configured', () => {
        let service: LlmService;

        beforeEach(() => {
            service = new LlmService(configWithKey(undefined));
        });

        it('does not construct a Gemini client', () => {
            expect(GoogleGenAI as unknown as jest.Mock).not.toHaveBeenCalled();
        });

        it('throws ASK_LLM_UNAVAILABLE without calling the model', async () => {
            await expect(
                service.complete({ systemPrompt: 'system', userMessage: 'question' }),
            ).rejects.toThrow(new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE));

            expect(generateContentMock).not.toHaveBeenCalled();
        });
    });

    describe('when GEMINI_API_KEY is configured', () => {
        let service: LlmService;

        beforeEach(() => {
            service = new LlmService(configWithKey('test-key'));
        });

        describe('when the model responds normally', () => {
            beforeEach(() => {
                generateContentMock.mockResolvedValue({
                    text: 'You have made EUR 840 this season.',
                    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40 },
                    candidates: [{ finishReason: FinishReason.STOP }],
                });
            });

            it('returns the model text and token counts', async () => {
                const result = await service.complete({
                    systemPrompt: 'system',
                    userMessage: 'question',
                });

                expect(result).toEqual({
                    text: 'You have made EUR 840 this season.',
                    inputTokens: 900,
                    outputTokens: 40,
                });
            });

            it('sets thinking to the lowest level so it cannot silently eat the output budget', async () => {
                await service.complete({
                    systemPrompt: 'system',
                    userMessage: 'question',
                });

                const config = generateContentMock.mock.calls[0][0].config;

                expect(config.thinkingConfig).toEqual({
                    thinkingLevel: ThinkingLevel.LOW,
                });
            });
        });

        describe('when generation is cut off by the output token cap', () => {
            beforeEach(() => {
                generateContentMock.mockResolvedValue({
                    text: '',
                    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 2000 },
                    candidates: [{ finishReason: FinishReason.MAX_TOKENS }],
                });
            });

            it('throws ASK_LLM_UNAVAILABLE, not ASK_UNANSWERABLE', async () => {
                await expect(
                    service.complete({ systemPrompt: 'system', userMessage: 'question' }),
                ).rejects.toThrow(new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE));
            });
        });

        describe('when the response is blocked for safety', () => {
            beforeEach(() => {
                generateContentMock.mockResolvedValue({
                    text: '',
                    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 0 },
                    candidates: [{ finishReason: FinishReason.SAFETY }],
                });
            });

            it('throws ASK_UNANSWERABLE', async () => {
                await expect(
                    service.complete({ systemPrompt: 'system', userMessage: 'question' }),
                ).rejects.toThrow(new DomainException(ErrorCode.ASK_UNANSWERABLE));
            });
        });

        describe('when there is no candidate at all (prompt-level block)', () => {
            beforeEach(() => {
                generateContentMock.mockResolvedValue({
                    text: '',
                    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 0 },
                    candidates: [],
                });
            });

            it('throws ASK_UNANSWERABLE', async () => {
                await expect(
                    service.complete({ systemPrompt: 'system', userMessage: 'question' }),
                ).rejects.toThrow(new DomainException(ErrorCode.ASK_UNANSWERABLE));
            });
        });

        describe('when the provider returns HTTP 429', () => {
            beforeEach(() => {
                generateContentMock.mockRejectedValue({ status: 429 });
            });

            it('throws ASK_RATE_LIMITED', async () => {
                await expect(
                    service.complete({ systemPrompt: 'system', userMessage: 'question' }),
                ).rejects.toThrow(new DomainException(ErrorCode.ASK_RATE_LIMITED));
            });
        });

        describe('when the provider call fails unexpectedly', () => {
            beforeEach(() => {
                generateContentMock.mockRejectedValue(new Error('network error'));
            });

            it('throws ASK_LLM_UNAVAILABLE', async () => {
                await expect(
                    service.complete({ systemPrompt: 'system', userMessage: 'question' }),
                ).rejects.toThrow(new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE));
            });
        });
    });
});
