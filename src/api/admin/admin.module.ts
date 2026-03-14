import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { FootballDataModule } from '../../football-data/football-data.module';
import { DbModule } from '../../db/db.module';
import { IAdminService } from './interfaces/admin.service.interface';

@Module({
    imports: [FootballDataModule, DbModule],
    controllers: [AdminController],
    providers: [{ provide: IAdminService, useClass: AdminService }],
})
export class AdminModule {}
