import { DraftRowDto } from './draft-row.dto';

export type PreviewResponse = {
    rows: DraftRowDto[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
    };
    missingMatches: {
        matchId: string;
        date: string;
        opponentName: string;
    }[];
    seasonStartYear: number;
};
