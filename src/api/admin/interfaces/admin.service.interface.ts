import { CreateMatchDto } from '../dto/create-match.dto';

export abstract class IAdminService {
    abstract loadMatches(seasonStartYear?: number): Promise<void>;
    abstract createMatch(payload: CreateMatchDto): Promise<void>;
}
