import type { Email } from '@psg/shared/strings';
import { CreateMatchDto } from '../dto/create-match.dto';
import { CacheFlushResult } from '../types/cache-flush-result.type';

export abstract class IAdminService {
    abstract loadMatches(seasonStartYear?: number): Promise<void>;
    abstract createMatch(payload: CreateMatchDto): Promise<void>;
    abstract flushUserCache(email: Email): Promise<CacheFlushResult[]>;
}
