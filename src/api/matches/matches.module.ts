import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesDbModule } from '../../db/matches/matches.db.module';
import { MatchesController } from './matches.controller';
import { IMatchesService } from './interfaces/matches.service.interface';

@Module({
    imports: [MatchesDbModule],
    controllers: [MatchesController],
    providers: [{ provide: IMatchesService, useClass: MatchesService }],
    exports: [IMatchesService],
})
export class MatchesModule {}
