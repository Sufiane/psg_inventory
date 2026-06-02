import { Injectable } from '@nestjs/common';

import { ISeasonPassesDbService } from '../../db/season-passes/season-passes.db.interface';
import { SeasonPass } from '../../db/season-passes/type/season-pass.type';
import { UpsertSeasonPassDto } from './dto/upsert-season-pass.dto';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';

function seasonStartYearFromDate(date: Date): number {
    return date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();
}

@Injectable()
export class SeasonPassesService implements ISeasonPassesService {
    constructor(private readonly db: ISeasonPassesDbService) {}

    findCurrentSeason(userId: string): Promise<SeasonPass | null> {
        const year = seasonStartYearFromDate(new Date());

        return this.db.findBySeason(userId, year);
    }

    findBySeason(userId: string, seasonStartYear: number): Promise<SeasonPass | null> {
        return this.db.findBySeason(userId, seasonStartYear);
    }

    findAll(userId: string): Promise<SeasonPass[]> {
        return this.db.findAll(userId);
    }

    upsert(
        userId: string,
        seasonStartYear: number,
        payload: UpsertSeasonPassDto,
    ): Promise<SeasonPass> {
        return this.db.upsert({
            userId,
            seasonStartYear,
            price: payload.price,
            category: payload.category ?? null,
            row: payload.row ?? null,
            seat: payload.seat ?? null,
        });
    }

    remove(userId: string, seasonStartYear: number): Promise<void> {
        return this.db.remove(userId, seasonStartYear);
    }
}
