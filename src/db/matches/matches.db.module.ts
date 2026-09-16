import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma.module';
import { MatchesDb } from './matches.db';
import { IMatchesDbService } from './matches.db.interface';

@Module({
    imports: [PrismaModule],
    providers: [{ provide: IMatchesDbService, useClass: MatchesDb }],
    exports: [IMatchesDbService],
})
export class MatchesDbModule {}
