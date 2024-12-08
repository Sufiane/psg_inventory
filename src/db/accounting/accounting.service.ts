import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { getCurrentSeasonDate } from '../../shared/utils/season.utils';
import { AccountingAggregate } from "./types/get-accounting.type";

@Injectable()
export class AccountingService extends PrismaService {

    async getAccounting(
        userId: string,
        from: Date,
        to?: Date
    ): Promise<AccountingAggregate | null> {
        const dbResult = await this.sales.aggregate(
            {
                _sum: {
                    profit: true,
                    nbTickets: true,
                    invest: true,
                    listedPrice: true,
                },
                _avg: {
                    profit: true,
                    nbTickets: true,
                    invest: true,
                    listedPrice: true,
                },
                _min: {
                    profit: true,
                    listedPrice: true,
                },
                _max: {
                    profit: true,
                    listedPrice: true,
                },
                where: {
                    userId,
                    Match: {
                        date: {
                            gte: from,
                            lte: to,
                        },
                    },
                },
            },
        );

        // if we can't get the total of one of the values
        // it means we couldn't get any values
        if (dbResult._sum.listedPrice === null) {
            return null;
        }

        return dbResult as unknown as Promise<AccountingAggregate>;
    }

    async getCurrentSeasonAggregate(userId: string): Promise<AccountingAggregate | null> {
        const { start: seasonStart, end: seasonEnd } = getCurrentSeasonDate();

        return this.getAccounting(userId, seasonStart, seasonEnd);
    }

    async getAllTimeAggregate(
        userId: string,
        userCreationDate: Date
    ): Promise<AccountingAggregate | null> {
        return this.getAccounting(userId, userCreationDate);
    }
}
