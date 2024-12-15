import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { FootballDataModule } from '../../football-data/football-data.module';
import { DbModule } from '../../db/db.module';

@Module({
    imports: [FootballDataModule, DbModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
