import { SaleStatus } from '@prisma/client';
import { AccountingAggregate } from './types/get-accounting.type';

export abstract class IAccountingDbService {
    abstract getAccounting(
        userId: string,
        status: SaleStatus,
        from: Date,
        to?: Date,
    ): Promise<AccountingAggregate | null>;
}
