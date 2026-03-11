import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersService } from './users/users.service';
import { SalesService } from './sales/sales.service';
import { MatchesService } from './matches/matches.service';
import { AccountingService } from './accounting/accounting.service';
import { IAccountingDbService } from './accounting/accounting.db.interface';
import { IMatchesDbService } from './matches/matches.db.interface';
import { ISalesDbService } from './sales/sales.db.interface';
import { IUsersDbService } from './users/users.db.interface';

@Module({
    providers: [
        PrismaService,
        { provide: IUsersDbService, useClass: UsersService },
        { provide: ISalesDbService, useClass: SalesService },
        { provide: IMatchesDbService, useClass: MatchesService },
        { provide: IAccountingDbService, useClass: AccountingService },
    ],
    exports: [IUsersDbService, ISalesDbService, IMatchesDbService, IAccountingDbService],
})
export class DbModule {}
