import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheKey } from '@psg/shared/cache';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { ILlmService } from '../../llm/llm.service.interface';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { IAccountingService } from '../accounting/interfaces/accounting.service.interface';
import { IMatchesService } from '../matches/interfaces/matches.service.interface';
import { IAskService } from './interfaces/ask.service.interface';
import { buildAskContext } from './context/build-context';
import { SYSTEM_PROMPT } from './prompts/system-prompt';
import { AskAnswer, AskFigures } from './types/ask-answer.type';
import { AskContext } from './types/context.type';

const DEFAULT_RATE_LIMIT_PER_HOUR = 20;
const HOUR_IN_SECONDS = 3600;

@Injectable()
export class AskService extends IAskService {
    private readonly logger = new Logger(AskService.name);
    private readonly rateLimitPerHour: number;

    constructor(
        private readonly accountingService: IAccountingService,
        private readonly matchesService: IMatchesService,
        private readonly llmService: ILlmService,
        private readonly redisService: RedisService,
        configService: ConfigService<{ ASK_RATE_LIMIT_PER_HOUR?: string }, true>,
    ) {
        super();

        const configured = configService.get('ASK_RATE_LIMIT_PER_HOUR', {
            infer: true,
        });

        const parsed = configured == null ? NaN : parseInt(configured, 10);

        this.rateLimitPerHour =
            Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_PER_HOUR;
    }

    async ask(userId: UserId, question: string): Promise<AskAnswer> {
        await this.enforceRateLimit(userId);

        const generatedAt = new Date();
        const seasonWindow = getCurrentSeasonDate();
        const seasonStartYear = seasonWindow.start.getUTCFullYear() as SeasonYear;

        const [currentSeason, allTime, amortization, matches] = await Promise.all([
            this.accountingService.getCurrentSeason(userId),
            this.accountingService.getAllTime(userId),
            this.accountingService.getAmortization(userId, seasonStartYear),
            this.matchesService.getCurrentSeason(true),
        ]);

        const askContext = buildAskContext({
            currentSeason,
            allTime,
            amortization,
            matches,
            seasonWindow,
            generatedAt,
        });

        const completion = await this.completeOrReleaseSlot(userId, {
            systemPrompt: SYSTEM_PROMPT,
            userMessage: this.buildUserMessage(askContext, question),
        });

        this.logger.log(
            `ask answered questionChars=${question.length} in=${completion.inputTokens} out=${completion.outputTokens}`,
        );

        return {
            question,
            answer: completion.text,
            figures: this.toFigures(askContext),
            generatedAt: askContext.generatedAt,
        };
    }

    private async enforceRateLimit(userId: UserId): Promise<void> {
        const key = this.rateLimitKey(userId);
        const count = await this.redisService.incrementWithTtl(key, HOUR_IN_SECONDS);

        if (count > this.rateLimitPerHour) {
            this.logger.warn(`ask rate limit exceeded count=${count}`);

            throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
        }
    }

    // A failed model call still consumed an hourly slot for zero answers. A
    // transient Gemini 5xx/network error shouldn't cost the user one of
    // their questions, so give the slot back on any failure except a rate
    // limit itself (that one is the count doing its job, not a failure).
    private async completeOrReleaseSlot(
        userId: UserId,
        request: Parameters<ILlmService['complete']>[0],
    ): Promise<Awaited<ReturnType<ILlmService['complete']>>> {
        try {
            return await this.llmService.complete(request);
        } catch (error) {
            const isRateLimited =
                error instanceof DomainException &&
                error.code === ErrorCode.ASK_RATE_LIMITED;

            if (!isRateLimited) {
                await this.releaseRateLimitSlot(userId);
            }

            throw error;
        }
    }

    private async releaseRateLimitSlot(userId: UserId): Promise<void> {
        try {
            await this.redisService.decrement(this.rateLimitKey(userId));
        } catch (error) {
            this.logger.warn(
                `failed to release rate limit slot for userId=${userId}`,
                error,
            );
        }
    }

    private rateLimitKey(userId: UserId): CacheKey<number> {
        const hourBucket = new Date().toISOString().slice(0, 13);

        return CACHE_KEYS.askRateLimit(userId, hourBucket);
    }

    private buildUserMessage(askContext: AskContext, question: string): string {
        return `Here is the data:\n\n${JSON.stringify(askContext, null, 2)}\n\nQuestion: ${question}`;
    }

    // Figures come straight from the context, never parsed out of the model's
    // prose. The UI renders these, so the authoritative numbers on screen are
    // the database's, not the model's.
    private toFigures(askContext: AskContext): AskFigures {
        return {
            seasonStartYear: askContext.season.startYear,
            currentSeasonProfit: askContext.currentSeason.realized?.totalProfit ?? null,
            currentSeasonSales: askContext.currentSeason.realized?.totalSales ?? null,
            currentSeasonTickets:
                askContext.currentSeason.realized?.totalNbTickets ?? null,
            allTimeProfit: askContext.allTime.realized?.totalProfit ?? null,
            allTimeSales: askContext.allTime.realized?.totalSales ?? null,
            pendingSales: askContext.currentSeason.pending?.totalSales ?? null,
            totalSeasonInvestment: askContext.currentSeason.totalSeasonInvestment,
            amortizationRemaining: askContext.amortization.remaining,
            brokeEven: askContext.amortization.brokeEven,
        };
    }
}
