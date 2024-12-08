import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { DbModule } from '../../db/db.module';
import { MatchesController } from './matches.controller';

@Module({
    imports: [DbModule],
    controllers: [MatchesController],
    providers: [MatchesService],
})
export class MatchesModule {
}
