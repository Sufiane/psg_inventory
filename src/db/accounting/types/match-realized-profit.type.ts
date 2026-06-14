import type { MatchId } from '@psg/shared/ids';

export type MatchRealizedProfit = {
    matchId: MatchId;
    date: Date;
    opponent: string;
    competition: string;
    atHome: boolean;
    matchProfit: number;
};
