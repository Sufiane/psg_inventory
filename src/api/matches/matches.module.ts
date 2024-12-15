import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { DbModule } from '../../db/db.module';
import { MatchesController } from './matches.controller';
import { FootballDataModule } from '../../football-data/football-data.module';

@Module({
    imports: [DbModule, FootballDataModule],
    controllers: [MatchesController],
    providers: [MatchesService],
})
export class MatchesModule {}
