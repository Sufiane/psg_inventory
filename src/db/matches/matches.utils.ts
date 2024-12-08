import { Competition } from '@prisma/client';

export function convertStringToCompetition(competition: string): Competition {
    switch (competition) {
        case 'Ligue 1':
            return Competition.CHAMPIONSHIP
        case 'UEFA Champions League':
            return Competition.CHAMPIONS_LEAGUE
        default:
            throw new Error('unknown_competition');
    }
}
