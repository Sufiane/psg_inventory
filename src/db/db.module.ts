import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersService } from './users.service';
import { SalesService } from './sales.service';
import { MatchesService } from './matches.service';
import { AccountingService } from './accounting/accounting.service';

@Module({
  providers: [
    PrismaService,
    UsersService,
    SalesService,
    MatchesService,
    AccountingService,
  ],
  exports: [UsersService, SalesService, MatchesService, AccountingService],
})
export class DbModule {
}
