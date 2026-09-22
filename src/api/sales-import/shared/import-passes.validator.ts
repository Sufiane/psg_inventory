import { Injectable } from '@nestjs/common';

import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';

// Moved verbatim from SalesImportService.assertPasses (PSG-26): both
// SalesImportService.preview and CommitSalesImportUsecase need exactly this
// check, so it lives in the module's shared folder (mirroring
// src/api/sales/shared/sale-allocations.validator.ts) rather than inside one
// usecase's internals.
@Injectable()
export class ImportPassesValidator {
    constructor(private readonly seasonPassesDb: ISeasonPassesDbService) {}

    async validate(userId: UserId, selectedPassIds: string[]): Promise<SeasonYear> {
        const passes = await Promise.all(
            selectedPassIds.map((id) => this.seasonPassesDb.findById(id as SeasonPassId)),
        );
        const years = new Set<number>();

        for (const pass of passes) {
            if (pass == null) {
                throw new DomainException(ErrorCode.SEASON_PASS_NOT_FOUND);
            }

            if (pass.userId !== userId) {
                throw new DomainException(ErrorCode.SEASON_PASS_FORBIDDEN);
            }

            years.add(pass.seasonStartYear);
        }

        if (years.size !== 1) {
            throw new DomainException(ErrorCode.IMPORT_PASSES_MIXED_SEASONS);
        }

        return [...years][0]! as SeasonYear;
    }
}
