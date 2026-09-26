import { Injectable } from '@nestjs/common';
import type { UserId } from '@psg/shared/ids';
import type { SeasonYear } from '@psg/shared/time';
import { getSeasonWindow } from '../../../../shared/utils/season.utils';
import { RedisService } from '../../../../redis/redis.service';
import CACHE_KEYS from '../../../../redis/CACHE_KEYS';
import { ONE_DAY_TTL } from '../../../../shared/constants';
import { Amortization, AmortizationMatchRow } from '../../types/amortization.type';
import { IGetAmortizationUsecaseDb } from './get-amortization.usecase.db';

export abstract class IGetAmortizationUsecase {
    abstract execute(userId: UserId, seasonStartYear: SeasonYear): Promise<Amortization>;
}

@Injectable()
export class GetAmortizationUsecase implements IGetAmortizationUsecase {
    constructor(
        private readonly db: IGetAmortizationUsecaseDb,
        private readonly redisService: RedisService,
    ) {}

    async execute(userId: UserId, seasonStartYear: SeasonYear): Promise<Amortization> {
        const result = await this.redisService.get(
            CACHE_KEYS.amortization(userId, seasonStartYear),
            ONE_DAY_TTL,
            async () => {
                const dates = getSeasonWindow(seasonStartYear, 'inclusive');

                const [passes, matchRows] = await Promise.all([
                    this.db.findBySeason(userId, seasonStartYear),
                    this.db.getRealizedProfitPerMatch(userId, dates.start, dates.end),
                ]);

                const hasPass = passes.length > 0;
                const passPrice = passes.reduce((sum, pass) => sum + pass.price, 0);
                const passSummaries = passes.map((pass) => ({
                    id: pass.id,
                    label: pass.label,
                    price: pass.price,
                }));

                let cumulative = 0;
                let breakEvenAssigned = false;

                const perMatch: AmortizationMatchRow[] = matchRows.map((row) => {
                    cumulative += row.matchProfit;

                    const isBreakEven =
                        !breakEvenAssigned &&
                        hasPass &&
                        passPrice > 0 &&
                        cumulative >= passPrice;

                    if (isBreakEven) {
                        breakEvenAssigned = true;
                    }

                    return {
                        matchId: row.matchId,
                        date: row.date,
                        opponent: row.opponent,
                        competition: row.competition,
                        atHome: row.atHome,
                        matchProfit: row.matchProfit,
                        cumulative,
                        isBreakEven,
                    };
                });

                const totalRealized = cumulative;
                const breakEvenRow = perMatch.find((row) => row.isBreakEven) ?? null;

                const amortization: Amortization = {
                    seasonStartYear,
                    passPrice,
                    hasPass,
                    totalRealized,
                    progress:
                        hasPass && passPrice > 0
                            ? Math.min(1, totalRealized / passPrice)
                            : 0,
                    remaining:
                        hasPass && passPrice > 0
                            ? Math.max(0, passPrice - totalRealized)
                            : 0,
                    surplus:
                        hasPass && passPrice > 0
                            ? Math.max(0, totalRealized - passPrice)
                            : Math.max(0, totalRealized),
                    breakEven: breakEvenRow
                        ? {
                              matchId: breakEvenRow.matchId,
                              date: breakEvenRow.date,
                              opponent: breakEvenRow.opponent,
                              cumulative: breakEvenRow.cumulative,
                          }
                        : null,
                    perMatch,
                    passes: passSummaries,
                };

                return amortization;
            },
        );

        return result ?? emptyAmortization(seasonStartYear);
    }
}

function emptyAmortization(seasonStartYear: number): Amortization {
    return {
        seasonStartYear,
        passPrice: 0,
        hasPass: false,
        totalRealized: 0,
        progress: 0,
        remaining: 0,
        surplus: 0,
        breakEven: null,
        perMatch: [],
        passes: [],
    };
}
