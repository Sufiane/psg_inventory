import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import type { TicketCount } from '@psg/shared/counts';
import type { SeasonPassId } from '@psg/shared/ids';
import { SaleAllocationsValidator } from './sale-allocations.validator';
import { IMatchesDbService } from '../../../db/matches/matches.db.interface';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { SaleAllocationDto } from '../dto/sale-allocation.dto';
import {
    matchFixture,
    matchId,
    passFixture,
    passId,
    userId,
} from '../test-support/sales.fixtures';

describe('SaleAllocationsValidator', () => {
    let validator: SaleAllocationsValidator;
    let matchesDbService: DeepMockProxy<IMatchesDbService>;
    let seasonPassesDbService: DeepMockProxy<ISeasonPassesDbService>;

    beforeEach(async () => {
        matchesDbService = mockDeep<IMatchesDbService>();
        seasonPassesDbService = mockDeep<ISeasonPassesDbService>();
        const module = await Test.createTestingModule({
            providers: [
                SaleAllocationsValidator,
                { provide: IMatchesDbService, useValue: matchesDbService },
                { provide: ISeasonPassesDbService, useValue: seasonPassesDbService },
            ],
        }).compile();

        validator = module.get(SaleAllocationsValidator);

        matchesDbService.getOneMatch.mockResolvedValue(
            matchFixture(new Date('2024-09-15T00:00:00.000Z')),
        );
        seasonPassesDbService.findById.mockResolvedValue(
            passFixture({ seasonStartYear: 2024 }),
        );
    });

    function allocation(overrides: Partial<SaleAllocationDto> = {}): SaleAllocationDto {
        return {
            seasonPassId: passId,
            nbTickets: 1 as TicketCount,
            ...overrides,
        };
    }

    describe('when allocations is empty', () => {
        it('rejects with SALE_INVALID_ALLOCATIONS', async () => {
            await expect(validator.validate(userId, matchId, [])).rejects.toMatchObject({
                code: ErrorCode.SALE_INVALID_ALLOCATIONS,
            });
        });
    });

    describe('when the same season pass is allocated twice', () => {
        it('rejects with SALE_INVALID_ALLOCATIONS', async () => {
            await expect(
                validator.validate(userId, matchId, [allocation(), allocation()]),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_INVALID_ALLOCATIONS });
        });
    });

    describe('when the match does not exist', () => {
        it('rejects with MATCH_NOT_FOUND', async () => {
            matchesDbService.getOneMatch.mockResolvedValue(null);

            await expect(
                validator.validate(userId, matchId, [allocation()]),
            ).rejects.toMatchObject({ code: ErrorCode.MATCH_NOT_FOUND });
        });
    });

    describe('when the season pass does not exist', () => {
        it('rejects with SALE_ALLOCATION_PASS_MISMATCH', async () => {
            seasonPassesDbService.findById.mockResolvedValue(null);

            await expect(
                validator.validate(userId, matchId, [allocation()]),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH });
        });
    });

    describe('when the season pass belongs to a different user', () => {
        it('rejects with SALE_ALLOCATION_PASS_MISMATCH', async () => {
            seasonPassesDbService.findById.mockResolvedValue(
                passFixture({
                    userId: 'other-user' as typeof userId,
                    seasonStartYear: 2024,
                }),
            );

            await expect(
                validator.validate(userId, matchId, [allocation()]),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH });
        });
    });

    describe('when the season pass is from a different season than the match', () => {
        it('rejects with SALE_ALLOCATION_PASS_MISMATCH', async () => {
            matchesDbService.getOneMatch.mockResolvedValue(
                matchFixture(new Date('2023-09-15T00:00:00.000Z')),
            );

            await expect(
                validator.validate(userId, matchId, [allocation()]),
            ).rejects.toMatchObject({ code: ErrorCode.SALE_ALLOCATION_PASS_MISMATCH });
        });
    });

    describe('when every allocation is valid', () => {
        it('resolves without throwing', async () => {
            await expect(
                validator.validate(userId, matchId, [allocation()]),
            ).resolves.toBeUndefined();
        });

        it('looks up each allocated season pass by id', async () => {
            const otherPassId = 'pass-uuid-2' as SeasonPassId;
            seasonPassesDbService.findById.mockResolvedValue(
                passFixture({ seasonStartYear: 2024 }),
            );

            await validator.validate(userId, matchId, [
                allocation(),
                allocation({ seasonPassId: otherPassId }),
            ]);

            expect(seasonPassesDbService.findById).toHaveBeenCalledWith(passId);
            expect(seasonPassesDbService.findById).toHaveBeenCalledWith(otherPassId);
        });
    });
});
