import { Competition } from '@prisma/client';
import type { MatchId } from '@psg/shared/ids';
import { FormattedMatch } from '../../shared/types/formatted-match.type';
import { Match } from './types/match.type';

export abstract class IMatchesDbService {
    abstract getMatches(
        dates: { from: Date; to?: Date },
        withResult?: boolean,
    ): Promise<Match[]>;
    abstract getOneMatch(id: MatchId, withResult?: boolean): Promise<Match | null>;

    abstract loadMatches(matches: FormattedMatch[]): Promise<void>;
    abstract createMatch(payload: {
        date: string;
        atHome: boolean;
        opponent: string;
        competition: Competition;
        result?: {
            isWin: boolean;
            score: string;
        };
    }): Promise<void>;
}
