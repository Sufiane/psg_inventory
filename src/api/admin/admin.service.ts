import { Injectable, Logger } from '@nestjs/common';
import type { Email } from '@psg/shared/strings';

import { DomainException } from '../../common/exceptions/domain.exception';
import { ErrorCode } from '../../common/exceptions/error-codes.enum';
import { FootballDataService } from '../../football-data/football-data.service';
import { IMatchesDbService } from '../../db/matches/matches.db.interface';
import { IUsersDbService } from '../../db/users/users.db.interface';
import { RedisService } from '../../redis/redis.service';
import CACHE_KEYS from '../../redis/CACHE_KEYS';
import { CreateMatchDto } from './dto/create-match.dto';
import { PSG_ID } from '../../shared/constants';
import { IAdminService } from './interfaces/admin.service.interface';
import { CacheFlushResult } from './types/cache-flush-result.type';

@Injectable()
export class AdminService implements IAdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private readonly footballDataService: FootballDataService,
        private readonly matchsDbService: IMatchesDbService,
        private readonly usersDbService: IUsersDbService,
        private readonly redisService: RedisService,
    ) {}

    async loadMatches(seasonStartYear?: number): Promise<void> {
        const psgMatches = await this.footballDataService.getTeamMatches(
            PSG_ID,
            seasonStartYear,
        );

        this.logger.log(`Loading ${psgMatches.length} matches.`);

        await this.matchsDbService.loadMatches(psgMatches);
    }

    async createMatch(payload: CreateMatchDto): Promise<void> {
        try {
            await this.matchsDbService.createMatch(payload);
        } catch (e) {
            this.logger.error('match_creation_failed', {
                error: JSON.stringify(e, Object.getOwnPropertyNames(e)),
            });

            throw new DomainException(ErrorCode.MATCH_CREATION_FAILED);
        }
    }

    async flushUserCache(email: Email): Promise<CacheFlushResult[]> {
        const user = await this.usersDbService.findOneByEmail(email);

        if (!user) {
            throw new DomainException(ErrorCode.USER_NOT_FOUND);
        }

        const targets: { key: CacheFlushResult['key']; run: () => Promise<void> }[] = [
            {
                key: 'accounting',
                run: () =>
                    this.redisService.invalidatePattern(
                        CACHE_KEYS.invalidateAccounting(user.id),
                    ),
            },
            {
                key: 'sales',
                run: () =>
                    this.redisService.invalidatePattern(
                        CACHE_KEYS.invalidateSales(user.id),
                    ),
            },
            {
                key: 'season-passes',
                run: () =>
                    this.redisService.invalidatePattern(
                        CACHE_KEYS.invalidateSeasonPasses(user.id),
                    ),
            },
            {
                key: 'user-by-email',
                run: () =>
                    this.redisService.invalidate(CACHE_KEYS.userByEmail(user.email)),
            },
        ];

        const settled = await Promise.allSettled(targets.map((target) => target.run()));

        return settled.map((result, index) => ({
            key: targets[index]!.key,
            status: result.status === 'fulfilled' ? 'ok' : 'failed',
            ...(result.status === 'rejected' ? { error: String(result.reason) } : {}),
        }));
    }
}
