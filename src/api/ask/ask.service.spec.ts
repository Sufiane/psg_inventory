import { ConfigService } from '@nestjs/config';
import { mock, MockProxy } from 'jest-mock-extended';
import type { UserId } from '@psg/shared/ids';

import { AskService } from './ask.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { IAccountingService } from '../accounting/interfaces/accounting.service.interface';
import { IMatchesService } from '../matches/interfaces/matches.service.interface';
import { ILlmService } from '../../llm/llm.service.interface';
import { RedisService } from '../../redis/redis.service';
import type { TimePeriodAccounting } from '../accounting/types/time-period-accounting.type';
import type { Amortization } from '../accounting/types/amortization.type';

const USER_ID = 'user-1' as UserId;

const period = {
    realized: {
        totalSales: 12,
        totalProfit: 840,
        totalInvest: 300,
        totalNbTickets: 24,
        averageTicketPrice: 95,
        averageProfit: 70,
        highest: null,
        lowest: null,
    },
    unrealized: null,
    pending: {
        totalSales: 2,
        totalProfit: 40,
        totalInvest: 0,
        totalNbTickets: 3,
        averageTicketPrice: 80,
        averageProfit: 20,
        highest: null,
        lowest: null,
    },
    seasonInvestments: [],
    totalSeasonInvestment: 900,
    leadTime: null,
} as unknown as TimePeriodAccounting;

const amortization = {
    seasonStartYear: 2025,
    passPrice: 900,
    hasPass: true,
    totalRealized: 840,
    progress: 0.93,
    remaining: 60,
    surplus: 0,
    breakEven: null,
    perMatch: [],
    passes: [],
} as unknown as Amortization;

