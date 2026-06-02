import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersService } from './users/users.service';
import { SalesService } from './sales/sales.service';
import { MatchesService } from './matches/matches.service';
import { AccountingService } from './accounting/accounting.service';
import { SeasonPassesService } from './season-passes/season-passes.service';
import { IAccountingDbService } from './accounting/accounting.db.interface';
import { IMatchesDbService } from './matches/matches.db.interface';
import { ISalesDbService } from './sales/sales.db.interface';
import { IUsersDbService } from './users/users.db.interface';
import { ISeasonPassesDbService } from './season-passes/season-passes.db.interface';

@Module({
    providers: [
        PrismaService,
        { provide: IUsersDbService, useClass: UsersService },
        { provide: ISalesDbService, useClass: SalesService },
        { provide: IMatchesDbService, useClass: MatchesService },
        { provide: IAccountingDbService, useClass: AccountingService },
        { provide: ISeasonPassesDbService, useClass: SeasonPassesService },
    ],
    exports: [
        IUsersDbService,
        ISalesDbService,
        IMatchesDbService,
        IAccountingDbService,
        ISeasonPassesDbService,
    ],
})
export class DbModule {}
