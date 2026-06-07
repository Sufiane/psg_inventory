import { Injectable } from '@nestjs/common';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { CreateSeasonPassDto } from './dto/create-season-pass.dto';
import { UpdateSeasonPassDto } from './dto/update-season-pass.dto';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';

function seasonStartYearFromDate(date: Date): number {
    return date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
}

@Injectable()
export class SeasonPassesService implements ISeasonPassesService {
    constructor(private readonly db: ISeasonPassesDbService) {}

    findCurrentSeason(userId: string): Promise<SeasonPass[]> {
        const year = seasonStartYearFromDate(new Date());

        return this.db.findBySeason(userId, year);
    }

    findBySeason(userId: string, seasonStartYear: number): Promise<SeasonPass[]> {
        return this.db.findBySeason(userId, seasonStartYear);
    }

    findAll(userId: string): Promise<SeasonPass[]> {
        return this.db.findAll(userId);
    }

    async findOne(userId: string, passId: string): Promise<SeasonPass> {
        const pass = await this.loadOwned(userId, passId);

        return pass;
    }

    create(userId: string, payload: CreateSeasonPassDto): Promise<SeasonPass> {
        return this.db.create({
            userId,
            seasonStartYear: payload.seasonStartYear,
            price: payload.price,
            label: payload.label,
            category: payload.category,
            row: payload.row,
            seat: payload.seat,
        });
    }

    async update(
        userId: string,
        passId: string,
        payload: UpdateSeasonPassDto,
    ): Promise<SeasonPass> {
        await this.loadOwned(userId, passId);

        return this.db.update(passId, {
            price: payload.price,
            label: payload.label,
            category: payload.category,
            row: payload.row,
            seat: payload.seat,
        });
    }

    async remove(userId: string, passId: string): Promise<void> {
        await this.loadOwned(userId, passId);
        const allocationCount = await this.db.countAllocations(passId);

        if (allocationCount > 0) {
            throw new DomainException(ErrorCode.SEASON_PASS_HAS_ALLOCATIONS);
        }

        await this.db.remove(passId);
    }

    private async loadOwned(userId: string, passId: string): Promise<SeasonPass> {
        const pass = await this.db.findById(passId);

        if (pass == null) {
            throw new DomainException(ErrorCode.SEASON_PASS_NOT_FOUND);
        }

        if (pass.userId !== userId) {
            throw new DomainException(ErrorCode.SEASON_PASS_FORBIDDEN);
        }

        return pass;
    }
}