describe('AskService', () => {
    let accounting: MockProxy<IAccountingService>;
    let matches: MockProxy<IMatchesService>;
    let llm: MockProxy<ILlmService>;
    let redis: MockProxy<RedisService>;
    let service: AskService;

    beforeEach(() => {
        accounting = mock<IAccountingService>();
        matches = mock<IMatchesService>();
        llm = mock<ILlmService>();
        redis = mock<RedisService>();

        accounting.getCurrentSeason.mockResolvedValue(period);
        accounting.getAllTime.mockResolvedValue(period);
        accounting.getAmortization.mockResolvedValue(amortization);
        matches.getCurrentSeason.mockResolvedValue([]);
        redis.incrementWithTtl.mockResolvedValue(1);
        llm.complete.mockResolvedValue({
            text: 'You have made EUR 840 this season.',
            inputTokens: 900,
            outputTokens: 40,
        });

        service = new AskService(
            accounting,
            matches,
            llm,
            redis,
            new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: '20' }),
        );
    });

    describe('when the question is within the rate limit', () => {
        it('returns the model answer', async () => {
            const result = await service.ask(USER_ID, 'How is the season going?');

            expect(result.answer).toBe('You have made EUR 840 this season.');
        });

        it('echoes the question back', async () => {
            const result = await service.ask(USER_ID, 'How is the season going?');

            expect(result.question).toBe('How is the season going?');
        });

        it('scopes every accounting call to the requesting user', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            expect(accounting.getCurrentSeason).toHaveBeenCalledWith(USER_ID);
            expect(accounting.getAllTime).toHaveBeenCalledWith(USER_ID);
            expect(accounting.getAmortization).toHaveBeenCalledWith(
                USER_ID,
                expect.any(Number),
            );
        });

        it('returns figures taken from the context, not from the model', async () => {
            const result = await service.ask(USER_ID, 'How is the season going?');

            // Net profit: totalProfit(840) - totalInvest(300) -
            // totalSeasonInvestment(900), the same formula the rest of the
            // app uses (web/src/routes/+page.server.ts).
            expect(result.figures.currentSeasonProfit).toBe(-360);
            expect(result.figures.currentSeasonSales).toBe(12);
            expect(result.figures.currentSeasonTickets).toBe(24);
            expect(result.figures.allTimeProfit).toBe(-360);
            expect(result.figures.pendingSales).toBe(2);
            expect(result.figures.totalSeasonInvestment).toBe(900);
            expect(result.figures.amortizationRemaining).toBe(60);
            expect(result.figures.brokeEven).toBe(false);
        });

        it('never sends identity fields to the model', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            const sent = llm.complete.mock.calls[0]![0].userMessage;

            expect(sent).not.toContain(USER_ID);
            expect(sent).not.toContain('userId');
            expect(sent).not.toContain('password');
        });

        it('sends the question and the context in the user message', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            const sent = llm.complete.mock.calls[0]![0].userMessage;

            expect(sent).toContain('How is the season going?');
            expect(sent).toContain('"currency": "EUR"');
        });

        it('sends the frozen system prompt', async () => {
            await service.ask(USER_ID, 'How is the season going?');

            const sent = llm.complete.mock.calls[0]![0].systemPrompt;

            expect(sent).toContain('Never estimate, extrapolate, or invent a number');
        });
    });

    describe('when the user has exceeded the hourly rate limit', () => {
        beforeEach(() => {
            redis.incrementWithTtl.mockResolvedValue(21);
        });

        it('throws a rate limited domain exception', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                new DomainException(ErrorCode.ASK_RATE_LIMITED),
            );
        });

        it('does not call the model', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow();

            expect(llm.complete).not.toHaveBeenCalled();
        });

        it('does not query accounting', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow();

            expect(accounting.getCurrentSeason).not.toHaveBeenCalled();
        });
    });

    describe('when ASK_RATE_LIMIT_PER_HOUR is malformed', () => {
        describe('when it is an empty string', () => {
            beforeEach(() => {
                service = new AskService(
                    accounting,
                    matches,
                    llm,
                    redis,
                    new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: '' }),
                );
                redis.incrementWithTtl.mockResolvedValue(21);
            });

            it('falls back to the default limit instead of disabling it', async () => {
                await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                    new DomainException(ErrorCode.ASK_RATE_LIMITED),
                );
            });
        });

        describe('when it is non-numeric garbage', () => {
            beforeEach(() => {
                service = new AskService(
                    accounting,
                    matches,
                    llm,
                    redis,
                    new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: 'not-a-number' }),
                );
                redis.incrementWithTtl.mockResolvedValue(21);
            });

            it('falls back to the default limit instead of disabling it', async () => {
                await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                    new DomainException(ErrorCode.ASK_RATE_LIMITED),
                );
            });
        });

        describe('when it is zero or negative', () => {
            beforeEach(() => {
                service = new AskService(
                    accounting,
                    matches,
                    llm,
                    redis,
                    new ConfigService({ ASK_RATE_LIMIT_PER_HOUR: '-5' }),
                );
                redis.incrementWithTtl.mockResolvedValue(1);
            });

            it('falls back to the default limit instead of blocking every request', async () => {
                await expect(service.ask(USER_ID, 'anything')).resolves.toBeDefined();
            });
        });
    });

    describe('the profit figures', () => {
        describe('when the period has realized sales', () => {
            it('reports net profit, not gross totalProfit', async () => {
                const result = await service.ask(USER_ID, 'anything');

                // 840 (totalProfit) - 300 (totalInvest) - 900
                // (totalSeasonInvestment): matches the net-profit formula
                // used everywhere else in the app, so a "profit" figure
                // never contradicts the break-even tile for the same season.
                expect(result.figures.currentSeasonProfit).toBe(-360);
                expect(result.figures.allTimeProfit).toBe(-360);
            });
        });

        describe('when the period has no realized sales', () => {
            beforeEach(() => {
                accounting.getCurrentSeason.mockResolvedValue({
                    ...period,
                    realized: null,
                });
                accounting.getAllTime.mockResolvedValue({
                    ...period,
                    realized: null,
                });
            });

            it('reports profit as null rather than a false zero', async () => {
                const result = await service.ask(USER_ID, 'anything');

                expect(result.figures.currentSeasonProfit).toBeNull();
                expect(result.figures.allTimeProfit).toBeNull();
            });
        });
    });

    describe('when the model call fails', () => {
        beforeEach(() => {
            llm.complete.mockRejectedValue(
                new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE),
            );
        });

        it('propagates the domain exception unchanged', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE),
            );
        });

        it('releases the rate limit slot it consumed', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow();

            expect(redis.decrement).toHaveBeenCalledTimes(1);
        });

        describe('when releasing the slot also fails', () => {
            beforeEach(() => {
                redis.decrement.mockRejectedValue(new Error('redis unavailable'));
            });

            it('still propagates the original llm error, not the decrement error', async () => {
                await expect(service.ask(USER_ID, 'anything')).rejects.toThrow(
                    new DomainException(ErrorCode.ASK_LLM_UNAVAILABLE),
                );
            });
        });
    });

    describe('when the model call fails with a Gemini-side (provider) rate-limited error', () => {
        beforeEach(() => {
            llm.complete.mockRejectedValue(
                new DomainException(ErrorCode.ASK_RATE_LIMITED),
            );
        });

        // Our own hourly limiter throws out of enforceRateLimit(), before
        // complete() is ever called — it can never land in this catch. The
        // only source of ASK_RATE_LIMITED here is llm.service.ts mapping a
        // Gemini-side 429 (their shared quota, not this user's fault), so it
        // should be refunded like any other complete() failure.
        it('releases the rate limit slot it consumed', async () => {
            await expect(service.ask(USER_ID, 'anything')).rejects.toThrow();

            expect(redis.decrement).toHaveBeenCalledTimes(1);
        });
    });
});
