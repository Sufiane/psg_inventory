import { Module } from '@nestjs/common';

import { SeasonPassesDbModule } from '../../db/season-passes/season-passes.db.module';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';
import { SeasonPassesController } from './season-passes.controller';
import { SeasonPassesService } from './season-passes.service';

@Module({
    imports: [SeasonPassesDbModule],
    controllers: [SeasonPassesController],
    providers: [{ provide: ISeasonPassesService, useClass: SeasonPassesService }],
    exports: [ISeasonPassesService],
})
export class SeasonPassesModule {}
