import type { MatchScore, OpponentName } from '@psg/shared/strings';

export type FormattedMatch = {
    competition: string;
    date: string;
    atHome: boolean;
    opponent: OpponentName;
    result?: {
        isWin: boolean;
        score: MatchScore;
    };
};
