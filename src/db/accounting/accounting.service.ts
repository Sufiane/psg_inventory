import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AccountingAggregate } from './types/get-accounting.type';
import { omit } from 'radash';
import { Prisma } from '.prisma/client';
import { statusConverter } from './utils/status-converter.util';

@Injectable()
export class AccountingService extends PrismaService {

    async getAccounting(
        userId: string,
        status: 'realized' | 'pending' | 'unrealized',
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null> {
        const fields: Prisma.SalesSumAggregateInputType = {
            profit: true,
            nbTickets: true,
            invest: true,
            listedPrice: true,
        };

        const dbResult = await this.sales.aggregate(
            {
                _sum: fields,
                _avg: fields,
                _min: omit(fields, ['invest']),
                _max: omit(fields, ['invest']),
                where: {
                    userId,
                    status: statusConverter(status),
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
}
