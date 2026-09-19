import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { FootballDataModule } from '../../football-data/football-data.module';
import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { UsersDbModule } from '../../db/users/users.db.module';
import { RedisModule } from '../../redis/redis.module';
import { IAdminService } from './interfaces/admin.service.interface';

@Module({
    imports: [FootballDataModule, MatchesDbModule, UsersDbModule, RedisModule],
    controllers: [AdminController],
    providers: [{ provide: IAdminService, useClass: AdminService }],
})
export class AdminModule {}
