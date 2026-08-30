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

            expect(result.figures.currentSeasonProfit).toBe(840);
            expect(result.figures.currentSeasonSales).toBe(12);
            expect(result.figures.currentSeasonTickets).toBe(24);
            expect(result.figures.allTimeProfit).toBe(840);
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
    });
});
