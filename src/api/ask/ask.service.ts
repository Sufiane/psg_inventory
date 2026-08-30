import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheKey } from '@psg/shared/cache';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import {
    ILlmService,
    LlmCompletionRequest,
    LlmCompletionResult,
} from '../../llm/llm.service.interface';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { RedisService } from '../../redis/redis.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { IAccountingService } from '../accounting/interfaces/accounting.service.interface';
import { formatMatch } from '../matches/formatters/format-match.formatter';
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
        // Computed once and threaded through both the increment and the
        // (possible) release below, rather than each call recomputing
        // `new Date()` independently. A request that starts near the top of
        // an hour and fails seconds (or longer) later, after the hour has
        // rolled over, must still release the same bucket it incremented —
        // recomputing at release time would target the next hour's key
        // instead, either silently skipping the refund or stealing a slot
        // from a concurrent request that legitimately started in the new
        // window.
        const rateLimitKey = this.rateLimitKey(userId);

        await this.enforceRateLimit(rateLimitKey);

        const generatedAt = new Date();
        const seasonWindow = getCurrentSeasonDate();
        const seasonStartYear = seasonWindow.start.getUTCFullYear() as SeasonYear;

        const [currentSeason, allTime, amortization, seasonMatches] = await Promise.all([
            this.accountingService.getCurrentSeason(userId),
            this.accountingService.getAllTime(userId),
            this.accountingService.getAmortization(userId, seasonStartYear),
            // getCurrentSeason(true) resolves to future fixtures only (from
            // "now" forward), so the played/upcoming split downstream would
            // always see an empty `played` array. getSeasonMatches is bounded
            // by the season's start date instead, covering matches that have
            // already been played this season.
            this.matchesService.getSeasonMatches(String(seasonStartYear), true),
        ]);

        const matches = seasonMatches.map((match) => formatMatch(match, true));

        const askContext = buildAskContext({
            currentSeason,
            allTime,
            amortization,
            matches,
            seasonWindow,
            generatedAt,
        });

        const completion = await this.completeOrReleaseSlot(rateLimitKey, {
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

    private async enforceRateLimit(rateLimitKey: CacheKey<number>): Promise<void> {
        const count = await this.redisService.incrementWithTtl(
            rateLimitKey,
            HOUR_IN_SECONDS,
        );

        if (count > this.rateLimitPerHour) {
            this.logger.warn(`ask rate limit exceeded count=${count}`);

            throw new DomainException(ErrorCode.ASK_RATE_LIMITED);
        }
    }

    // A failed model call still consumed an hourly slot for zero answers, so
    // give the slot back on every complete() failure, no exceptions.
    // enforceRateLimit() is the only legitimate source of a deliberate
    // non-refund, and it always throws before complete() is ever invoked —
    // so this catch can never see our own limiter's ASK_RATE_LIMITED. The
    // only thing that can throw ASK_RATE_LIMITED from inside complete() is
    // llm.service.ts mapping a Gemini-side 429 (their shared quota across
    // all users, not this user's fault), which should be refunded exactly
    // like a transient 5xx/network error.
    private async completeOrReleaseSlot(
        rateLimitKey: CacheKey<number>,
        request: LlmCompletionRequest,
    ): Promise<LlmCompletionResult> {
        try {
            return await this.llmService.complete(request);
        } catch (error) {
            await this.releaseRateLimitSlot(rateLimitKey);

            throw error;
        }
    }

    private async releaseRateLimitSlot(rateLimitKey: CacheKey<number>): Promise<void> {
        try {
            await this.redisService.decrement(rateLimitKey);
        } catch (error) {
            this.logger.warn(
                `failed to release rate limit slot for key=${rateLimitKey}`,
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
    // the database's, not the model's. netProfit is computed once in
    // build-context.ts and shared here, so the tile and the model's prose
    // can never disagree about what "profit" means for a period.
    private toFigures(askContext: AskContext): AskFigures {
        return {
            seasonStartYear: askContext.season.startYear,
            currentSeasonProfit: askContext.currentSeason.netProfit,
            currentSeasonSales:
                askContext.currentSeason.realized?.totalListedValue ?? null,
            currentSeasonTickets:
                askContext.currentSeason.realized?.totalNbTickets ?? null,
            allTimeProfit: askContext.allTime.netProfit,
            allTimeSales: askContext.allTime.realized?.totalListedValue ?? null,
            pendingSales: askContext.currentSeason.pending?.totalListedValue ?? null,
            totalSeasonInvestment: askContext.currentSeason.totalSeasonInvestment,
            amortizationRemaining: askContext.amortization.remaining,
            brokeEven: askContext.amortization.brokeEven,
        };
    }
}
