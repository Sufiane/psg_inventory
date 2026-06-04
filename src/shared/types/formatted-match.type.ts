export type FormattedMatch = {
    competition: string;
    date: string;
    atHome: boolean;
    opponent: string;
    result?: {
        isWin: boolean;
        score: string;
    };
};
