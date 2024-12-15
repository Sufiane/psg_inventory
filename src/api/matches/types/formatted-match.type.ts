export type FormattedMatch = {
    id: string;
    date: string;
    atHome: boolean;
    competition: string;
    opponent: string;
    result:
        | {
              isWin: boolean | undefined;
              score: string | undefined;
          }
        | undefined;
};
