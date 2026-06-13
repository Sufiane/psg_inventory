import type { MatchId } from '@psg/shared';

export type MatchRealizedProfit = {
    matchId: MatchId;
    date: Date;
    opponent: string;
    competition: string;
    atHome: boolean;
    matchProfit: number;
};
