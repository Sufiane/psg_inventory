import { Module } from '@nestjs/common';
import { MatchsService } from './matches.service';
import { DbModule } from '../../db/db.module';
import { MatchesController } from './matches.controller';

@Module({
    imports: [DbModule],
    controllers: [MatchesController],
    providers: [MatchsService],
})
export class MatchesModule {
}
