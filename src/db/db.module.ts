import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersService } from './users.service';
import { SalesService } from './sales.service';
import { MatchesService } from './matches.service';

@Module({
    providers: [PrismaService, UsersService, SalesService, MatchesService],
    exports: [UsersService, SalesService, MatchesService],
})
export class DbModule {
}
