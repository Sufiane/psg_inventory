export type TeamMatches = {
    filters: {
        competitions: string; // "FL1,CL",
        permission: string; // "TIER_ONE",
        limit: number;
    };
    resultSet: {
        count: number;
        competitions: string; // "FL1,CL",
        first: string; // "2024-08-16",
        last: string; // "2025-05-18",
        played: number;
        wins: number;
        draws: number;
        losses: number;
    };
    matches: MatchData[];
};

type Team = {
    id: number;
    name: string;
};

type Score = {
    winner: string; // e.g., "AWAY_TEAM"
    fullTime: {
        home: number;
        away: number;
    };
};

type Competition = {
    id: number;
    name: string;
};

export type MatchData = {
    competition: Competition;
    id: number;
    utcDate: string; // 2024-08-23T18:45:00Z
    homeTeam: Team;
    awayTeam: Team;
    score: Score;
};
