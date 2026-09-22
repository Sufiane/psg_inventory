import { Injectable } from '@nestjs/common';

import type { MatchId, UserId } from '@psg/shared/ids';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { IMatchesDbService } from '../../../db/matches/matches.db.interface';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { SaleAllocationInput } from '../../../db/sales/sales.db.interface';
import { seasonStartYearFromDate } from '../../../shared/utils/season.utils';
import { SaleAllocationDto } from '../dto/sale-allocation.dto';

@Injectable()
export class SaleAllocationsValidator {
    constructor(
        private readonly matchesDbService: IMatchesDbService,
        private readonly seasonPassesDbService: ISeasonPassesDbService,
    ) {}

    async validate(
        userId: UserId,
        matchId: MatchId,
        allocations: SaleAllocationDto[] | SaleAllocationInput[],
    ): Promise<void> {
        if (allocations.length === 0) {
            throw new DomainException(ErrorCode.SALE_INVALID_ALLOCATIONS);
        }

        const seen = new Set<string>();

        for (const allocation of allocations) {
            if (seen.has(allocation.seasonPassId)) {
                throw new DomainException(ErrorCode.SALE_INVALID_ALLOCATIONS);
            }

            seen.add(allocation.seasonPassId);
        }

        const match = await this.matchesDbService.getOneMatch(matchId);

        if (match == null) {
            throw new DomainException(ErrorCode.MATCH_NOT_FOUND);
        }

        const matchSeason = seasonStartYearFromDate(match.date);

        for (const allocation of allocations) {
            const pass = await this.seasonPassesDbService.findById(
                allocation.seasonPassId,
            );

            if (pass == null || pass.userId !== userId) {
                throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            }

            if (pass.seasonStartYear !== matchSeason) {
                throw new DomainException(ErrorCode.SALE_ALLOCATION_PASS_MISMATCH);
            }
        }
    }
}
