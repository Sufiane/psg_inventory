import { Injectable } from '@nestjs/common';
import { CurrentSeasonAccounting } from './types/current-season-accounting.type';
import {
    AccountingService as AccountingDbService
} from '../../db/accounting/accounting.service';
import { SalesService as SalesDbService } from '../../db/sales.service';
import { formatAggregate } from "./accounting.utils";

@Injectable()
export class AccountingService {
    constructor(
        private readonly accountingDbService: AccountingDbService,
        private readonly salesDbService: SalesDbService,
    ) {
    }

    async getCurrentSeason(userId: string): Promise<CurrentSeasonAccounting | null> {
        const aggregate =
            await this.accountingDbService.getCurrentSeasonAggregate(userId);

        if (!aggregate) {
            return null;
        }

        const [lowestMatch, highestMatch] = await Promise.all([
            this.salesDbService.getOneByWithFullMatch(
                { profit: aggregate._min.profit ?? undefined }),
            this.salesDbService.getOneByWithFullMatch(
                { profit: aggregate._min.listedPrice ?? undefined }),
        ]);

        return formatAggregate({
            sum: aggregate._sum,
            avg: aggregate._avg,
            min: {
                ...aggregate._min,
                match: {
                    ...lowestMatch.Match,
                    opponent: lowestMatch.Match.Opponent.name
                }
            },
            max: {
                ...aggregate._max,
                match: {
                    ...highestMatch.Match,
                    opponent: highestMatch.Match.Opponent.name
                }
            },
        })
    }

    async getAllTime(
        userId: string,
        userCreationDate: Date,
    ): Promise<CurrentSeasonAccounting | null> {
        const aggregate = await this.accountingDbService.getAllTimeAggregate(
            userId,
            userCreationDate,
        );

        if (!aggregate) {
            return null;
        }

        const [lowestMatch, highestMatch] = await Promise.all([
            this.salesDbService.getOneByWithFullMatch(
                { profit: aggregate._min.profit ?? undefined }),
            this.salesDbService.getOneByWithFullMatch(
                { profit: aggregate._min.listedPrice ?? undefined }),
        ]);

        return formatAggregate({
            sum: aggregate._sum,
            avg: aggregate._avg,
            min: {
                ...aggregate._min,
                match: {
                    ...lowestMatch.Match,
                    opponent: lowestMatch.Match.Opponent.name
                }
            },
            max: {
                ...aggregate._max,
                match: {
                    ...highestMatch.Match,
                    opponent: highestMatch.Match.Opponent.name
                }
            },
        })
    }
}
